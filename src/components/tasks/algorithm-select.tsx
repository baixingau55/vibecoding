"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Search } from "lucide-react";

import type { Algorithm } from "@/lib/types";

const categories = [
  "通用安防",
  "连锁企业",
  "社区园区",
  "数字乡村",
  "交通运输",
  "应急管理",
  "交警行业",
  "公安行业",
  "城管市政",
  "水利水务",
  "能源治金"
];

const usagePalette = ["2363475", "236475", "1636475", "6475"];

function getDisplayCardId(baseId: string, index: number) {
  return `${baseId}__display_${index}`;
}

function getBaseAlgorithmId(displayId: string) {
  const marker = "__display_";
  const markerIndex = displayId.indexOf(marker);
  return markerIndex === -1 ? displayId : displayId.slice(0, markerIndex);
}

export function AlgorithmSelect({ algorithms }: { algorithms: Algorithm[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"standard" | "custom">("standard");
  const [category, setCategory] = useState("通用安防");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(algorithms[0]?.id ?? "");

  const displayAlgorithms = useMemo(() => {
    const baseList =
      algorithms.length > 0
        ? algorithms
        : [
            {
              id: "placeholder",
              name: "口罩检测",
              introduction: "通过摄像头实时监测指定区域内的工作人员是否存在离岗行为算法介绍内容算法介绍内容算法介绍内容算法介绍内容算法介绍内容",
              latestVersion: "1.1",
              versionList: ["1.1"],
              categories: ["通用安防"],
              active: true,
              source: "mock" as const
            }
          ];

    const filtered = mode === "custom"
      ? []
      : baseList.filter((item) => {
          if (query.trim() && !item.name.includes(query.trim())) {
            return false;
          }

          if (category === "通用安防") {
            return true;
          }

          return item.categories.length === 0 || item.categories.includes(category);
        });

    const seeded = filtered.length > 0 ? filtered : baseList.slice(0, 1);

    return Array.from({ length: 12 }, (_, index) => {
      const seed = seeded[index % seeded.length];
      return {
        ...seed,
        id: getDisplayCardId(seed.id, index),
        usage: usagePalette[index % usagePalette.length]
      };
    });
  }, [algorithms, category, mode, query]);

  const selectedBaseId = getBaseAlgorithmId(selectedId);

  return (
    <section className="ai-algorithm-page">
      <div className="ai-algorithm-page-top">
        <Link href="/" className="ai-algorithm-intro-trigger">
          <span>AI算法功能简介</span>
          <ChevronDown size={14} strokeWidth={1.8} />
        </Link>
      </div>

      <div className="ai-algorithm-toolbar">
        <div className="ai-algorithm-segmented" role="tablist" aria-label="算法类型">
          <button
            type="button"
            className={mode === "standard" ? "ai-algorithm-segment ai-algorithm-segment-active" : "ai-algorithm-segment"}
            onClick={() => setMode("standard")}
          >
            标准算法
          </button>
          <button
            type="button"
            className={mode === "custom" ? "ai-algorithm-segment ai-algorithm-segment-active" : "ai-algorithm-segment"}
            onClick={() => setMode("custom")}
          >
            自定义算法
          </button>
        </div>

        <label className="ai-algorithm-search">
          <Search size={20} strokeWidth={1.8} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索算法" />
        </label>
      </div>

      {mode === "standard" ? (
        <>
          <div className="ai-algorithm-category-bar">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={item === category ? "ai-algorithm-category ai-algorithm-category-active" : "ai-algorithm-category"}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="ai-algorithm-card-grid">
            {displayAlgorithms.map((algorithm, index) => {
              const active = selectedBaseId === getBaseAlgorithmId(algorithm.id);

              return (
                <button
                  key={algorithm.id}
                  type="button"
                  className={active ? "ai-algorithm-tile ai-algorithm-tile-active" : "ai-algorithm-tile"}
                  onClick={() => {
                    setSelectedId(algorithm.id);
                    router.push(`/tasks/new?algorithmId=${getBaseAlgorithmId(algorithm.id)}`);
                  }}
                >
                  <div className="ai-algorithm-tile-title-row">
                    <div className="ai-algorithm-tile-title-wrap">
                      <strong>{algorithm.name}</strong>
                      <span className="ai-algorithm-tile-version">v{algorithm.latestVersion}</span>
                    </div>
                    <div className="ai-algorithm-tile-usage">
                      <span>累计使用</span>
                      <em>{algorithm.usage}</em>
                      <span>次</span>
                    </div>
                  </div>
                  <p>{algorithm.introduction}</p>
                  <span className="ai-algorithm-tile-link">
                    添加巡检任务 <ArrowRight size={16} strokeWidth={2} />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <section className="ai-custom-page-state">
          <div className="ai-custom-page-panel">
            <h2>自定义算法</h2>
            <p>首期仅保留入口展示。后续接入真实算法管理能力后，可在这里新增和维护自定义算法。</p>
            <button type="button" className="ai-custom-page-button" disabled>
              创建自定义算法
            </button>
          </div>
        </section>
      )}

      <div className="ai-algorithm-footer">
        <button
          type="button"
          className="ai-algorithm-primary"
          disabled={mode !== "standard" || !selectedId}
          onClick={() => router.push(`/tasks/new?algorithmId=${selectedBaseId}`)}
        >
          进入任务配置
        </button>
      </div>
    </section>
  );
}
