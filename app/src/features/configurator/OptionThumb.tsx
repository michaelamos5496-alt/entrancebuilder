import type { SelectionKey } from "@/domain/design/types";
import { hasLeftSide, hasRightSide, hasTransom, isDouble } from "@/domain/design/layout";
import type { LayoutKey } from "@/domain/design/types";

/** Original line-art thumbnails (no third-party imagery). Placeholder until approved product imagery exists. */
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
const door = (x = 24, w = 24, y = 8, h = 46) => <rect x={x} y={y} width={w} height={h} {...stroke} />;

function LayoutThumb({ layout }: { layout: LayoutKey }) {
  const parts: number[] = [];
  if (hasLeftSide(layout)) parts.push(9);
  parts.push(isDouble(layout) ? 30 : 17);
  if (hasRightSide(layout)) parts.push(9);
  const gap = 2;
  const total = parts.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
  const tran = hasTransom(layout);
  const y = tran ? 18 : 8;
  const h = tran ? 36 : 46;
  let x = (72 - total) / 2;
  const x0 = x;
  const out = parts.map((w, i) => {
    const el = (
      <g key={i}>
        <rect x={x} y={y} width={w} height={h} {...stroke} />
        {isDouble(layout) && w === 30 && <line x1={x + 15} x2={x + 15} y1={y} y2={y + h} {...stroke} />}
      </g>
    );
    x += w + gap;
    return el;
  });
  return (
    <>
      {out}
      {tran && <rect x={x0} y={8} width={total} height={8} {...stroke} />}
    </>
  );
}

export function OptionThumb({ group, value }: { group: SelectionKey; value: string }) {
  let body: React.ReactNode;
  switch (group) {
    case "layout":
      body = <LayoutThumb layout={value as LayoutKey} />;
      break;
    case "height":
      body = door(27, 18, value === "tall" ? 4 : 12, value === "tall" ? 52 : 44);
      break;
    case "hand":
      body = (
        <>
          {door()}
          <circle cx={value === "left" ? 43 : 29} cy={34} r={2.5} fill="currentColor" />
          <path d={`M${value === "left" ? 24 : 48} 14v6M${value === "left" ? 24 : 48} 40v6`} stroke="currentColor" strokeWidth={3} />
        </>
      );
      break;
    case "lite":
    case "sideliteStyle": {
      const h = value === "half" ? 16 : value === "three" || value === "full" ? 28 : 0;
      body = (
        <>
          {door()}
          {h > 0 ? <rect x={29} y={13} width={14} height={h} fill="currentColor" opacity={0.3} /> : <rect x={29} y={14} width={14} height={34} {...stroke} opacity={0.35} />}
        </>
      );
      break;
    }
    case "accessory":
      body = (
        <>
          {door()}
          {value === "knocker" && <circle cx={36} cy={18} r={5} {...stroke} />}
          {value === "kick" && <rect x={27} y={44} width={18} height={6} fill="currentColor" opacity={0.5} />}
          {value === "mail" && <rect x={29} y={30} width={14} height={4} fill="currentColor" opacity={0.6} />}
        </>
      );
      break;
    case "glassFrame":
      body = (
        <>
          {door()}
          <rect x={29} y={14} width={14} height={22} {...stroke} strokeWidth={value === "wide" ? 5 : value === "slim" ? 2 : 0.6} />
        </>
      );
      break;
    case "handle":
      body = (
        <>
          {value === "lever" && (<><circle cx={30} cy={30} r={3.5} fill="currentColor" /><rect x={30} y={28} width={22} height={4} rx={2} fill="currentColor" /></>)}
          {value === "bar" && <rect x={32} y={12} width={4} height={36} rx={2} fill="currentColor" />}
          {value === "knob" && <circle cx={36} cy={30} r={9} fill="currentColor" />}
          {value === "pull" && (<><rect x={30} y={16} width={4} height={28} rx={2} fill="currentColor" /><rect x={38} y={16} width={4} height={28} rx={2} fill="currentColor" opacity={0.35} /></>)}
        </>
      );
      break;
    default:
      body = door();
  }
  return (
    <svg viewBox="0 0 72 60" className="h-14 w-full" aria-hidden focusable="false">
      {body}
    </svg>
  );
}
