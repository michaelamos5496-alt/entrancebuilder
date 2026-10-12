import { useId } from "react";
import { CATALOGUE } from "@/domain/catalogue";
import { getProduct } from "@/domain/engine/evaluate";
import { hasLeftSide, hasRightSide, hasTransom, isDouble } from "@/domain/design/layout";
import type { GlassKey, Selections, ViewSide } from "@/domain/design/types";

/**
 * INTEGRATION POINT (Phase 4): the visualisation engine.
 * Anything that renders a door from `Selections` must satisfy `DoorPreviewProps`.
 * This SchematicDoor is a deliberately flat, 2D stand-in so every choice is visible
 * while the real renderer is built. It is NOT the final visual quality.
 */
export interface DoorPreviewProps {
  selections: Selections;
  view: ViewSide;
  /** "stage": door on a neutral backdrop. "cutout": transparent, tightly cropped, for placing on a photo. */
  mode?: "stage" | "cutout";
  className?: string;
}

const G = { leaf: 100, side: 44, tran: 48, fr: 10, mul: 6, sill: 8, ground: 536, cx: 210 } as const;

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function GlassPattern({ kind, x, y, w, h, tint }: { kind: GlassKey; x: number; y: number; w: number; h: number; tint: string }) {
  const lines: React.ReactNode[] = [];
  const L = (k: string, x1: number, y1: number, x2: number, y2: number, sw = 1.5, o = 0.85) => (
    <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={sw} opacity={o} />
  );
  switch (kind) {
    case "mosaic":
    case "arch":
      for (let i = 1; i < 4; i++) lines.push(L(`v${i}`, x + (w * i) / 4, y, x + (w * i) / 4, y + h));
      for (let i = 1; i < 6; i++) lines.push(L(`h${i}`, x, y + (h * i) / 6, x + w, y + (h * i) / 6));
      if (kind === "arch") lines.push(<ellipse key="e" cx={x + w / 2} cy={y + h / 2} rx={w / 3} ry={h / 6} fill="none" stroke="#fff" strokeWidth={1.5} />);
      break;
    case "frosted":
      lines.push(<rect key="f" x={x} y={y} width={w} height={h} fill="#fff" opacity={0.6} />);
      break;
    case "ripple":
      for (let i = 0; i < 12; i++) lines.push(L(`r${i}`, x, y + (h * i) / 12, x + w, y + (h * i) / 12 + 3, 1, 0.45));
      break;
    case "frame":
      lines.push(<rect key="fr" x={x + w * 0.12} y={y + h * 0.06} width={w * 0.76} height={h * 0.88} fill="none" stroke="#fff" strokeWidth={2.5} opacity={0.9} />);
      break;
    case "bands":
      for (let i = 1; i < 3; i++) lines.push(L(`b${i}`, x + (w * i) / 3, y, x + (w * i) / 3, y + h, 3));
      break;
    case "linear":
      for (let i = 1; i < 8; i++) lines.push(L(`l${i}`, x + (w * i) / 8, y, x + (w * i) / 8, y + h, 1));
      break;
    case "grid":
      for (let i = 1; i < 3; i++) {
        lines.push(L(`gv${i}`, x + (w * i) / 3, y, x + (w * i) / 3, y + h, 3, 0.95));
        lines.push(L(`gh${i}`, x, y + (h * i) / 3, x + w, y + (h * i) / 3, 3, 0.95));
      }
      break;
    case "vent":
      lines.push(<rect key="v" x={x + w * 0.12} y={y + h * 0.1} width={w * 0.76} height={h * 0.26} fill="#fff" opacity={0.5} />);
      break;
    case "blinds":
      for (let i = 1; i < 12; i++) lines.push(L(`bl${i}`, x, y + (h * i) / 12, x + w, y + (h * i) / 12, 1.5, 0.7));
      break;
    case "clear":
      break;
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={tint} />
      {lines}
      <polygon points={`${x + w * 0.1},${y + h} ${x + w * 0.55},${y} ${x + w * 0.78},${y} ${x + w * 0.33},${y + h}`} fill="#fff" opacity={0.14} />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="rgb(0 0 0 / 0.4)" strokeWidth={1.2} />
    </g>
  );
}

