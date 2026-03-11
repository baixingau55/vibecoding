"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

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

export function TaskAlgorithmChooser({
  algorithms,
  returnPath = "/tasks/new"
}: {
  algorithms: Algorithm[];
  returnPath?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"standard" | "custom">("standard");
  const [category, setCategory] = useState("通用安防");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const visibleAlgorithms = useMemo(() => {
    const filtered = algorithms.filter((algorithm) => {
      if (query.trim() && !algorithm.name.includes(query.trim())) {
        return false;
      }

      if (category === "通用安防") {
        return true;
      }

      return algorithm.categories.length === 0 || algorithm.categories.includes(category);
    });

    const seeded = filtered.length > 0 ? filtered : algorithms;

    return Array.from({ length: Math.max(6, seeded.length) }, (_, index) => seeded[index % seeded.length]);
  }, [algorithms, category, query]);

  return (
    <section className="ai-chooser-page">
      <div className="ai-chooser-backdrop" />

      <div className="ai-chooser-panel">
        <div className="ai-chooser-header">
          <strong>选择算法</strong>
          <button type="button" className="ai-chooser-close" onClick={() => router.push("/tasks")}>
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="ai-chooser-copy">请根据巡检的场景和目标，选择一个合适的算法添加巡检任务</div>

        <div className="ai-chooser-toolbar">
          <div className="ai-chooser-segmented">
            <button
              type="button"
              className={mode === "standard" ? "ai-chooser-segment ai-chooser-segment-active" : "ai-chooser-segment"}
              onClick={() => setMode("standard")}
            >
              标准算法
            </button>
            <button
              type="button"
              className={mode === "custom" ? "ai-chooser-segment ai-chooser-segment-active" : "ai-chooser-segment"}
              onClick={() => setMode("custom")}
            >
              自定义算法
            </button>
          </div>

          <label className="ai-chooser-search">
            <Search size={16} strokeWidth={1.8} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="算法名称" />
          </label>
        </div>

        {mode === "standard" ? (
          <>
            <div className="ai-chooser-category-bar">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={item === category ? "ai-chooser-category ai-chooser-category-active" : "ai-chooser-category"}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="ai-chooser-grid">
              {visibleAlgorithms.slice(0, 6).map((algorithm, index) => (
                <button
                  key={`${algorithm.id}-${index}`}
                  type="button"
                  className={selectedId === algorithm.id ? "ai-chooser-card ai-chooser-card-active" : "ai-chooser-card"}
                  onClick={() => setSelectedId(algorithm.id)}
                >
                  <div className="ai-chooser-card-title">
                    <strong>{algorithm.name}</strong>
                    <span>v1.1</span>
                  </div>
                  <p>{algorithm.introduction}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="ai-chooser-empty">首期仅保留自定义算法入口展示。</div>
        )}

        <div className="ai-chooser-footer">
          <button
            type="button"
            className="ai-chooser-submit"
            disabled={!selectedId || mode !== "standard"}
            onClick={() => router.push(`${returnPath}?algorithmId=${selectedId}`)}
          >
            进入任务配置
          </button>
        </div>
      </div>
    </section>
  );
}
