"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { X } from "lucide-react";

import type { MediaAsset, MessageItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const tabs = [
  { key: "inspection_unqualified", label: "离岗检测", badge: "99+" },
  { key: "custom", label: "此处显示任务的自定义消息类型", badge: "9" },
  { key: "no_device", label: "任务下无设备" },
  { key: "algorithm_error", label: "算法失效" },
  { key: "no_balance", label: "算法服务可用次数不足" }
] as const;

export function MessageCenter({
  initialMessages,
  mediaByMessage
}: {
  initialMessages: MessageItem[];
  mediaByMessage: Record<string, MediaAsset[]>;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("inspection_unqualified");
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [confirmAllRead, setConfirmAllRead] = useState(false);
  const [filterState, setFilterState] = useState({ status: "all", day: "", hour: "" });

  const filteredMessages = useMemo(() => {
    return messages.filter((item) => {
      if (activeTab === "inspection_unqualified" && item.type !== "inspection_unqualified") return false;
      if (query.trim() && !item.title.includes(query.trim()) && !item.algorithmId.includes(query.trim())) return false;
      if (filterState.status === "unread" && item.read) return false;
      if (filterState.status === "read" && !item.read) return false;
      if (filterState.day && !item.createdAt.startsWith(filterState.day)) return false;
      if (filterState.hour && !item.createdAt.slice(11, 13).startsWith(filterState.hour.padStart(2, "0"))) return false;
      return true;
    });
  }, [activeTab, filterState, messages, query]);

  const visibleMessages = useMemo(() => {
    if (filteredMessages.length >= 5) return filteredMessages;
    const seed = filteredMessages[0] ?? messages[0];
    if (!seed) return [];
    const placeholders = Array.from({ length: Math.max(0, 5 - filteredMessages.length) }, (_, index) => ({
      ...seed,
      id: `${seed.id}-clone-${index}`,
      read: index > 1,
      title:
        index === 0
          ? "离岗检测"
          : index === 1
            ? "此处显示任务的自定义消息类型"
            : index === 2
              ? "任务下无设备"
              : index === 3
                ? "算法失效"
                : "算法服务可用次数不足",
      description:
        index === 0
          ? "连续3次检出空岗"
          : index === 1
            ? "此处显示任务的自定义消息描述"
            : index === 2
              ? "无巡检设备，任务无法执行"
              : index === 3
                ? "算法已失效，任务无法执行"
                : "服务剩余次数不足，所有任务无法执行"
    }));
    return [...filteredMessages, ...placeholders];
  }, [filteredMessages, messages]);

  const selectedMessage = messages.find((item) => item.id === selectedId) ?? null;
  const selectedIndex = visibleMessages.findIndex((item) => item.id === selectedId);

  async function markRead(id: string) {
    await fetch(`/api/messages/${id}/read`, { method: "POST" });
    setMessages((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }

  async function markCheckedAsRead() {
    await Promise.all(checkedIds.map((id) => fetch(`/api/messages/${id}/read`, { method: "POST" })));
    setMessages((current) => current.map((item) => (checkedIds.includes(item.id) ? { ...item, read: true } : item)));
    setCheckedIds([]);
  }

  async function markAllAsRead() {
    const ids = visibleMessages.map((item) => item.id);
    await Promise.all(ids.map((id) => fetch(`/api/messages/${id}/read`, { method: "POST" })));
    setMessages((current) => current.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)));
    setCheckedIds([]);
    setConfirmAllRead(false);
  }

  return (
    <div className="ai-page ai-message-page">
      <section className="ai-panel ai-message-shell">
        <div className="ai-message-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={tab.key === activeTab ? "ai-message-tab ai-message-tab-active" : "ai-message-tab"}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {"badge" in tab && tab.badge ? <span className="ai-message-tab-badge">{tab.badge}</span> : null}
            </button>
          ))}
        </div>

        <div className="ai-message-toolbar">
          <div className="ai-toolbar-actions">
            <button type="button" className="ai-button ai-button-light" disabled={checkedIds.length === 0} onClick={markCheckedAsRead}>
              标为已读
            </button>
            <button type="button" className="ai-button ai-button-light" onClick={() => setConfirmAllRead(true)}>
              全部标为已读
            </button>
          </div>

          <div className="ai-toolbar-actions">
            <input
              className="ai-input ai-input-search ai-message-search"
              placeholder="任务名称/设备名称/算法名称"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="button" className="ai-button ai-button-light" onClick={() => setFilterOpen(true)}>
              筛选
            </button>
          </div>
        </div>

        <div className="ai-message-table-wrap">
          <table className="ai-table ai-message-table">
            <thead>
              <tr>
                <th />
                <th>序号</th>
                <th>消息报文</th>
                <th>算法名称</th>
                <th>相关设备</th>
                <th>巡检抓图</th>
                <th>消息推送时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleMessages.map((message, index) => (
                <tr key={message.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={checkedIds.includes(message.id)}
                      onChange={(event) =>
                        setCheckedIds((current) =>
                          event.target.checked ? [...current, message.id] : current.filter((item) => item !== message.id)
                        )
                      }
                    />
                  </td>
                  <td>
                    {!message.read ? <span className="ai-message-unread-dot" /> : null}
                    {index + 1}
                  </td>
                  <td>
                    <strong>{message.title}</strong>
                    <div className="ai-message-desc">{message.description}</div>
                  </td>
                  <td>{message.algorithmId}</td>
                  <td>
                    <div className="ai-device-title">门口监控</div>
                    <div className="ai-device-group">分组：科技园店 / 南山区 / 库迪咖啡</div>
                  </td>
                  <td>
                    {message.imageUrl ? (
                      <div className="ai-message-thumb">
                        <Image src={message.imageUrl} alt={message.title} fill sizes="62px" />
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{formatDateTime(message.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="ai-text-button ai-detail-inline-link"
                      onClick={() => {
                        setSelectedId(message.id);
                        if (!message.read) void markRead(message.id);
                      }}
                    >
                      详情
                    </button>
                    <button
                      type="button"
                      className="ai-text-button ai-detail-inline-link"
                      onClick={() => {
                        setSelectedId(message.id);
                        if (!message.read) void markRead(message.id);
                      }}
                    >
                      查看回放
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ai-pagination-row">
          <span>共计 X 条 第 1/1 页 已读：X</span>
          <div className="ai-pagination-controls">
            <select className="ai-input ai-input-select ai-pagination-select">
              <option>X条/页</option>
            </select>
            <button type="button">&lt;</button>
            <span className="ai-pagination-current">1</span>
            <button type="button">&gt;</button>
            <button type="button">前往第</button>
            <input className="ai-input ai-pagination-input" defaultValue="1" />
            <span>页</span>
          </div>
        </div>
      </section>

      {filterOpen ? (
        <div className="ai-overlay ai-overlay-right" onClick={() => setFilterOpen(false)}>
          <aside className="ai-message-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="ai-message-drawer-header">
              <strong>筛选</strong>
              <button type="button" className="ai-close-button" onClick={() => setFilterOpen(false)}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="ai-message-drawer-section">
              <label className="ai-mini-form">
                <span>日期</span>
                <input
                  className="ai-input"
                  placeholder="例如 2026-03-11"
                  value={filterState.day}
                  onChange={(event) => setFilterState((current) => ({ ...current, day: event.target.value }))}
                />
              </label>
              <label className="ai-mini-form">
                <span>时刻</span>
                <input
                  className="ai-input"
                  placeholder="例如 08"
                  value={filterState.hour}
                  onChange={(event) => setFilterState((current) => ({ ...current, hour: event.target.value }))}
                />
              </label>
              <label className="ai-mini-form">
                <span>状态</span>
                <select
                  className="ai-input ai-input-select"
                  value={filterState.status}
                  onChange={(event) => setFilterState((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="all">全部状态</option>
                  <option value="unread">仅未读</option>
                  <option value="read">仅已读</option>
                </select>
              </label>
            </div>
            <div className="ai-modal-footer">
              <button
                type="button"
                className="ai-button ai-button-light"
                onClick={() => {
                  setFilterState({ status: "all", day: "", hour: "" });
                  setFilterOpen(false);
                }}
              >
                恢复默认
              </button>
              <button type="button" className="ai-button ai-button-primary" onClick={() => setFilterOpen(false)}>
                确定
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {selectedMessage ? (
        <div className="ai-overlay ai-overlay-right" onClick={() => setSelectedId("")}>
          <aside className="ai-message-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="ai-message-drawer-header">
              <strong>详情</strong>
              <button type="button" className="ai-close-button" onClick={() => setSelectedId("")}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>

            <div className="ai-message-drawer-section">
              <dl className="ai-message-detail-grid">
                <dt>消息类型</dt>
                <dd>离岗检测</dd>
                <dt>消息内容</dt>
                <dd>检测空岗</dd>
                <dt>消息推送时间</dt>
                <dd>{formatDateTime(selectedMessage.createdAt)}</dd>
              </dl>
            </div>

            <div className="ai-message-drawer-section">
              <h3>任务信息</h3>
              <dl className="ai-message-detail-grid">
                <dt>任务名称</dt>
                <dd>{selectedMessage.title}</dd>
                <dt>设备名称</dt>
                <dd>门口监控</dd>
                <dt>设备分组</dt>
                <dd>科技园店 / 南山区 / 库迪咖啡</dd>
                <dt>巡检时间</dt>
                <dd>每天，08:00、10:00、15:00、23:00 各巡检一次</dd>
                <dt>消息提醒</dt>
                <dd>{selectedMessage.description}</dd>
              </dl>
            </div>

            <div className="ai-message-drawer-section ai-message-drawer-result">
              <h3>巡检结果</h3>
              <dl className="ai-message-detail-grid">
                <dt>算法名称</dt>
                <dd>{selectedMessage.algorithmId}</dd>
                <dt>检测结果</dt>
                <dd className="ai-danger-text">不合格</dd>
                <dt>设备抓图</dt>
                <dd />
              </dl>

              {mediaByMessage[selectedMessage.id]?.[0] ? (
                <>
                  <div className="ai-drawer-media">
                    <Image src={mediaByMessage[selectedMessage.id][0].url} alt={selectedMessage.title} fill sizes="432px" />
                  </div>
                  <button type="button" className="ai-button ai-button-light">
                    查看回放
                  </button>
                </>
              ) : (
                <div className="ai-video-empty">暂无可查看录像</div>
              )}
            </div>

            <div className="ai-drawer-nav">
              <button
                type="button"
                disabled={selectedIndex <= 0}
                onClick={() => setSelectedId(visibleMessages[selectedIndex - 1]?.id ?? "")}
              >
                &lt; 上一个
              </button>
              <button
                type="button"
                disabled={selectedIndex === -1 || selectedIndex >= visibleMessages.length - 1}
                onClick={() => setSelectedId(visibleMessages[selectedIndex + 1]?.id ?? "")}
              >
                下一个 &gt;
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {confirmAllRead ? (
        <div className="ai-overlay">
          <div className="ai-modal">
            <div className="ai-modal-header">
              <strong>全部标为已读</strong>
              <button type="button" className="ai-close-button" onClick={() => setConfirmAllRead(false)}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="ai-modal-body">确认将当前筛选结果下的消息全部标记为已读吗？</div>
            <div className="ai-modal-footer">
              <button type="button" className="ai-button ai-button-light" onClick={() => setConfirmAllRead(false)}>
                取消
              </button>
              <button type="button" className="ai-button ai-button-primary" onClick={markAllAsRead}>
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
