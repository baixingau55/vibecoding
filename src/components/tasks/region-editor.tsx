"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DeviceRef, RegionPoint, RegionShape } from "@/lib/types";

const DEFAULT_STAGE_WIDTH = 560;
const DEFAULT_STAGE_HEIGHT = 330;
const MAX_REGIONS = 4;
const MAX_POINTS = 8;

type MediaRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PreviewState =
  | { url: string; source: "latest-result" | "fallback-device"; imageTime?: string }
  | { url: string; source: "local-fallback"; imageTime?: string };

function toCanvasPoint(point: RegionPoint, rect: MediaRect) {
  return {
    x: (point.x / 10000) * rect.width,
    y: (point.y / 10000) * rect.height
  };
}

function toNormalizedPoint(x: number, y: number, rect: MediaRect): RegionPoint {
  return {
    x: Math.round((x / rect.width) * 10000),
    y: Math.round((y / rect.height) * 10000)
  };
}

const demoRegion: RegionPoint[] = [
  { x: 2200, y: 1400 },
  { x: 7200, y: 1400 },
  { x: 7100, y: 7400 },
  { x: 2800, y: 7200 }
];

function getContainedRect(containerWidth: number, containerHeight: number, mediaWidth: number, mediaHeight: number): MediaRect {
  const mediaRatio = mediaWidth / mediaHeight;
  const containerRatio = containerWidth / containerHeight;

  if (mediaRatio > containerRatio) {
    const width = containerWidth;
    const height = width / mediaRatio;
    return {
      left: 0,
      top: (containerHeight - height) / 2,
      width,
      height
    };
  }

  const height = containerHeight;
  const width = height * mediaRatio;
  return {
    left: (containerWidth - width) / 2,
    top: 0,
    width,
    height
  };
}

