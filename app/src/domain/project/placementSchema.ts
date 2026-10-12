import { isUsableQuad } from "@/domain/imaging/quad";
import type { Placement, Pt, Quad } from "@/domain/imaging/types";

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Strictly validate an untrusted placement (request body, database row). Returns null if anything is off. */
export function parsePlacement(input: unknown, photoW: number, photoH: number): Placement | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.quad) || o.quad.length !== 4) return null;
  const pts: Pt[] = [];
  for (const q of o.quad) {
    if (typeof q !== "object" || q === null) return null;
    const { x, y } = q as Record<string, unknown>;
    if (!num(x) || !num(y)) return null;
    pts.push({ x, y });
  }
  const quad = pts as unknown as Quad;
  if (!isUsableQuad(quad, photoW, photoH)) return null;
  if (typeof o.flip !== "boolean" || typeof o.perspective !== "boolean" || typeof o.matchLighting !== "boolean" || typeof o.shadow !== "boolean") return null;
  if (!num(o.brightness) || o.brightness < -50 || o.brightness > 50) return null;
  return { quad, flip: o.flip, perspective: o.perspective, matchLighting: o.matchLighting, brightness: o.brightness, shadow: o.shadow };
}
