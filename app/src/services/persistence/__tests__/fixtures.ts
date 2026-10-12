import { CATALOGUE } from "@/domain/catalogue";
import { createConfig } from "@/domain/engine/reconcile";
import type { Placement } from "@/domain/imaging/types";

export const PLACEMENT: Placement = {
  quad: [{ x: 0.3, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }, { x: 0.3, y: 0.8 }],
  flip: false, perspective: false, matchLighting: true, brightness: 0, shadow: true,
};
export const config = (product = "haven", o: Record<string, unknown> = {}) => createConfig(CATALOGUE, product, o as never).config;
export const blob = (text: string, type = "image/jpeg") => new Blob([text], { type });
export const readText = async (b: Blob) => new TextDecoder().decode(await b.arrayBuffer());
