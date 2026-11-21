// The kit's pure logic: class builders, tab keys, field ids, initials, colours.
import assert from "node:assert/strict";
import test from "node:test";
import {
  BUTTON_KINDS, BUTTON_SIZES, SHOP_COLOURS, bannerClass, bannerRole, buttonClass, cx, fieldIds, initials,
  joinIds, meterPercent, nextTabIndex, rem, shopColour, statusClass, stepState, tagClass,
} from "./variants.ts";

test("cx drops everything falsy and keeps the order", () => {
  assert.equal(cx("a", false, null, undefined, "", 0, "b"), "a b");
  assert.equal(cx(), "");
});

test("a button is a line button of medium height unless told otherwise", () => {
  assert.equal(buttonClass(), "u-btn u-btn--line u-btn--md");
  assert.equal(buttonClass({ kind: "quiet", size: "xs" }), "u-btn u-btn--quiet u-btn--xs");
});

test("every kind and size gets its own class", () => {
  for (const kind of BUTTON_KINDS) {
    for (const size of BUTTON_SIZES) {
      const classes = buttonClass({ kind, size }).split(" ");
      assert.ok(classes.includes(`u-btn--${size}`));
      assert.ok(classes.includes(`u-btn--${kind}`));
    }
  }
});

test("a Volt button that cannot be pressed is drawn as an outline", () => {
  assert.match(buttonClass({ kind: "volt", disabled: true }), /u-btn--line/);
  assert.doesNotMatch(buttonClass({ kind: "volt", disabled: true }), /u-btn--volt/);
  // Other kinds keep their look when disabled; the browser greys them.
  assert.match(buttonClass({ kind: "dark", disabled: true }), /u-btn--dark/);
});

test("busy, block, icon-only and a caller's class are added, in that order", () => {
  assert.equal(
    buttonClass({ kind: "dark", size: "sm", iconOnly: true, busy: true, block: true, className: "x" }),
    "u-btn u-btn--dark u-btn--sm u-btn--icon u-btn--busy u-btn--block x",
  );
});

test("tags, statuses and banners carry their tone", () => {
  assert.equal(tagClass(), "u-tag u-tag--n");
  assert.equal(tagClass("warn", "extra"), "u-tag u-tag--warn extra");
  assert.equal(statusClass("off"), "u-status u-status--off");
  assert.equal(bannerClass("bad"), "u-banner u-banner--bad");
});

test("only a bad banner is an alert", () => {
  assert.equal(bannerRole("bad"), "alert");
  for (const tone of ["ok", "warn", "n"]) assert.equal(bannerRole(tone), "status");
});

test("tab keys: the forward arrow follows the writing direction", () => {
  assert.equal(nextTabIndex(0, "ArrowRight", 3, false), 1);
  assert.equal(nextTabIndex(0, "ArrowLeft", 3, false), 2);
  assert.equal(nextTabIndex(0, "ArrowLeft", 3, true), 1);
  assert.equal(nextTabIndex(0, "ArrowRight", 3, true), 2);
  assert.equal(nextTabIndex(2, "ArrowRight", 3, false), 0);
});

test("tab keys: Home, End, other keys and an empty row", () => {
  assert.equal(nextTabIndex(1, "Home", 4, false), 0);
  assert.equal(nextTabIndex(1, "End", 4, true), 3);
  assert.equal(nextTabIndex(1, "Enter", 4, false), null);
  assert.equal(nextTabIndex(0, "ArrowRight", 0, false), null);
});

test("a field names its hint and its error only when it has them", () => {
  assert.deepEqual(fieldIds(":r1:", {}), { hint: undefined, error: undefined, describedBy: undefined });
  assert.equal(fieldIds(":r1:", { hint: true }).describedBy, ":r1:-hint");
  assert.equal(fieldIds(":r1:", { hint: true, error: true }).describedBy, ":r1:-hint :r1:-error");
  assert.equal(fieldIds(":r1:", { error: true }).error, ":r1:-error");
});

test("joinIds drops the missing ids", () => {
  assert.equal(joinIds("a", undefined, "b", false), "a b");
  assert.equal(joinIds(undefined, ""), undefined);
});

test("a meter is a whole percentage between 0 and 100", () => {
  assert.equal(meterPercent(3, 10), 30);
  assert.equal(meterPercent(15, 10), 100);
  assert.equal(meterPercent(-2, 10), 0);
  assert.equal(meterPercent(1, 0), 0);
  assert.equal(meterPercent(Number.NaN), 0);
  assert.equal(meterPercent(1, 3), 33);
  assert.equal(meterPercent(50), 50);
});

test("a step is done before the current one, current on it, to do after it", () => {
  assert.deepEqual([0, 1, 2, 3].map((i) => stepState(i, 1)), ["done", "current", "todo", "todo"]);
  assert.equal(stepState(0, 0), "current");
});

test("initials: the first letter of the first two words", () => {
  assert.equal(initials("Aisha Hamad"), "AH");
  assert.equal(initials("Hana"), "H");
  assert.equal(initials("Gulf Courier W.L.L."), "GC");
  assert.equal(initials("  nuqta   car care "), "NC");
  assert.equal(initials("Palm & Court"), "PC");
  assert.equal(initials(""), "");
});

test("initials of an Arabic name take a first letter and never split a word", () => {
  assert.equal(initials("عائشة حمد"), "عح");
  assert.equal(initials("حنا"), "ح");
});

test("a shop colour is stable and always one of the six", () => {
  assert.equal(shopColour(0), 0);
  assert.equal(shopColour(7), 1);
  assert.equal(shopColour(-1), SHOP_COLOURS - 1);
  assert.equal(shopColour("Glass cleaner"), shopColour("Glass cleaner"));
  for (const seed of ["a", "b", "Air freshener", "عطر", 12, 99]) {
    const colour = shopColour(seed);
    assert.ok(Number.isInteger(colour) && colour >= 0 && colour < SHOP_COLOURS);
  }
});

test("rem keeps a number-sized thing in step with the text size", () => {
  assert.equal(rem(16), "1rem");
  assert.equal(rem(28), "1.75rem");
  assert.equal(rem(10), "0.625rem");
});
