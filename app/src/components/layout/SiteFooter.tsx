import Link from "next/link";

const LINKS = [
  { href: "/configurator", label: "Create a door" },
  { href: "/designs", label: "My designs" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms & Conditions" },
] as const;

export function SiteFooter() {
  return (
    <footer className="no-print mt-auto">
      <nav aria-label="Footer" className="bg-slate">
        <ul className="mx-auto flex max-w-7xl flex-wrap justify-center gap-x-8 gap-y-1 px-4 py-4 text-sm text-white/80">
          {LINKS.map((l) => (
            <li key={l.href}><Link href={l.href} className="inline-block py-1.5 hover:text-white hover:underline">{l.label}</Link></li>
          ))}
        </ul>
      </nav>
      <div className="bg-footer">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-white/65 sm:px-6">
          © 2026 Threshold. All rights reserved. Product images are illustrative and do not constitute a contractual offer.
        </p>
      </div>
    </footer>
  );
}
