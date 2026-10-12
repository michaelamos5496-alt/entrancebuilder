import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditClientOutput, auditSource, findEnvUsage, isClientFile, run } from "../../../scripts/envAudit.mjs";

const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.c2lnbmF0dXJlLXNpZ25hdHVyZQ`;

describe("environment audit: source", () => {
  it("finds both access styles", () => {
    expect(findEnvUsage(`process.env.A_B; process.env["C_D"]; process.env['E']`).sort()).toEqual(["A_B", "C_D", "E"]);
  });
  it("detects 'use client' files", () => {
    expect(isClientFile('"use client";\nimport x')).toBe(true);
    expect(isClientFile("// c\n'use client'\n")).toBe(true);
    expect(isClientFile('import x from "y";\n"use client"')).toBe(false);
  });
  it("accepts the app's real, known variables", () => {
    const r = auditSource([{ file: "a.ts", source: "process.env.NEXT_PUBLIC_SUPABASE_URL; process.env.SUPABASE_SERVICE_ROLE_KEY" }, { file: "c.tsx", source: '"use client";\nprocess.env.NEXT_PUBLIC_SUPABASE_ANON_KEY' }]);
    expect(r.problems).toEqual([]);
  });
  it("fails on an unknown variable", () => {
    expect(auditSource([{ file: "a.ts", source: "process.env.STRIPE_KEY" }]).problems[0]).toMatch(/unknown environment variable STRIPE_KEY/);
  });
  it("fails when a client component reads a private variable", () => {
    expect(auditSource([{ file: "c.tsx", source: '"use client";\nprocess.env.SUPABASE_SERVICE_ROLE_KEY' }]).problems[0]).toMatch(/client component reads the private variable/);
  });
  it("fails when a client component imports the privileged key helper", () => {
    expect(auditSource([{ file: "c.tsx", source: '"use client";\nimport { serviceRoleKey } from "@/lib/serverEnv";' }]).problems.join()).toMatch(/imports serverEnv/);
  });
});

describe("environment audit: browser-delivered output", () => {
  it("is clean for ordinary code and the public anon key", () => {
    expect(auditClientOutput([{ file: "a.js", text: `var a="${jwt({ role: "anon" })}";console.log("hi")` }], { SUPABASE_SERVICE_ROLE_KEY: "a-very-long-secret-value-123" })).toEqual([]);
  });
  it("catches the VALUE of a configured secret", () => {
    const p = auditClientOutput([{ file: "a.js", text: 'x="a-very-long-secret-value-123"' }], { SUPABASE_SERVICE_ROLE_KEY: "a-very-long-secret-value-123" });
    expect(p[0]).toMatch(/VALUE of SUPABASE_SERVICE_ROLE_KEY/);
  });
  it("catches a service_role JWT even when not configured in this environment", () => {
    expect(auditClientOutput([{ file: "a.js", text: `k="${jwt({ role: "service_role", iss: "supabase" })}"` }])[0]).toMatch(/service_role JWT/);
  });
  it("catches new-style secret keys and references to the variable name", () => {
    expect(auditClientOutput([{ file: "a.js", text: "k='sb_secret_abcdefghijklmnop'" }])[0]).toMatch(/secret key/);
    expect(auditClientOutput([{ file: "a.js", text: "process.env.SUPABASE_SERVICE_ROLE_KEY" }])[0]).toMatch(/references SUPABASE_SERVICE_ROLE_KEY/);
  });
  it("does not flag NEXT_PUBLIC values even if long", () => {
    expect(auditClientOutput([{ file: "a.js", text: 'u="https://abcdefghijkl.supabase.co"' }], { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijkl.supabase.co" })).toEqual([]);
  });
});

describe("environment audit: whole project run", () => {
  it("passes on this repository's source", () => {
    const r = run(process.cwd(), { scanBuild: false });
    expect(r.problems).toEqual([]);
  });
  it("fails a project whose build output leaks a secret", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
    try {
      fs.mkdirSync(path.join(dir, "src"));
      fs.mkdirSync(path.join(dir, ".next", "static"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".gitignore"), ".env*\n");
      fs.writeFileSync(path.join(dir, ".next", "static", "app.js"), `k="${jwt({ role: "service_role" })}"`);
      const r = run(dir);
      expect(r.problems.join()).toMatch(/service_role JWT/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
