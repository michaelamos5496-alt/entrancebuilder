import { useId } from "react";
import type { GlassKey } from "@/domain/design/types";

export function GlassThumb({ kind }: { kind: GlassKey }) {
  const id = useId().replace(/:/g, "");
  const x = 14, y = 6, w = 44, h = 48;
  const lines: React.ReactNode[] = [];
  const L = (k: string, a: number, b: number, c: number, d: number, sw = 1.4) => (
    <line key={k} x1={a} y1={b} x2={c} y2={d} stroke="#fff" strokeWidth={sw} opacity={0.9} />
  );
  if (kind === "mosaic" || kind === "arch") {
    for (let i = 1; i < 4; i++) lines.push(L(`v${i}`, x + (w * i) / 4, y, x + (w * i) / 4, y + h));
    for (let i = 1; i < 6; i++) lines.push(L(`h${i}`, x, y + (h * i) / 6, x + w, y + (h * i) / 6));
    if (kind === "arch") lines.push(<ellipse key="e" cx={36} cy={30} rx={14} ry={8} fill="none" stroke="#fff" strokeWidth={1.4} />);
  }
  if (kind === "frosted") lines.push(<rect key="f" x={x} y={y} width={w} height={h} fill="#fff" opacity={0.6} />);
  if (kind === "ripple") for (let i = 0; i < 12; i++) lines.push(L(`r${i}`, x, y + (h * i) / 12, x + w, y + (h * i) / 12 + 2, 1));
  if (kind === "frame") lines.push(<rect key="fr" x={x + 5} y={y + 4} width={w - 10} height={h - 8} fill="none" stroke="#fff" strokeWidth={2} />);
  if (kind === "bands") for (let i = 1; i < 3; i++) lines.push(L(`b${i}`, x + (w * i) / 3, y, x + (w * i) / 3, y + h, 2.5));
  if (kind === "linear") for (let i = 1; i < 8; i++) lines.push(L(`l${i}`, x + (w * i) / 8, y, x + (w * i) / 8, y + h, 1));
  if (kind === "grid") for (let i = 1; i < 3; i++) { lines.push(L(`gv${i}`, x + (w * i) / 3, y, x + (w * i) / 3, y + h, 2.5)); lines.push(L(`gh${i}`, x, y + (h * i) / 3, x + w, y + (h * i) / 3, 2.5)); }
  if (kind === "vent") lines.push(<rect key="v" x={x + 5} y={y + 5} width={w - 10} height={12} fill="#fff" opacity={0.55} />);
  if (kind === "blinds") for (let i = 1; i < 12; i++) lines.push(L(`bl${i}`, x, y + (h * i) / 12, x + w, y + (h * i) / 12, 1.2));
  return (
    <svg viewBox="0 0 72 60" className="h-14 w-full" aria-hidden focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b9d2e0" />
          <stop offset="1" stopColor="#6d93aa" />
        </linearGradient>
        <clipPath id={`${id}c`}><rect x={x} y={y} width={w} height={h} rx={2} /></clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect x={x} y={y} width={w} height={h} fill={`url(#${id})`} />
        {lines}
      </g>
      <rect x={x} y={y} width={w} height={h} rx={2} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}
