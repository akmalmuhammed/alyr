import test from "node:test";
import assert from "node:assert/strict";
import {
  isWindowOpen,
  windowRemainingHours,
  formatWindowClosesAt,
  money,
  formatTime,
  filterConversations,
} from "./logic.ts";

test("isWindowOpen correctly identifies within 24 hours", () => {
  const now = new Date();
  const recent = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  assert.equal(isWindowOpen(recent), true);

  const expired = new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString();
  assert.equal(isWindowOpen(expired), false);

  assert.equal(isWindowOpen(null), false);
});

test("windowRemainingHours calculates integer hours remaining", () => {
  const now = new Date();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  assert.equal(windowRemainingHours(threeHoursAgo), 21);

  const expired = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
  assert.equal(windowRemainingHours(expired), 0);

  const closes = formatWindowClosesAt(threeHoursAgo);
  assert.equal(typeof closes, "string");
  assert.equal(closes.length > 5, true);

  const timeStr = formatTime(threeHoursAgo);
  assert.equal(typeof timeStr, "string");
  assert.equal(timeStr.length > 0, true);
});

test("money formats correctly with non-breaking space", () => {
  assert.equal(money(250, "en"), "QAR\u00a0250");
  assert.equal(money(250, "ar"), "250\u00a0ر.ق");
  assert.equal(money(1200, "en"), "QAR\u00a01,200");
});

test("filterConversations handles tabs, chips and search", () => {
  const items = [
    {
      id: "1",
      name: "Rashid Mahmoud",
      phone: "+974 5555 0134",
      status: "open",
      assistant_paused: true,
      opted_out: false,
      window_open: true,
      unread: 0,
      assigned: { id: "u1", name: "You" },
      last: { body: "Can I bring the car?", direction: "in", kind: "text", status: "read", created_at: "2026-11-12T09:27:00Z" },
      mark: ["wait", "Waiting 12 min"],
    },
    {
      id: "2",
      name: "Mariam Saleh",
      phone: "+974 5555 0117",
      status: "open",
      assistant_paused: false,
      opted_out: false,
      window_open: false,
      unread: 0,
      assigned: { id: "u2", name: "Reem" },
      last: { body: "Hi Mariam, 18:30 tomorrow is free", direction: "out", kind: "text", status: "failed", created_at: "2026-11-11T19:05:00Z" },
      mark: ["bad", "Not delivered"],
    },
    {
      id: "3",
      name: "Omar Ali",
      phone: "+974 5555 0108",
      status: "closed",
      assistant_paused: false,
      opted_out: false,
      window_open: false,
      unread: 0,
      assigned: null,
      last: { body: "Ok, I will come next week", direction: "in", kind: "text", status: "read", created_at: "2026-11-10T12:00:00Z" },
      mark: ["lock", "Template only"],
    },
  ];

  // Tab filter: open
  const openItems = filterConversations(items, { tab: "open" });
  assert.equal(openItems.length, 2);

  // Tab filter: closed
  const closedItems = filterConversations(items, { tab: "closed" });
  assert.equal(closedItems.length, 1);
  assert.equal(closedItems[0].name, "Omar Ali");

  // Chip filter: waiting
  const waitingItems = filterConversations(items, { tab: "open", chip: "waiting" });
  assert.equal(waitingItems.length, 1);
  assert.equal(waitingItems[0].name, "Rashid Mahmoud");

  // Chip filter: mine
  const myItems = filterConversations(items, { tab: "open", chip: "mine" }, "u1");
  assert.equal(myItems.length, 1);
  assert.equal(myItems[0].name, "Rashid Mahmoud");

  // Search filter
  const searched = filterConversations(items, { tab: "open", q: "mariam" });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].name, "Mariam Saleh");
});
