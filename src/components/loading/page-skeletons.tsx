function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`ai-skeleton-line ${className}`.trim()} />;
}

export function TasksPageSkeleton() {
  return (
    <div className="ai-page ai-task-list-page">
      <section className="ai-service-overview ai-service-overview-compact">
        <div className="ai-service-summary ai-service-summary-compact">
          <div className="ai-skeleton-stack">
            <SkeletonLine className="ai-skeleton-title" />
            <SkeletonLine className="ai-skeleton-text ai-skeleton-wide" />
          </div>
          <div className="ai-skeleton-actions">
            <SkeletonLine className="ai-skeleton-button" />
            <SkeletonLine className="ai-skeleton-button ai-skeleton-button-primary" />
          </div>
        </div>
        <div className="ai-task-list-toolbar ai-task-list-toolbar-compact">
          <SkeletonLine className="ai-skeleton-button ai-skeleton-button-primary ai-toolbar-add" />
          <div className="ai-skeleton-toolbar-group">
            <SkeletonLine className="ai-skeleton-chip" />
            <SkeletonLine className="ai-skeleton-input" />
            <SkeletonLine className="ai-skeleton-input ai-skeleton-search" />
            <SkeletonLine className="ai-skeleton-button" />
          </div>
        </div>
      </section>

      <section className="ai-task-grid ai-task-grid-ui">
        {Array.from({ length: 6 }).map((_, index) => (
          <article key={index} className="ai-task-card ai-task-card-ui ai-skeleton-card">
            <SkeletonLine className="ai-skeleton-title" />
            <SkeletonLine className="ai-skeleton-text" />
            <SkeletonLine className="ai-skeleton-text ai-skeleton-medium" />
            <div className="ai-skeleton-preview-grid">
              <SkeletonLine className="ai-skeleton-preview" />
              <SkeletonLine className="ai-skeleton-preview" />
              <SkeletonLine className="ai-skeleton-preview" />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export function MessagesPageSkeleton() {
  return (
    <div className="ai-page ai-message-page">
      <section className="ai-panel ai-message-shell">
        <div className="ai-message-tabs">
          <SkeletonLine className="ai-skeleton-tab" />
        </div>
        <div className="ai-message-toolbar">
          <div className="ai-skeleton-actions">
            <SkeletonLine className="ai-skeleton-button" />
            <SkeletonLine className="ai-skeleton-button" />
          </div>
          <div className="ai-skeleton-actions">
            <SkeletonLine className="ai-skeleton-input ai-skeleton-search" />
            <SkeletonLine className="ai-skeleton-button" />
          </div>
        </div>
        <div className="ai-skeleton-table">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="ai-skeleton-table-row">
              <SkeletonLine className="ai-skeleton-cell ai-skeleton-cell-small" />
              <SkeletonLine className="ai-skeleton-cell ai-skeleton-cell-medium" />
              <SkeletonLine className="ai-skeleton-cell ai-skeleton-cell-wide" />
              <SkeletonLine className="ai-skeleton-cell ai-skeleton-cell-medium" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AnalyticsPageSkeleton() {
  return (
    <div className="ai-page ai-analytics-page">
      <div className="ai-analytics-toolbar">
        <SkeletonLine className="ai-skeleton-input ai-skeleton-medium" />
        <SkeletonLine className="ai-skeleton-input ai-skeleton-wide" />
        <SkeletonLine className="ai-skeleton-input ai-skeleton-medium" />
        <SkeletonLine className="ai-skeleton-button" />
        <SkeletonLine className="ai-skeleton-button" />
      </div>

      <section className="ai-panel ai-analytics-overview-panel">
        <SkeletonLine className="ai-skeleton-title" />
        <div className="ai-overview-strip-grid ai-overview-strip-grid-wide">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="ai-skeleton-stat-card">
              <SkeletonLine className="ai-skeleton-text" />
              <SkeletonLine className="ai-skeleton-title ai-skeleton-short" />
            </div>
          ))}
        </div>
      </section>

      <section className="ai-panel ai-ranking-card">
        <SkeletonLine className="ai-skeleton-title" />
        <div className="ai-skeleton-table">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="ai-skeleton-table-row">
              <SkeletonLine className="ai-skeleton-cell ai-skeleton-cell-small" />
              <SkeletonLine className="ai-skeleton-cell ai-skeleton-cell-wide" />
              <SkeletonLine className="ai-skeleton-cell ai-skeleton-cell-medium" />
            </div>
          ))}
        </div>
      </section>

      <section className="ai-panel ai-trend-card">
        <SkeletonLine className="ai-skeleton-title" />
        <div className="ai-skeleton-chart" />
      </section>
    </div>
  );
}

export function TaskDetailSkeleton() {
  return (
    <div className="ai-page ai-task-detail-page">
      <div className="ai-page-breadcrumb ai-page-breadcrumb-tight">
        <SkeletonLine className="ai-skeleton-text ai-skeleton-medium" />
      </div>
      <section className="ai-summary-strip ai-task-detail-summary">
        <SkeletonLine className="ai-skeleton-title" />
        <div className="ai-task-detail-strip-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="ai-skeleton-stat-card">
              <SkeletonLine className="ai-skeleton-text" />
              <SkeletonLine className="ai-skeleton-title ai-skeleton-short" />
            </div>
          ))}
        </div>
      </section>

      <section className="ai-panel ai-detail-result-panel ai-detail-result-panel-tight">
        <SkeletonLine className="ai-skeleton-title" />
        <div className="ai-detail-overview-grid ai-detail-overview-grid-wide">
          <div className="ai-detail-metrics ai-detail-metrics-plain ai-skeleton-card">
            <SkeletonLine className="ai-skeleton-title" />
            <div className="ai-detail-metrics-cards ai-detail-metrics-cards-plain">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index}>
                  <SkeletonLine className="ai-skeleton-text" />
                  <SkeletonLine className="ai-skeleton-title ai-skeleton-short" />
                </div>
              ))}
            </div>
          </div>
          <div className="ai-detail-chart-card ai-detail-chart-card-plain">
            <SkeletonLine className="ai-skeleton-title" />
            <div className="ai-skeleton-chart" />
          </div>
        </div>
      </section>
    </div>
  );
}
