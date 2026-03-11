"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { X } from "lucide-react";

import type { MediaAsset, MessageItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

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
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [confirmAllRead, setConfirmAllRead] = useState(false);
  const [filterState, setFilterState] = useState({ status: "all", day: "", hour: "", type: "all" });

  const messageTypes = useMemo(() => Array.from(new Set(messages.map((item) => item.type))), [messages]);

  const filteredMessages = useMemo(() => {
    return messages.filter((item) => {
      if (query.trim() && !item.title.includes(query.trim()) && !item.algorithmId.includes(query.trim()) && !item.qrCode.includes(query.trim())) {
        return false;
      }
      if (filterState.status === "unread" && item.read) return false;
      if (filterState.status === "read" && !item.read) return false;
      if (filterState.type !== "all" && item.type !== filterState.type) return false;
      if (filterState.day && item.createdAt.slice(0, 10) !== filterState.day) return false;
      if (filterState.hour && item.createdAt.slice(11, 13) !== filterState.hour.padStart(2, "0")) return false;
      return true;
    });
  }, [filterState, messages, query]);

  const selectedMessage = filteredMessages.find((item) => item.id === selectedId) ?? messages.find((item) => item.id === selectedId) ?? null;
  const selectedIndex = filteredMessages.findIndex((item) => item.id === selectedId);
  const selectedMedia = selectedMessage ? mediaByMessage[selectedMessage.id] ?? [] : [];
  const imageMedia = selectedMedia.find((item) => item.kind === "image");
  const videoMedia = selectedMedia.find((item) => item.kind === "video");

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
    const ids = filteredMessages.map((item) => item.id);
    await Promise.all(ids.map((id) => fetch(`/api/messages/${id}/read`, { method: "POST" })));
    setMessages((current) => current.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)));
    setCheckedIds([]);
    setConfirmAllRead(false);
  }

  return (
    <div className="ai-page ai-message-page">
      <section className="ai-panel ai-message-shell">
        <div className="ai-message-tabs">
          <button type="button" className="ai-message-tab ai-message-tab-active">
            消息中心
            <span className="ai-message-tab-badge">{messages.filter((item) => !item.read).length}</span>
          </button>
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
                <th>巡检抓拍</th>
                <th>消息推送时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredMessages.map((message, index) => (
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
                  <td>{message.qrCode}</td>
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
                <input className="ai-input" type="date" value={filterState.day} onChange={(event) => setFilterState((current) => ({ ...current, day: event.target.value }))} />
              </label>
              <label className="ai-mini-form">
                <span>时刻</span>
                <input className="ai-input" type="number" min="0" max="23" value={filterState.hour} onChange={(event) => setFilterState((current) => ({ ...current, hour: event.target.value }))} />
              </label>
              <label className="ai-mini-form">
                <span>状态</span>
                <select className="ai-input ai-input-select" value={filterState.status} onChange={(event) => setFilterState((current) => ({ ...current, status: event.target.value }))}>
                  <option value="all">全部状态</option>
                  <option value="unread">仅未读</option>
                  <option value="read">仅已读</option>
                </select>
              </label>
              <label className="ai-mini-form">
                <span>消息类型</span>
                <select className="ai-input ai-input-select" value={filterState.type} onChange={(event) => setFilterState((current) => ({ ...current, type: event.target.value }))}>
                  <option value="all">全部类型</option>
                  {messageTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="ai-modal-footer">
              <button
                type="button"
                className="ai-button ai-button-light"
                onClick={() => {
                  setFilterState({ status: "all", day: "", hour: "", type: "all" });
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
                <dd>{selectedMessage.type}</dd>
                <dt>消息内容</dt>
                <dd>{selectedMessage.description}</dd>
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
                <dd>{selectedMessage.qrCode}</dd>
                <dt>算法名称</dt>
                <dd>{selectedMessage.algorithmId}</dd>
              </dl>
            </div>

            <div className="ai-message-drawer-section ai-message-drawer-result">
              <h3>巡检结果</h3>
              <dl className="ai-message-detail-grid">
                <dt>检测结果</dt>
                <dd className="ai-danger-text">{selectedMessage.result === "UNQUALIFIED" ? "不合格" : "合格"}</dd>
                <dt>抓拍</dt>
                <dd />
              </dl>

              {imageMedia?.url || selectedMessage.imageUrl ? (
                <div className="ai-drawer-media">
                  <Image src={imageMedia?.url ?? selectedMessage.imageUrl!} alt={selectedMessage.title} fill sizes="432px" />
                </div>
              ) : null}

              {videoMedia ? (
                <Link href={`/api/media/${videoMedia.id}`} className="ai-button ai-button-light" target="_blank">
                  查看回放
                </Link>
              ) : (
                <div className="ai-video-empty">暂无可查看录像</div>
              )}
            </div>

            <div className="ai-drawer-nav">
              <button type="button" disabled={selectedIndex <= 0} onClick={() => setSelectedId(filteredMessages[selectedIndex - 1]?.id ?? "")}>
                &lt; 上一个
              </button>
              <button
                type="button"
                disabled={selectedIndex === -1 || selectedIndex >= filteredMessages.length - 1}
                onClick={() => setSelectedId(filteredMessages[selectedIndex + 1]?.id ?? "")}
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