export function RegionEditor({
  device,
  regions,
  onChange
}: {
  device: DeviceRef | null;
  regions: RegionShape[];
  onChange: (regions: RegionShape[]) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<RegionPoint[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState("左键单击开始绘制，双击或右键结束绘制。");
  const [stageSize, setStageSize] = useState({ width: DEFAULT_STAGE_WIDTH, height: DEFAULT_STAGE_HEIGHT });
  const [imageSize, setImageSize] = useState({ width: DEFAULT_STAGE_WIDTH, height: DEFAULT_STAGE_HEIGHT });
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    setDraft([]);
    setEditingId(null);
    setDragIndex(null);
  }, [device?.qrCode]);

  useEffect(() => {
    function stopDrag() {
      setDragIndex(null);
    }
    window.addEventListener("pointerup", stopDrag);
    return () => window.removeEventListener("pointerup", stopDrag);
  }, []);

  useEffect(() => {
    if (!stageRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height
      });
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    if (!device) {
      setPreview(null);
      setPreviewError("");
      return undefined;
    }

    setPreviewLoading(true);
    setPreviewError("");
    void fetch(`/api/devices/${device.qrCode}/preview?profileId=${device.profileId ?? ""}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load device preview.");
        }
        return response.json() as Promise<PreviewState>;
      })
      .then((payload) => {
        if (!active) return;
        setPreview(payload);
      })
      .catch(() => {
        if (!active) return;
        setPreview({
          url: device.previewImage,
          source: "local-fallback"
        });
        setPreviewError("未获取到实时预览，当前使用最近抓拍或默认底图。");
      })
      .finally(() => {
        if (active) {
          setPreviewLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [device]);

  const mediaRect = useMemo(
    () => getContainedRect(stageSize.width, stageSize.height, imageSize.width, imageSize.height),
    [imageSize.height, imageSize.width, stageSize.height, stageSize.width]
  );

  const polygons = useMemo(() => regions.map((region) => region.points.map((point) => toCanvasPoint(point, mediaRect))), [mediaRect, regions]);
  const draftPolygon = useMemo(() => draft.map((point) => toCanvasPoint(point, mediaRect)), [draft, mediaRect]);

  if (!device) {
    return (
      <div className="region-editor-empty">
        <p>请先添加一台巡检设备，再配置对应的检测区域。</p>
      </div>
    );
  }

  function relativePosition(clientX: number, clientY: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const rawX = clientX - rect.left;
    const rawY = clientY - rect.top;
    const boundedX = rawX - mediaRect.left;
    const boundedY = rawY - mediaRect.top;

    if (boundedX < 0 || boundedY < 0 || boundedX > mediaRect.width || boundedY > mediaRect.height) {
      return null;
    }

    return { x: boundedX, y: boundedY };
  }

  function saveRegion(points = draft) {
    if (points.length < 3) {
      setNotice("至少需要 3 个点才能形成有效区域。");
      return;
    }

    if (editingId === null && regions.length >= MAX_REGIONS) {
      setNotice(`最多可配置 ${MAX_REGIONS} 个检测区域。`);
      return;
    }

    const nextRegion: RegionShape = {
      id: editingId ?? Math.max(0, ...regions.map((item) => item.id)) + 1,
      points
    };

    const nextRegions =
      editingId === null
        ? [...regions, nextRegion].slice(0, MAX_REGIONS)
        : regions.map((item) => (item.id === editingId ? nextRegion : item));

    onChange(nextRegions);
    setDraft([]);
    setEditingId(null);
    setNotice("检测区域已保存。");
  }

  function handleStageClick(event: React.MouseEvent<HTMLDivElement>) {
    if (dragIndex !== null) return;
    if (draft.length === 0 && editingId === null && regions.length >= MAX_REGIONS) {
      setNotice(`最多可配置 ${MAX_REGIONS} 个检测区域。`);
      return;
    }
    if (draft.length >= MAX_POINTS) return;

    const point = relativePosition(event.clientX, event.clientY);
    if (!point) return;

    setDraft((current) => {
      const next = [...current, toNormalizedPoint(point.x, point.y, mediaRect)];
      if (next.length >= 3) {
        setNotice("已满足成面条件，双击或右键即可结束绘制。");
      }
      if (next.length === MAX_POINTS) {
        queueMicrotask(() => saveRegion(next));
        return [];
      }
      return next;
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragIndex === null) return;
    const point = relativePosition(event.clientX, event.clientY);
    if (!point) return;
    setDraft((current) => current.map((item, index) => (index === dragIndex ? toNormalizedPoint(point.x, point.y, mediaRect) : item)));
  }

  return (
    <div className="region-editor">
      <div className="region-toolbar">
        <div>
          <strong>{device.name}</strong>
          <p>{device.groupName}</p>
        </div>
        <div className="tplink-message-actions">
          <button
            type="button"
            className="tplink-chip"
            onClick={() => {
              setDraft([]);
              setEditingId(null);
              setNotice("已清空当前草稿。");
            }}
          >
            清空草稿
          </button>
          <button
            type="button"
            className="tplink-chip"
            onClick={() => {
              setDraft(demoRegion);
              setEditingId(null);
              setNotice("已恢复示例区域，可继续调整。");
            }}
          >
            恢复示例
          </button>
          <button
            type="button"
            className="tplink-action-button"
            style={{ minWidth: 92 }}
            onClick={() => saveRegion()}
            disabled={draft.length < 3}
          >
            {editingId === null ? "保存区域" : "更新区域"}
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="region-stage"
        onClick={handleStageClick}
        onDoubleClick={() => saveRegion()}
        onContextMenu={(event) => {
          event.preventDefault();
          saveRegion();
        }}
        onPointerMove={handlePointerMove}
      >
        {preview?.url ? (
          <img
            src={preview.url}
            alt={device.name}
            className="region-stage-image"
            onLoad={(event) => {
              const target = event.currentTarget;
              setImageSize({
                width: target.naturalWidth || DEFAULT_STAGE_WIDTH,
                height: target.naturalHeight || DEFAULT_STAGE_HEIGHT
              });
            }}
          />
        ) : null}

        <div
          className="region-stage-overlay"
          style={{
            left: mediaRect.left,
            top: mediaRect.top,
            width: mediaRect.width,
            height: mediaRect.height
          }}
        >
          <svg viewBox={`0 0 ${mediaRect.width} ${mediaRect.height}`} aria-label="检测区域编辑器">
            {polygons.map((polygon, index) => (
              <polygon
                key={`${regions[index]?.id ?? index}`}
                points={polygon.map((point) => `${point.x},${point.y}`).join(" ")}
                className="saved-polygon"
                onClick={(event) => {
                  event.stopPropagation();
                  setDraft(regions[index]?.points ?? []);
                  setEditingId(regions[index]?.id ?? null);
                  setNotice(`正在编辑区域 ${regions[index]?.id ?? index + 1}。`);
                }}
              />
            ))}

            {draftPolygon.length >= 2 ? (
              <polyline points={draftPolygon.map((point) => `${point.x},${point.y}`).join(" ")} className="draft-polyline" />
            ) : null}

            {draftPolygon.map((point, index) => (
              <circle
                key={`point-${index}`}
                cx={point.x}
                cy={point.y}
                r={6}
                className="draft-point"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setDragIndex(index);
                }}
              />
            ))}
          </svg>
        </div>

        {previewLoading ? <div className="region-stage-badge">正在加载预览底图...</div> : null}
        {!previewLoading && preview ? (
          <div className="region-stage-badge">
            {preview.source === "latest-result" ? "当前使用最近抓拍底图" : "当前使用默认底图"}
          </div>
        ) : null}
      </div>

      <div className="region-help">
        <p>{notice}</p>
        <p>
          当前支持最多 {MAX_REGIONS} 个区域、每个区域最多 {MAX_POINTS} 个顶点。坐标保存为归一化点位，回显时按真实底图显示区域做换算。
        </p>
        {previewError ? <p>{previewError}</p> : null}
      </div>

      <div className="region-list">
        {regions.length === 0 ? <p className="tplink-muted">当前设备还没有已保存的检测区域。</p> : null}
        {regions.map((region) => (
          <div key={region.id} className="region-item">
            <div>
              <strong>区域 {region.id}</strong>
              <p>{region.points.length} 个顶点</p>
            </div>
            <div className="tplink-message-actions">
              <button
                type="button"
                className="tplink-chip"
                onClick={() => {
                  setDraft(region.points);
                  setEditingId(region.id);
                  setNotice(`正在编辑区域 ${region.id}。`);
                }}
              >
                编辑
              </button>
              <button
                type="button"
                className="tplink-chip"
                style={{ color: "#ff5e57" }}
                onClick={() => {
                  onChange(regions.filter((item) => item.id !== region.id));
                  setNotice(`已删除区域 ${region.id}。`);
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
