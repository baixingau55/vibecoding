"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Search, X } from "lucide-react";

import type { Algorithm } from "@/lib/types";

function normalizeCategoryName(name: string) {
  return name.trim() || "未分类";
}

export function TaskAlgorithmChooser({
  algorithms,
  returnPath = "/tasks/new"
}: {
  algorithms: Algorithm[];
  returnPath?: string;
}) {
  const router = useRouter();
  const categoryBarRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"standard" | "custom">("standard");
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const categories = useMemo(() => {
    const fromAlgorithms = Array.from(new Set(algorithms.flatMap((item) => item.categories.map(normalizeCategoryName))));
    return ["全部", ...fromAlgorithms];
  }, [algorithms]);

  const visibleAlgorithms = useMemo(() => {
    if (mode !== "standard") return [];

    return algorithms.filter((algorithm) => {
      if (query.trim()) {
        const keyword = query.trim();
        if (!algorithm.name.includes(keyword) && !algorithm.introduction.includes(keyword) && !algorithm.id.includes(keyword)) {
          return false;
        }
      }

      if (category === "全部") {
        return true;
      }

      return algorithm.categories.map(normalizeCategoryName).includes(category);
    });
  }, [algorithms, category, mode, query]);

  function scrollCategoryBar(direction: "left" | "right") {
    categoryBarRef.current?.scrollBy({
      left: direction === "left" ? -240 : 240,
      behavior: "smooth"
    });
  }

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
            <div className="ai-chooser-category-strip">
              <button type="button" className="ai-chooser-category-scroll" onClick={() => scrollCategoryBar("left")} aria-label="向左滚动分类">
                <ArrowLeft size={14} strokeWidth={1.8} />
              </button>
              <div className="ai-chooser-category-bar" ref={categoryBarRef}>
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
              <button type="button" className="ai-chooser-category-scroll" onClick={() => scrollCategoryBar("right")} aria-label="向右滚动分类">
                <ArrowRight size={14} strokeWidth={1.8} />
              </button>
            </div>

            {visibleAlgorithms.length > 0 ? (
              <div className="ai-chooser-grid">
                {visibleAlgorithms.map((algorithm) => (
                  <button
                    key={algorithm.id}
                    type="button"
                    className={selectedId === algorithm.id ? "ai-chooser-card ai-chooser-card-active" : "ai-chooser-card"}
                    onClick={() => setSelectedId(algorithm.id)}
                  >
                    <div className="ai-chooser-card-title">
                      <strong>{algorithm.name}</strong>
                      <span>v{algorithm.latestVersion}</span>
                    </div>
                    <p>{algorithm.introduction}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="ai-chooser-empty">当前未获取到可用标准算法，请检查 TP-LINK 接口权限或凭证。</div>
            )}
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
