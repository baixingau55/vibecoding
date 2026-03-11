"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DeviceRef, RegionPoint, RegionShape } from "@/lib/types";

const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 330;
const MAX_REGIONS = 4;
const MAX_POINTS = 8;

function toCanvasPoint(point: RegionPoint) {
  return {
    x: (point.x / 10000) * CANVAS_WIDTH,
    y: (point.y / 10000) * CANVAS_HEIGHT
  };
}

function toNormalizedPoint(x: number, y: number): RegionPoint {
  return {
    x: Math.round((x / CANVAS_WIDTH) * 10000),
    y: Math.round((y / CANVAS_HEIGHT) * 10000)
  };
}

const demoRegion: RegionPoint[] = [
  { x: 2200, y: 1400 },
  { x: 7200, y: 1400 },
  { x: 7100, y: 7400 },
  { x: 2800, y: 7200 }
];

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

  const polygons = useMemo(() => regions.map((region) => region.points.map(toCanvasPoint)), [regions]);
  const draftPolygon = draft.map(toCanvasPoint);

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
    return {
      x: Math.max(0, Math.min(CANVAS_WIDTH, clientX - rect.left)),
      y: Math.max(0, Math.min(CANVAS_HEIGHT, clientY - rect.top))
    };
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
      const next = [...current, toNormalizedPoint(point.x, point.y)];
      if (next.length >= 3) {
        setNotice("已满足成面条件，双击或右键即可结束绘制。");
      }
      if (next.length === MAX_POINTS) {
        saveRegion(next);
        return [];
      }
      return next;
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragIndex === null) return;
    const point = relativePosition(event.clientX, event.clientY);
    if (!point) return;
    setDraft((current) => current.map((item, index) => (index === dragIndex ? toNormalizedPoint(point.x, point.y) : item)));
  }

  return (
    <div className="region-editor">
      <div className="region-toolbar">
        <div>
          <strong>{device.name}</strong>
          <p>{device.groupName}</p>
        </div>
        <div className="tplink-message-actions">
          <button type="button" className="tplink-chip" onClick={() => {
            setDraft([]);
            setEditingId(null);
            setNotice("已清空当前草稿。");
          }}>
            清空草稿
          </button>
          <button type="button" className="tplink-chip" onClick={() => {
            setDraft(demoRegion);
            setEditingId(null);
            setNotice("已恢复示例区域，可继续调整。");
          }}>
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
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(20, 35, 67, 0.18), rgba(20, 35, 67, 0.4)), url(${device.previewImage})`
        }}
      >
        <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} aria-label="检测区域编辑器">
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

      <div className="region-help">
        <p>{notice}</p>
        <p>当前支持最多 {MAX_REGIONS} 个区域、每个区域最多 {MAX_POINTS} 个顶点。部署前为本地预览编辑器，部署后替换为真实抓拍底图与持久化配置。</p>
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
