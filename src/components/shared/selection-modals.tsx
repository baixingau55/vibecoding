"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

const mockGroups = [
  {
    id: "group-1",
    label: "科技园店",
    regions: ["门店入口", "收银台", "前台", "店内通道", "库房通道", "后门"]
  },
  {
    id: "group-2",
    label: "南山区门店",
    regions: ["A区入口", "B区入口", "自助收银", "仓库", "货架过道"]
  },
  {
    id: "group-3",
    label: "库迪咖啡",
    regions: ["吧台", "外摆区", "收银台", "取餐口"]
  },
  {
    id: "group-4",
    label: "零售体验店",
    regions: ["入口", "POS 区", "货架A", "货架B", "仓库"]
  }
];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function RegionGroupSelectorModal({
  open,
  initialValues,
  onClose,
  onConfirm
}: {
  open: boolean;
  initialValues: string[];
  onClose: () => void;
  onConfirm: (values: string[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [activeGroupId, setActiveGroupId] = useState(mockGroups[0].id);
  const [selected, setSelected] = useState<string[]>(initialValues);
  const activeGroup = mockGroups.find((item) => item.id === activeGroupId) ?? mockGroups[0];

  const visibleRegions = useMemo(() => {
    return activeGroup.regions.filter((item) => item.includes(keyword.trim()));
  }, [activeGroup.regions, keyword]);

  if (!open) return null;

  return (
    <div className="ai-overlay">
      <div className="ai-modal ai-selection-modal ai-region-selector-modal">
        <div className="ai-modal-header">
          <strong>选择区域/分组</strong>
          <button type="button" className="ai-close-button" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="ai-selection-tabs">
          <button type="button" className="ai-selection-tab ai-selection-tab-active">
            按区域选择
          </button>
          <button type="button" className="ai-selection-tab" disabled>
            按分组选择
          </button>
        </div>

        <div className="ai-selection-body">
          <div className="ai-selection-column ai-selection-column-left">
            <label className="ai-selection-search">
              <Search size={14} strokeWidth={1.8} />
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="分组" />
            </label>

            <div className="ai-selection-list ai-selection-groups">
              {mockGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={group.id === activeGroupId ? "ai-selection-group ai-selection-group-active" : "ai-selection-group"}
                  onClick={() => setActiveGroupId(group.id)}
                >
                  <span>{group.label}</span>
                  <span>›</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ai-selection-column ai-selection-column-middle">
            <label className="ai-selection-search">
              <Search size={14} strokeWidth={1.8} />
              <input placeholder="门店" />
            </label>

            <div className="ai-selection-list ai-selection-regions">
              <label className="ai-selection-check ai-selection-check-head">
                <input
                  type="checkbox"
                  checked={visibleRegions.length > 0 && visibleRegions.every((item) => selected.includes(`${activeGroup.label}/${item}`))}
                  onChange={(event) => {
                    const nextValues = visibleRegions.map((item) => `${activeGroup.label}/${item}`);
                    setSelected((current) => {
                      if (event.target.checked) {
                        return Array.from(new Set([...current, ...nextValues])).slice(0, 200);
                      }
                      return current.filter((item) => !nextValues.includes(item));
                    });
                  }}
                />
                <span>全选</span>
              </label>

              {visibleRegions.map((region, index) => {
                const value = `${activeGroup.label}/${region}`;
                return (
                  <label key={value} className={cn("ai-selection-check", index === 0 && "ai-selection-check-highlight")}>
                    <input
                      type="checkbox"
                      checked={selected.includes(value)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? Array.from(new Set([...current, value])).slice(0, 200)
                            : current.filter((item) => item !== value)
                        )
                      }
                    />
                    <span>{region}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="ai-selection-column ai-selection-column-right">
            <div className="ai-selection-picked-head">
              <span>已选分组/区域：{selected.length}</span>
              <button type="button" className="ai-text-button" onClick={() => setSelected([])}>
                清空
              </button>
            </div>

            {selected.length === 0 ? (
              <div className="ai-selection-empty-note">若不选择，将按现有全部分组巡检结果统计</div>
            ) : (
              <div className="ai-selection-picked-list">
                {selected.map((item) => (
                  <button key={item} type="button" className="ai-selection-picked-chip" onClick={() => setSelected((current) => current.filter((value) => value !== item))}>
                    <span>{item}</span>
                    <span>×</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ai-modal-footer">
          <button type="button" className="ai-button ai-button-light" onClick={onClose}>
            取消
          </button>
          <button type="button" className="ai-button ai-button-primary" onClick={() => onConfirm(selected)}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

export function TaskSelectorModal({
  open,
  tasks,
  initialValues,
  onClose,
  onConfirm
}: {
  open: boolean;
  tasks: Array<{ id: string; name: string }>;
  initialValues: string[];
  onClose: () => void;
  onConfirm: (values: string[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<string[]>(initialValues);

  const visibleTasks = useMemo(() => tasks.filter((task) => task.name.includes(keyword.trim())), [keyword, tasks]);

  if (!open) return null;

  return (
    <div className="ai-overlay">
      <div className="ai-modal ai-selection-modal ai-task-selector-modal">
        <div className="ai-modal-header">
          <strong>选择任务</strong>
          <button type="button" className="ai-close-button" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="ai-modal-body ai-modal-stack">
          <label className="ai-selection-search">
            <Search size={14} strokeWidth={1.8} />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="任务名称" />
          </label>

          <div className="ai-selection-list ai-task-selection-list">
            {visibleTasks.map((task) => (
              <label key={task.id} className="ai-selection-check">
                <input
                  type="checkbox"
                  checked={selected.includes(task.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked ? Array.from(new Set([...current, task.id])) : current.filter((item) => item !== task.id)
                    )
                  }
                />
                <span>{task.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="ai-modal-footer">
          <button type="button" className="ai-button ai-button-light" onClick={onClose}>
            取消
          </button>
          <button type="button" className="ai-button ai-button-primary" disabled={selected.length === 0} onClick={() => onConfirm(selected)}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
