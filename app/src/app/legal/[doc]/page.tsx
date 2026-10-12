import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isCloudConfigured } from "@/lib/env";

const DOCS = {
  privacy: {
    title: "Privacy",
    body: [
      "This is placeholder copy until legal text is approved.",
      isCloudConfigured()
        ? "Projects you save are stored privately in your account. If you choose to save a house photo with a project, it is stored in private storage that only you can read; it is never public and never part of a share link."
        : "Designs you save are kept in your own browser storage and are not sent to our servers. House photos you choose are read by your browser and never uploaded.",
      "Share links contain the door configuration encoded in the address. Anyone who has the link can see that configuration.",
      "Your cookie choice is stored on your device. No analytics or advertising trackers are active in this version.",
      "If something breaks, the app may send a short technical error report (the message, the page address without anything after a question mark, and your browser name) to our logs so we can fix it. Reports never include photos, designs or personal details.",
    ],
  },
  terms: {
    title: "Terms & Conditions",
    body: [
      "This is placeholder copy until legal text is approved.",
      "Product images are illustrative and may not exactly represent the product. Colors on screen are a guide only.",
      "A configuration is provided for information only and does not constitute a contractual offer.",
    ],
  },
} as const;

type Params = { doc: string };

export function generateStaticParams(): Params[] {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { doc } = await params;
  const d = DOCS[doc as keyof typeof DOCS];
  return { title: d?.title ?? "Not found" };
}

export default async function LegalPage({ params }: { params: Promise<Params> }) {
  const { doc } = await params;
  const d = DOCS[doc as keyof typeof DOCS];
  if (!d) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-black tracking-tight">{d.title}</h1>
      <div className="mt-6 space-y-4 text-lg leading-relaxed text-muted">
        {d.body.map((p) => <p key={p}>{p}</p>)}
      </div>
    </article>
  );
}