export function SchematicDoor({ selections: s, view, mode = "stage", className }: DoorPreviewProps) {
  const uid = useId().replace(/:/g, "");
  const exterior = view === "exterior";
  const style = getProduct(CATALOGUE, s.product)?.style ?? "classic";
  const doorColor = exterior ? s.colorDoorExt : s.colorDoorInt;
  const frameColor = exterior ? s.colorFrameExt : s.colorFrameInt;
  const glassTint = exterior ? "#8fb1c4" : "#e9dfc6";
  const dark = lum(doorColor) < 0.5;
  const edge = dark ? "rgb(255 255 255 / 0.2)" : "rgb(0 0 0 / 0.2)";

  const dbl = isDouble(s.layout);
  const left = hasLeftSide(s.layout);
  const right = hasRightSide(s.layout);
  const tran = hasTransom(s.layout);
  const DH = s.height === "tall" ? 360 : 300;
  const litePct = s.lite === "none" ? 0 : s.lite === "half" ? 0.34 : 0.58;
  const sidePct = s.sideliteStyle === "match" ? litePct : s.sideliteStyle === "full" ? 0.72 : 0.4;

  const units: { t: "s" | "d"; w: number }[] = [];
  if (left) units.push({ t: "s", w: G.side });
  units.push({ t: "d", w: dbl ? G.leaf * 2 : G.leaf });
  if (right) units.push({ t: "s", w: G.side });
  const inner = units.reduce((a, u) => a + u.w, 0) + G.mul * (units.length - 1);
  const OW = inner + G.fr * 2;
  const x0 = G.cx - OW / 2;
  const doorBottom = G.ground - G.sill;
  const doorTop = doorBottom - DH;
  const topY = (tran ? doorTop - G.mul - G.tran : doorTop) - G.fr;

  const slab = (x: number, w: number, glass: GlassKey, pct: number, key: string) => {
    const inset = Math.max(9, w * 0.14);
    const gy = doorTop + DH * 0.07;
    const gh = DH * pct;
    const top = pct > 0 ? gy + gh + DH * 0.05 : doorTop + DH * 0.06;
    const bottom = doorTop + DH - DH * 0.05;
    const panels: React.ReactNode[] = [];
    if (style === "classic") {
      const n = pct > 0 ? 1 : 2;
      const gap = DH * 0.04;
      const ph = (bottom - top - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        panels.push(<rect key={`p${i}`} x={x + inset} y={top + i * (ph + gap)} width={w - inset * 2} height={ph} fill="none" stroke={edge} strokeWidth={2} />);
        panels.push(<rect key={`q${i}`} x={x + inset + 5} y={top + i * (ph + gap) + 5} width={w - inset * 2 - 10} height={ph - 10} fill="none" stroke={edge} strokeWidth={1} />);
      }
    } else {
      const ys = pct > 0 ? [top] : [0.25, 0.5, 0.75].map((f) => doorTop + DH * f);
      ys.forEach((yy, i) => panels.push(<line key={`g${i}`} x1={x} x2={x + w} y1={yy} y2={yy} stroke={edge} strokeWidth={2} />));
    }
    const fw = s.glassFrame === "wide" ? 7 : s.glassFrame === "slim" ? 3 : 0;
    return (
      <g key={key}>
        <rect x={x} y={doorTop} width={w} height={DH} fill={doorColor} stroke="rgb(0 0 0 / 0.5)" strokeWidth={1.2} />
        {pct > 0 && (
          <>
            {fw > 0 && <rect x={x + inset - fw} y={gy - fw} width={w - inset * 2 + fw * 2} height={gh + fw * 2} fill="rgb(0 0 0 / 0.28)" />}
            <GlassPattern kind={glass} x={x + inset} y={gy} w={w - inset * 2} h={gh} tint={glassTint} />
          </>
        )}
        {panels}
      </g>
    );
  };

  let ux = x0 + G.fr;
  const els: React.ReactNode[] = [];
  const hingeXs: number[] = [];
  const handleColor = s.handleFinish;
  units.forEach((u, i) => {
    if (u.t === "s") {
      els.push(slab(ux, u.w, s.sideliteGlass, sidePct, `u${i}`));
    } else if (dbl) {
      els.push(slab(ux, G.leaf, s.glass, litePct, `d${i}a`), slab(ux + G.leaf, G.leaf, s.glass, litePct, `d${i}b`));
      els.push(<line key="seam" x1={ux + G.leaf} x2={ux + G.leaf} y1={doorTop} y2={doorBottom} stroke="rgb(0 0 0 / 0.55)" strokeWidth={2} />);
      els.push(<Handle key="h1" cx={ux + G.leaf - 14} cy={doorTop + DH * 0.55} model={s.handle} color={handleColor} toRight={false} />);
      els.push(<Handle key="h2" cx={ux + G.leaf + 14} cy={doorTop + DH * 0.55} model={s.handle} color={handleColor} toRight />);
      hingeXs.push(ux - 1, ux + G.leaf * 2 + 1);
    } else {
      els.push(slab(ux, G.leaf, s.glass, litePct, `d${i}`));
      const hingeLeft = (s.hand === "left") === exterior;
      hingeXs.push(hingeLeft ? ux - 1 : ux + G.leaf + 1);
      const px = hingeLeft ? ux + G.leaf - 16 : ux + 16;
      els.push(<Handle key="h" cx={px} cy={doorTop + DH * 0.55} model={s.handle} color={handleColor} toRight={hingeLeft ? false : true} />);
      const mid = ux + G.leaf / 2;
      if (s.accessory === "knocker") els.push(<circle key="k" cx={mid} cy={doorTop + DH * 0.17} r={7} fill="none" stroke={handleColor} strokeWidth={3} />);
      if (s.accessory === "kick") els.push(<rect key="kp" x={ux + 6} y={doorTop + DH - 26} width={G.leaf - 12} height={18} fill={handleColor} stroke="rgb(0 0 0 / 0.4)" />);
      if (s.accessory === "mail") els.push(<rect key="ml" x={ux + G.leaf * 0.25} y={doorTop + DH * 0.72} width={G.leaf * 0.5} height={10} rx={2} fill={handleColor} stroke="rgb(0 0 0 / 0.4)" />);
    }
    ux += u.w + G.mul;
  });

  const pad = 10;
  const viewBox = mode === "cutout"
    ? `${x0 - pad} ${topY - pad} ${OW + pad * 2} ${doorBottom + G.sill - topY + pad * 2}`
    : `0 70 420 ${G.ground - 70}`;

  return (
    <svg
      viewBox={viewBox}
      className={className}
      role="img"
      aria-label={`Schematic ${view} view of the door`}
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <linearGradient id={`${uid}-sheen`} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.16" />
        </linearGradient>
      </defs>
      <rect x={x0 - 6} y={topY - 6} width={OW + 12} height={doorBottom - topY + 6} fill={frameColor} stroke="rgb(0 0 0 / 0.4)" />
      <rect x={x0} y={topY} width={OW} height={doorBottom - topY} fill={frameColor} stroke="rgb(0 0 0 / 0.5)" />
      {tran && (
        <g>
          <rect x={x0 + G.fr} y={doorTop - G.mul - G.tran} width={inner} height={G.tran} fill={frameColor} stroke="rgb(0 0 0 / 0.5)" />
          <GlassPattern kind={s.transomGlass} x={x0 + G.fr + 6} y={doorTop - G.mul - G.tran + 6} w={inner - 12} h={G.tran - 12} tint={glassTint} />
        </g>
      )}
      {els}
      {hingeXs.flatMap((hx) =>
        [0.12, 0.5, 0.88].map((f) => (
          <rect key={`${hx}-${f}`} x={hx - 2.5} y={doorTop + DH * f - 9} width={5} height={18} rx={2} fill={handleColor} stroke="rgb(0 0 0 / 0.4)" />
        )),
      )}
      <rect x={x0 - 10} y={doorBottom} width={OW + 20} height={G.sill} fill={s.colorSill} stroke="rgb(0 0 0 / 0.45)" />
      <rect x={x0} y={topY} width={OW} height={doorBottom - topY} fill={`url(#${uid}-sheen)`} pointerEvents="none" />
    </svg>
  );
}

