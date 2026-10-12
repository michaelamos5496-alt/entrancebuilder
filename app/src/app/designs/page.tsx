import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { DesignsList } from "@/features/designs/DesignsList";

export const metadata: Metadata = { title: "My designs" };

export default function DesignsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight">My designs</h1>
          <p className="mt-2 max-w-xl text-muted">Everything you&apos;ve saved. Open a project to keep editing, or rename, duplicate or delete it.</p>
        </div>
        <ButtonLink href="/configurator">+ Add a door</ButtonLink>
      </div>
      <DesignsList />
    </div>
  );
}
