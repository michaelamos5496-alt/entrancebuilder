# Operations: logging, monitoring and hardening

## What is logged
One JSON object per line on stdout/stderr (Vercel captures these; add a log drain to keep them longer). Fields: `ts`, `level`, `event`, `app`, plus event data. **Redacted by construction:** any key named like authorization/cookie/token/password/secret/apikey/service_role/session/jwt/email/signature is replaced; strings are truncated; bodies, photos, cookies, file paths and user ids are never passed to the logger.

| Event | Level | When | Fields |
|---|---|---|---|
| `api` | info / warn (4xx) / error (5xx) | each project-media or project-delete call | `route`, `status`, `ms`, `code` |
| `server_error` | error | any unhandled server error (Next `onRequestError`) | `name`, `message`, `digest`, `path` (no query), `method`, `routeType`, `routePath` |
| `client_error` | warn | an uncaught browser error or render-error boundary (`/api/client-error`) | `message`, `path` (no query/fragment), `source`, `line`, `userAgent` |

The browser reporter sends at most 5 distinct errors per page load, only the message / page path / browser, and the endpoint validates, size-caps (4 KB) and rate-limits (best effort) them. The privacy page discloses this.

## Health and uptime
`GET /api/health` → `{status, mode, serviceKeyConfigured, version, env, time}`. Point an external uptime monitor at it (alert on non-200 or `serviceKeyConfigured:false` in cloud mode). It does not touch the database; database health is covered by Supabase's own dashboard.

## What to alert on (suggested)
* `/api/health` not 200 for 2 consecutive minutes.
* Spike in `api` events with `status >= 500` or in `server_error`.
* Repeated `api` 401/404 bursts from one source (probing) → add platform rate limiting.
* `client_error` spike after a deploy → roll back (`DEPLOYMENT.md` §6).

## Forwarding to an error-tracking service (not integrated)
No third-party monitoring is wired in (no account exists). To add one: send the same payloads from `src/instrumentation.ts` (server) and `src/components/layout/ErrorReporter.tsx` (browser), allow its origin in `src/lib/securityHeaders.ts` (CSP `connect-src`), and update the privacy page.

## Known hardening steps not done
1. **Nonce-based CSP** (currently `script-src 'self' 'unsafe-inline'` because of Next's inline bootstrap scripts).
2. **Rate limiting** of `/api/projects/**` and `/api/client-error` (the in-memory limiter is per-instance and best effort): use the platform firewall.
3. Server-side re-encoding of uploaded images (metadata is stripped; pixels are not re-encoded).
4. Alerting is documented, not configured.
