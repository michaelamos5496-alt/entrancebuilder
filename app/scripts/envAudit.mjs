// Environment and secret audit. Used by `npm run audit:env` and automatically after every production build.
// Pure functions are exported for tests; the CLI at the bottom runs them against the real source and build output.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Public (browser-visible) variables must never look like secrets. */
const SECRET_NAME = /(SECRET|SERVICE_?ROLE|PRIVATE|PASSWORD|PASSWD|TOKEN|CREDENTIAL)/i;
/** Variables the app is allowed to read, with where they may be read. */
export const KNOWN = {
  NEXT_PUBLIC_SUPABASE_URL: { public: true },
  NEXT_PUBLIC_SUPABASE_ANON_KEY: { public: true },
  SUPABASE_SERVICE_ROLE_KEY: { public: false },
  // provided by the platform / Node
  NODE_ENV: { public: true },
  VERCEL_ENV: { public: false },
  VERCEL_GIT_COMMIT_SHA: { public: false },
};

export function findEnvUsage(source) {
  const out = new Set();
  for (const m of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) out.add(m[1]);
  for (const m of source.matchAll(/process\.env\[\s*["']([A-Z0-9_]+)["']\s*\]/g)) out.add(m[1]);
  return [...out];
}

export const isClientFile = (source) => /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*["']use client["']/.test(source);

/** Static findings about env var usage across source files: [{file, source}] */
export function auditSource(files) {
  const problems = [];
  const seen = new Set();
  for (const { file, source } of files) {
    const client = isClientFile(source);
    for (const name of findEnvUsage(source)) {
      seen.add(name);
      if (!(name in KNOWN)) problems.push(`${file}: reads unknown environment variable ${name}. Add it to KNOWN in scripts/envAudit.mjs and document it in docs/ENVIRONMENT.md.`);
      else if (client && !KNOWN[name].public) problems.push(`${file}: a client component reads the private variable ${name}.`);
      if (name.startsWith("NEXT_PUBLIC_") && SECRET_NAME.test(name)) problems.push(`${file}: ${name} is exposed to browsers but its name says it is a secret.`);
    }
    if (/serverEnv/.test(source) && client) problems.push(`${file}: a client component imports serverEnv (the privileged key helper).`);
  }
  return { problems, seen: [...seen].sort() };
}

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** Findings for text that is delivered to browsers (build output). `env` is the process environment to compare against. */
export function auditClientOutput(files, env = {}) {
  const problems = [];
  const secretValues = Object.entries(env)
    .filter(([k, v]) => v && String(v).length >= 12 && SECRET_NAME.test(k) && !k.startsWith("NEXT_PUBLIC_"))
    .map(([k, v]) => [k, String(v)]);
  for (const { file, text } of files) {
    for (const [name, value] of secretValues) if (text.includes(value)) problems.push(`${file}: contains the VALUE of ${name}.`);
    for (const m of text.matchAll(JWT)) {
      const p = decodeJwtPayload(m[0]);
      if (p && (p.role === "service_role" || p.role === "supabase_admin")) problems.push(`${file}: contains a Supabase ${p.role} JWT.`);
    }
    if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) problems.push(`${file}: contains a Supabase secret key (sb_secret_…).`);
    if (/SUPABASE_SERVICE_ROLE_KEY/.test(text)) problems.push(`${file}: references SUPABASE_SERVICE_ROLE_KEY (privileged code in a browser bundle).`);
  }
  return problems;
}

function walk(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, filter, out); }
    else if (filter(p)) out.push(p);
  }
  return out;
}

export function run(root, { scanBuild = true } = {}) {
  const src = walk(path.join(root, "src"), (p) => /\.(ts|tsx)$/.test(p) && !/\.test\./.test(p)).map((p) => ({ file: path.relative(root, p), source: fs.readFileSync(p, "utf8") }));
  const s = auditSource(src);
  const problems = [...s.problems];
  const notes = [`environment variables read by the app: ${s.seen.join(", ")}`];

  const gi = path.join(root, ".gitignore");
  if (!fs.existsSync(gi) || !/^\.env\*?$/m.test(fs.readFileSync(gi, "utf8"))) problems.push(".gitignore does not ignore .env files.");
  for (const f of fs.readdirSync(root).filter((f) => /^\.env(\..+)?$/.test(f) && f !== ".env.example")) notes.push(`found ${f} (git-ignored; never commit it)`);

  if (scanBuild) {
    const staticDir = path.join(root, ".next", "static");
    if (fs.existsSync(staticDir)) {
      const out = walk(staticDir, (p) => /\.(js|css|html|json|map|txt)$/.test(p)).map((p) => ({ file: path.relative(root, p), text: fs.readFileSync(p, "utf8") }));
      const found = auditClientOutput(out, process.env);
      problems.push(...found);
      notes.push(`scanned ${out.length} browser-delivered build files for secrets: ${found.length ? "PROBLEMS" : "none found"}`);
    } else notes.push("no .next/static found: build output not scanned");
  }
  return { problems, notes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { problems, notes } = run(process.cwd(), { scanBuild: !process.argv.includes("--source-only") });
  notes.forEach((n) => console.log(`audit:env  ${n}`));
  if (problems.length) {
    console.error(`\naudit:env  FAILED with ${problems.length} problem(s):`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
  console.log("audit:env  OK");
}
