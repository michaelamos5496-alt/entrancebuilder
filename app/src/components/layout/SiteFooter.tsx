import Link from "next/link";

const LINKS = [
  { href: "/configurator", label: "Create a door" },
  { href: "/designs", label: "My designs" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms & Conditions" },
] as const;

export function SiteFooter() {
  return (
    <footer className="no-print mt-auto px-3 pb-3 pt-6 sm:px-4">
      <div className="glass mx-auto max-w-[1600px] rounded-3xl">
      <nav aria-label="Footer">
        <ul className="flex flex-wrap justify-center gap-x-8 gap-y-1 px-4 pt-4 text-sm text-ink/80">
          {LINKS.map((l) => (
            <li key={l.href}><Link href={l.href} className="inline-block py-1.5 hover:text-ink hover:underline">{l.label}</Link></li>
          ))}
        </ul>
      </nav>
      <p className="px-4 pb-5 pt-2 text-center text-xs text-muted">
          © 2026 Threshold. All rights reserved. Product images are illustrative and do not constitute a contractual offer.
      </p>
      </div>
    </footer>
  );
}
