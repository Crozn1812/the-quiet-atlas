import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DENYLIST_ENV,
  formatReport,
  isLikelyAwsAccountId,
  loadAllowlist,
  loadDenylist,
  maskValue,
  parseDenylist,
  scanDirs,
  scanText,
} from "../../../tools/scan-leaks/index.mjs";

// Mọi giá trị trong file này và fixtures/scan-leaks là giá trị GIẢ (repo public).
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures", "scan-leaks");
const cli = path.resolve(here, "../../../tools/scan-leaks/index.mjs");
const denylistFixture = path.join(fixtures, "denylist.example.txt");
const allowlist = loadAllowlist();
const fx = (name: string) => path.join(fixtures, name);
const rulesOf = (dir: string, denylist: string[] = []) =>
  scanDirs([fx(dir)], { allowlist, denylist, cwd: fixtures }).hits.map((h) => h.ruleName);

describe("scan-leaks fixtures", () => {
  it("passes the clean fixture (hashes, integrity, floats, public IPs, allowlisted email)", () => {
    const report = scanDirs([fx("clean")], { allowlist, cwd: fixtures });
    expect(report.hits).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.filesScanned).toBe(1);
  });

  it("R1: flags a standalone 12-digit AWS account ID (plain and in a sign-in URL)", () => {
    const report = scanDirs([fx("dirty-aws-account")], { allowlist, cwd: fixtures });
    expect(report.hits.map((h) => [h.file, h.line, h.rule])).toEqual([
      ["dirty-aws-account/notes.md", 3, "R1"],
      ["dirty-aws-account/notes.md", 4, "R1"],
    ]);
  });

  it("R2: flags arn:aws:", () => {
    expect(rulesOf("dirty-arn")).toEqual(["aws-arn"]);
  });

  it("R3: flags a GUID near subscription/tenant/directory", () => {
    expect(rulesOf("dirty-azure")).toEqual(["azure-guid"]);
  });

  it("R4: flags private IPs and internal domains", () => {
    const rules = rulesOf("dirty-internal");
    expect(rules.filter((r) => r === "internal-ip")).toHaveLength(3);
    expect(rules.filter((r) => r === "internal-domain")).toHaveLength(3);
  });

  it("R5: flags denylisted names/emails only when a denylist is supplied", () => {
    expect(rulesOf("dirty-denylist")).toEqual(["email"]);
    const terms = parseDenylist("# comment\n\nacme-partner\ncolleague@example.invalid\n");
    expect(terms).toEqual(["acme-partner", "colleague@example.invalid"]);
    expect(rulesOf("dirty-denylist", terms).sort()).toEqual(["denylist", "denylist", "email"]);
  });

  it("R6: flags emails not in the allowlist", () => {
    expect(rulesOf("dirty-email")).toEqual(["email"]);
  });

  it("never returns or prints the full matched value", () => {
    const report = scanDirs([fx("dirty-aws-account"), fx("dirty-email"), fx("dirty-internal")], {
      allowlist,
      cwd: fixtures,
    });
    const text = formatReport(report);
    for (const secret of ["123456789012", "someone.else@example.invalid", "10.0.0.5", "wiki.acme.corp"]) {
      expect(text).not.toContain(secret);
      expect(JSON.stringify(report)).not.toContain(secret);
    }
    expect(text).toContain("RESULT: FAIL");
    expect(maskValue("123456789012")).toBe("123…(12 chars)");
  });

  it("reports a missing directory as an error", () => {
    const report = scanDirs([fx("does-not-exist")], { allowlist, cwd: fixtures });
    expect(report.ok).toBe(false);
    expect(report.errors).toHaveLength(1);
  });
});

describe("R1 heuristic", () => {
  const check = (text: string, needle = "123456789012") => {
    const i = text.indexOf(needle);
    return isLikelyAwsAccountId(text, i, i + needle.length);
  };
  it("keeps plain IDs, ARN-style and URL-path positions", () => {
    expect(check("id 123456789012.")).toBe(true);
    expect(check("/accounts/123456789012/")).toBe(true);
    expect(check("acct_123456789012")).toBe(true);
  });
  it("drops floats/versions and digits inside a base64 blob", () => {
    expect(check("3.123456789012")).toBe(false);
    expect(check("123456789012.5")).toBe(false);
    expect(check("sha512-Qw+123456789012/AbCdEfGhIjKlMnOpQrStUvWx==")).toBe(false);
    expect(check("3f2b8c1e-9a4d-4e7f-8b6a-123456789012")).toBe(false);
  });
  it("regex never matches 12 digits glued to other alphanumerics (hex/nanoid)", () => {
    expect(scanText("chunk-0a1b123456789012ff.js 1234567890123 x123456789012")).toEqual([]);
  });
});

describe("R3 window", () => {
  it("ignores a GUID when the keyword is further than 80 chars away", () => {
    const guid = "00000000-1111-2222-3333-444444444444";
    expect(scanText(`tenant${" ".repeat(81)}${guid}`)).toEqual([]);
    expect(scanText(`${guid}${" ".repeat(81)}subscription`)).toEqual([]);
    expect(scanText(`tenant${" ".repeat(80)}${guid}`).map((h) => h.rule)).toEqual(["R3"]);
    expect(scanText(`${guid}${" ".repeat(80)}Directory`).map((h) => h.rule)).toEqual(["R3"]);
    expect(scanText(`{"subscriptionId":"${guid}"}`).map((h) => h.rule)).toEqual(["R3"]);
  });
});

describe("denylist loading", () => {
  it("warns and skips R5 when the env var is unset", () => {
    const r = loadDenylist({});
    expect(r.terms).toEqual([]);
    expect(r.warning).toContain(DENYLIST_ENV);
  });
  it("reads terms from the file named by the env var", () => {
    expect(loadDenylist({ [DENYLIST_ENV]: denylistFixture }).terms).toEqual([
      "acme-partner",
      "colleague@example.invalid",
    ]);
  });
  it("throws when the env var points to a missing file", () => {
    expect(() => loadDenylist({ [DENYLIST_ENV]: path.join(fixtures, "nope.txt") })).toThrow();
  });
});

describe("CLI exit code", () => {
  const run = (args: string[], env: Record<string, string> = {}) => {
    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
    if (!(DENYLIST_ENV in env)) delete childEnv[DENYLIST_ENV];
    return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env: childEnv });
  };

  it("exits 0 on clean, 1 on dirty, 2 on a missing directory", () => {
    const ok = run([fx("clean")]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("RESULT: PASS");
    expect(ok.stdout).toContain(DENYLIST_ENV);

    const bad = run([fx("dirty-arn")]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("[R2 aws-arn]");
    expect(bad.stderr).not.toContain("example-bucket");

    expect(run([fx("does-not-exist")]).status).toBe(2);
  });

  it("applies the denylist from TQA_DENYLIST_FILE", () => {
    const bad = run([fx("dirty-denylist")], { [DENYLIST_ENV]: denylistFixture });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("[R5 denylist]");
    expect(bad.stderr).not.toContain(DENYLIST_ENV + " chưa đặt");
  });
});
