import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

type Heading = "h1" | "h2" | "h3";

export function EmptyState({
  icon = "info", title, children, action, as: H = "h2",
}: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode; as?: Heading }) {
  return (
    <div className="grid place-items-center gap-3 rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-canvas text-muted"><Icon name={icon} size={24} /></span>
      <H className="text-lg font-bold">{title}</H>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong", children, action, as: H = "h2",
}: { title?: string; children?: ReactNode; action?: ReactNode; as?: Heading }) {
  return (
    <div role="alert" className="grid place-items-center gap-3 rounded-lg border border-danger/30 bg-white px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-danger/10 text-danger"><Icon name="alert" size={24} /></span>
      <H className="text-lg font-bold">{title}</H>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}
