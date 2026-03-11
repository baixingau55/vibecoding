"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, Search } from "lucide-react";

import type { Algorithm } from "@/lib/types";

function normalizeCategoryName(name: string) {
  return name.trim() || "未分类";
}

export function AlgorithmSelect({ algorithms }: { algorithms: Algorithm[] }) {
  const router = useRouter();
  const categoryBarRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"standard" | "custom">("standard");
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");

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
      left: direction === "left" ? -360 : 360,
      behavior: "smooth"
    });
  }

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
          <div className="ai-algorithm-category-strip">
            <button type="button" className="ai-algorithm-category-scroll" onClick={() => scrollCategoryBar("left")} aria-label="向左滚动分类">
              <ArrowLeft size={16} strokeWidth={1.8} />
            </button>
            <div className="ai-algorithm-category-bar" ref={categoryBarRef}>
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
            <button type="button" className="ai-algorithm-category-scroll" onClick={() => scrollCategoryBar("right")} aria-label="向右滚动分类">
              <ArrowRight size={16} strokeWidth={1.8} />
            </button>
          </div>

          {visibleAlgorithms.length > 0 ? (
            <div className="ai-algorithm-card-grid">
              {visibleAlgorithms.map((algorithm) => (
                <button
                  key={algorithm.id}
                  type="button"
                  className={selectedId === algorithm.id ? "ai-algorithm-tile ai-algorithm-tile-active" : "ai-algorithm-tile"}
                  onClick={() => {
                    setSelectedId(algorithm.id);
                    router.push(`/tasks/new?algorithmId=${algorithm.id}`);
                  }}
                >
                  <div className="ai-algorithm-tile-title-row">
                    <div className="ai-algorithm-tile-title-wrap">
                      <strong>{algorithm.name}</strong>
                      <span className="ai-algorithm-tile-version">v{algorithm.latestVersion}</span>
                    </div>
                  </div>
                  <p>{algorithm.introduction}</p>
                  <span className="ai-algorithm-tile-link">
                    添加巡检任务 <ArrowRight size={16} strokeWidth={2} />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <section className="ai-custom-page-state">
              <div className="ai-custom-page-panel">
                <h2>暂无可用标准算法</h2>
                <p>当前未从 TP-LINK 开放接口获取到算法列表，请检查 AK/SK 是否有效以及接口权限是否已开通。</p>
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="ai-custom-page-state">
          <div className="ai-custom-page-panel">
            <h2>自定义算法</h2>
            <p>首期仅保留入口展示，后续接入真实算法管理能力后，可在这里新增和维护自定义算法。</p>
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
          onClick={() => router.push(`/tasks/new?algorithmId=${selectedId}`)}
        >
          进入任务配置
        </button>
      </div>
    </section>
  );
}