function Handle({ cx, cy, model, color, toRight }: { cx: number; cy: number; model: Selections["handle"]; color: string; toRight: boolean }) {
  const st = { stroke: "rgb(0 0 0 / 0.45)", strokeWidth: 1 };
  const d = toRight ? 1 : -1;
  switch (model) {
    case "bar":
      return <rect x={cx - 3.5} y={cy - 42} width={7} height={84} rx={3.5} fill={color} {...st} />;
    case "knob":
      return <circle cx={cx} cy={cy} r={11} fill={color} {...st} />;
    case "pull":
      return <rect x={cx - 3} y={cy - 36} width={6} height={72} rx={3} fill={color} {...st} />;
    default:
      return (
        <g>
          <rect x={cx - 6} y={cy - 22} width={12} height={44} rx={5} fill={color} {...st} />
          <rect x={d > 0 ? cx : cx - 30} y={cy - 4} width={30} height={8} rx={4} fill={color} {...st} />
          <circle cx={cx} cy={cy - 40} r={6} fill={color} {...st} />
        </g>
      );
  }
}

/** Width ÷ height of the cropped "cutout" rendering, so callers can size the overlay on a photo. */
export function cutoutAspect(s: Selections): number {
  const dbl = isDouble(s.layout);
  const widths = [hasLeftSide(s.layout) ? G.side : 0, dbl ? G.leaf * 2 : G.leaf, hasRightSide(s.layout) ? G.side : 0].filter(Boolean);
  const inner = widths.reduce((a, b) => a + b, 0) + G.mul * (widths.length - 1);
  const DH = s.height === "tall" ? 360 : 300;
  const total = DH + (hasTransom(s.layout) ? G.mul + G.tran : 0) + G.fr + G.sill;
  return (inner + G.fr * 2 + 20) / (total + 20);
}
