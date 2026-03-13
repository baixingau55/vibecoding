"use client";

export default function TaskDetailError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="ai-page ai-task-detail-page">
      <div className="ai-panel ai-module-error-card">
        <h2 className="ai-panel-title">任务详情加载失败</h2>
        <p>{error.message || "当前详情页暂时不可用，请稍后重试。"}</p>
        <button type="button" className="ai-button ai-button-primary" onClick={reset}>
          重新加载
        </button>
      </div>
    </div>
  );
}
