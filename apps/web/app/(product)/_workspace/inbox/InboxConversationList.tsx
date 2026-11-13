"use client";

import React from "react";
import { Avatar, Chip, Search, Status, Tabs } from "../../../_ui";
import { copy, type Lang } from "./copy";
import type { ConversationItem, InboxFilters } from "./logic";

export interface InboxConversationListProps {
  conversations: ConversationItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filters: InboxFilters;
  onFilterChange: (newFilters: Partial<InboxFilters>) => void;
  counts: {
    open: number;
    closed: number;
    unassigned: number;
    mine: number;
    unread: number;
    waiting: number;
  };
  lang: Lang;
}

export function InboxConversationList({
  conversations,
  selectedId,
  onSelect,
  filters,
  onFilterChange,
  counts,
  lang,
}: InboxConversationListProps) {
  const t = copy(lang);

  const tabItems = [
    { id: "open", label: t.tabOpen, count: counts.open },
    { id: "closed", label: t.tabClosed },
  ];

  return (
    <aside className="ibx-pane-list" aria-label={t.title}>
      {/* Header */}
      <div className="ibx-list-header">
        <h1 className="ibx-list-title">{t.title}</h1>
        {counts.unread > 0 && (
          <span className="ibx-list-unread">{t.unreadCount(counts.unread)}</span>
        )}
        <div style={{ marginInlineStart: "auto" }}>
          <Tabs
            label={t.title}
            items={tabItems}
            value={filters.tab}
            onChange={(val) => onFilterChange({ tab: val as "open" | "closed" })}
          />
        </div>
      </div>

      {/* Toolbar: Search & Chips */}
      <div className="ibx-list-tools">
        <Search
          label={t.searchConversations}
          placeholder={t.searchConversations}
          value={filters.q || ""}
          onChange={(val) => onFilterChange({ q: val })}
        />

        <div className="ibx-chips-row">
          <Chip
            on={filters.chip === "waiting"}
            count={counts.waiting > 0 ? counts.waiting : undefined}
            onClick={() => onFilterChange({ chip: filters.chip === "waiting" ? null : "waiting" })}
          >
            {t.chipWaiting}
          </Chip>
          <Chip
            on={filters.chip === "mine"}
            count={counts.mine > 0 ? counts.mine : undefined}
            onClick={() => onFilterChange({ chip: filters.chip === "mine" ? null : "mine" })}
          >
            {t.chipMine}
          </Chip>
          <Chip
            on={filters.chip === "unassigned"}
            count={counts.unassigned > 0 ? counts.unassigned : undefined}
            onClick={() => onFilterChange({ chip: filters.chip === "unassigned" ? null : "unassigned" })}
          >
            {t.chipUnassigned}
          </Chip>
        </div>
      </div>

      {/* Conversations Scrollable List */}
      <div className="ibx-list-scroll" role="list">
        {conversations.map((item) => {
          const isSelected = item.id === selectedId;
          const handlerName = item.assigned ? item.assigned.name : t.nobodyYet;

          return (
            <div
              key={item.id}
              role="listitem"
              tabIndex={0}
              className={`ibx-row ${isSelected ? "ibx-row--active" : ""}`}
              onClick={() => onSelect(item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(item.id);
                }
              }}
            >
              <Avatar name={item.name} size={36} />

              <div className="ibx-row-main">
                <div className="ibx-row-line1">
                  <span className="ibx-row-name">{item.name}</span>
                  <span className="ibx-row-time">
                    {new Date(item.last.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <div className="ibx-row-line2">
                  <span
                    className={`ibx-row-snippet ${
                      item.unread > 0 ? "ibx-row-snippet--unread" : ""
                    }`}
                  >
                    {item.last.body}
                  </span>
                  {item.unread > 0 && (
                    <span className="ibx-row-badge">{item.unread}</span>
                  )}
                </div>

                <div className="ibx-row-line3">
                  <span className="ibx-row-who">{handlerName}</span>
                  {item.mark && (
                    <Status
                      tone={
                        item.mark[0] === "wait"
                          ? "warn"
                          : item.mark[0] === "bad"
                          ? "bad"
                          : "n"
                      }
                    >
                      {item.mark[1]}
                    </Status>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
