import type { Rule } from "@/domain/engine/types";

/**
 * Compatibility rules (declarative, serialisable).
 *
 * Documented policy:
 *  1. The PRODUCT is the root. Selecting one replaces only values it does not support.
 *  2. For every other conflict, EARLIER groups win (the order of `GROUPS`): a rule may only depend on
 *     groups that come before the group it restricts. Later choices adapt; they never overwrite earlier ones.
 *     (Enforced by `validateCatalogue`.)
 *  3. Nothing is a dead end: every lock and block names an `unlock`, the change applied automatically when the user
 *     picks the restricted option anyway (see engine/unlock.ts). Without one the option stays unavailable.
 *  4. A *locked* group keeps its stored value, so the choice returns when the lock lifts.
 *     A *blocked* option cannot be selected, and if currently selected is replaced with a default, with a notice.
 */
export const RULES: readonly Rule[] = [
  {
    id: "sidelite-groups-need-sidelite",
    kind: "groupLockedWhen",
    groups: ["sideliteStyle", "sideliteGlass"],
    when: { not: { layout: "sidelite" } },
    reason: "Choose a layout with a sidelite to unlock this.",
    unlock: { layout: "addSidelite", note: "Adds a sidelite to your layout." },
  },
  {
    id: "transom-glass-needs-transom",
    kind: "groupLockedWhen",
    groups: ["transomGlass"],
    when: { not: { layout: "transom" } },
    reason: "Choose a layout with a transom to unlock this.",
    unlock: { layout: "addTransom", note: "Adds a transom to your layout." },
  },
  {
    id: "door-glass-needs-lite",
    kind: "groupLockedWhen",
    groups: ["glass", "glassFrame"],
    when: { field: "lite", in: ["none"] },
    reason: "Choose a door model with a lite to unlock this.",
    unlock: { set: { lite: "half" }, note: "Gives the door a 1/2 glass lite." },
  },
  {
    id: "frame-colors-follow-door",
    kind: "groupLockedWhen",
    groups: ["colorFrameExt", "colorFrameInt"],
    when: { field: "matchFrame", in: [true] },
    reason: "Following the door color. Turn off “Frame follows door” to set it.",
    unlock: { set: { matchFrame: false }, note: "Turns off “Frame follows door” so the frame can have its own color." },
  },
  { id: "frame-ext-follows-door", kind: "follow", target: "colorFrameExt", source: "colorDoorExt", when: { field: "matchFrame", in: [true] } },
  { id: "frame-int-follows-door", kind: "follow", target: "colorFrameInt", source: "colorDoorInt", when: { field: "matchFrame", in: [true] } },
  {
    id: "no-knocker-or-mail-on-double",
    kind: "optionBlockedWhen",
    group: "accessory",
    values: ["knocker", "mail"],
    when: { layout: "double" },
    reason: "Not available with double doors.",
    unlock: { layout: "single", note: "Switches to a single door." },
  },
  {
    id: "no-kick-plate-tall-three-quarter-lite",
    kind: "optionBlockedWhen",
    group: "accessory",
    values: ["kick"],
    when: { all: [{ field: "height", in: ["tall"] }, { field: "lite", in: ["three"] }] },
    reason: "Not available on tall doors with a 3/4 lite.",
    unlock: { set: { lite: "half" }, note: "Changes the lite to 1/2 glass." },
  },
  {
    id: "no-pull-handle-on-double",
    kind: "optionBlockedWhen",
    group: "handle",
    values: ["pull"],
    when: { layout: "double" },
    reason: "Pull handles need a single door.",
    unlock: { layout: "single", note: "Switches to a single door." },
  },
];
