import type { LayoutKey } from "./types";

export const hasLeftSide = (l: LayoutKey) => l === "side-left" || l === "side-both" || l === "side-left-transom" || l === "side-both-transom";
export const hasRightSide = (l: LayoutKey) => l === "side-right" || l === "side-both" || l === "side-right-transom" || l === "side-both-transom";
export const hasSidelite = (l: LayoutKey) => hasLeftSide(l) || hasRightSide(l);
export const hasTransom = (l: LayoutKey) => l.endsWith("transom");
export const isDouble = (l: LayoutKey) => l === "double";
