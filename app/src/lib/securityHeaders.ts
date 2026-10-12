/**
 * HTTP security headers. Pure so it can be unit-tested; applied by next.config.ts.
 *
 * CSP notes (honest limits):
 *  - `script-src 'unsafe-inline'` is required by Next.js's inline bootstrap scripts unless per-request nonces are used.
 *    Nonces are the stronger setup and are listed as a hardening step in docs/OPERATIONS.md.
 *  - The Supabase origin is allowed only when cloud mode is configured at build time.
 *  - `blob:` and `data:` images are needed: the app draws photos and the door from object URLs and SVG data URLs.
 *  - Development builds get no CSP (React dev tooling needs eval).
 */
export interface HeaderOptions {
  /** NEXT_PUBLIC_SUPABASE_URL, if cloud mode is configured */
  supabaseUrl?: string | null;
  production: boolean;
}

export interface HeaderEntry { key: string; value: string }

export function supabaseOrigin(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(o: HeaderOptions): string {
  const sb = supabaseOrigin(o.supabaseUrl);
  const ws = sb ? sb.replace(/^http/, "ws") : null;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...(sb ? [sb] : [])],
    "font-src": ["'self'"],
    "connect-src": ["'self'", "blob:", "data:", ...(sb ? [sb] : []), ...(ws ? [ws] : [])],
    "media-src": ["'none'"],
    "object-src": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (o.production) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(o: HeaderOptions): HeaderEntry[] {
  const h: HeaderEntry[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (o.production) {
    h.push({ key: "Content-Security-Policy", value: contentSecurityPolicy(o) });
    h.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  }
  return h;
}
