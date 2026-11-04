import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_SUBCOMMANDS,
  REPO_ROOT,
  ROOTS,
  assertAllowed,
  buildSteps,
  initArgs,
  main,
  sanitizeEnv,
} from "../../../tools/checks/terraform.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

type Call = { bin: string; args: string[]; env: Record<string, string> };

function fakeRun(fail?: (args: string[]) => boolean) {
  const calls: Call[] = [];
  const run = (bin: string, args: string[], opts: { env: Record<string, string> }) => {
    calls.push({ bin, args, env: opts.env });
    if (fail?.(args)) return { status: 1, stdout: "", stderr: "" };
    return { status: 0, stdout: args[0] === "version" ? "Terraform v1.16.6\non windows_amd64\n" : "", stderr: "" };
  };
  return { run, calls };
}

function quiet<T>(fn: () => T): T {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, orig);
  }
}

function listFiles(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === ".terraform" ? [] : listFiles(p, ext);
    return p.endsWith(ext) ? [p] : [];
  });
}

describe("tools/checks/terraform.mjs", () => {
  it("resolves the repo root from the script location", () => {
    expect(REPO_ROOT).toBe(repo);
    expect(ROOTS).toEqual(["infra/bootstrap", "infra/envs/prod"]);
  });

  it("strips AWS credentials and TF variables from the child environment", () => {
    const env = sanitizeEnv({
      PATH: "/bin",
      AWS_ACCESS_KEY_ID: "x",
      AWS_SECRET_ACCESS_KEY: "x",
      AWS_PROFILE: "p",
      TF_VAR_alert_email: "x",
      TF_CLI_ARGS_plan: "x",
      TF_TOKEN_app_terraform_io: "x",
    });
    expect(Object.keys(env).filter((k) => k.startsWith("AWS_"))).toEqual(["AWS_EC2_METADATA_DISABLED"]);
    expect(env.TF_VAR_alert_email).toBeUndefined();
    expect(env.TF_CLI_ARGS_plan).toBeUndefined();
    expect(env.TF_TOKEN_app_terraform_io).toBeUndefined();
    expect(env.PATH).toBe("/bin");
    expect(env.TF_INPUT).toBe("0");
  });

  it("only ever runs fmt/init(-backend=false)/validate, never plan or apply", () => {
    expect(ALLOWED_SUBCOMMANDS).toEqual(["version", "fmt", "init", "validate"]);
    for (const bad of ["plan", "apply", "import", "destroy", "state"]) {
      expect(() => assertAllowed([bad])).toThrow();
    }
    const steps = buildSteps(() => true);
    for (const s of steps) expect(["fmt", "init", "validate"]).toContain(s.args[0]);
    for (const s of steps.filter((x) => x.args[0] === "init")) expect(s.args).toContain("-backend=false");
    expect(initArgs(true)).toContain("-lockfile=readonly");
    expect(initArgs(false)).not.toContain("-lockfile=readonly");
  });

  it("returns 2 (BLOCKED) when terraform cannot be executed", () => {
    const run = () => ({ error: new Error("spawn terraform ENOENT"), status: null, stdout: "", stderr: "" });
    expect(quiet(() => main({ TERRAFORM_BIN: "/nope/terraform" }, { run }))).toBe(2);
  });

  it("returns 0 when every step succeeds and passes a credential-free env", () => {
    const { run, calls } = fakeRun();
    const code = quiet(() => main({ TERRAFORM_BIN: "tf", AWS_SECRET_ACCESS_KEY: "x" }, { run }));
    expect(code).toBe(0);
    expect(calls.length).toBe(1 + buildSteps(() => true).length);
    for (const c of calls) {
      expect(c.bin).toBe("tf");
      expect(c.env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    }
  });

  it("returns 1 and skips validate when init fails", () => {
    const { run, calls } = fakeRun((args) => args[0] === "init");
    expect(quiet(() => main({ TERRAFORM_BIN: "tf" }, { run }))).toBe(1);
    expect(calls.some((c) => c.args[0] === "validate")).toBe(false);
  });
});

describe("infra/ safety invariants (static)", () => {
  const workflow = readFileSync(path.join(repo, ".github/workflows/pr.yml"), "utf8");
  const tfJob = workflow.slice(workflow.indexOf("\n  terraform:"));

  it("CI terraform job never plans/applies and pins every action by full commit SHA", () => {
    expect(tfJob.length).toBeGreaterThan(20);
    expect(tfJob).not.toMatch(/terraform\s+(plan|apply|import|destroy)/);
    expect(tfJob).not.toMatch(/id-token/);
    const uses = [...tfJob.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/);
  });

  it("OIDC trust policies use exact aud/sub matches (no wildcards)", () => {
    const oidc = readFileSync(path.join(repo, "infra/bootstrap/oidc.tf"), "utf8");
    expect(oidc).toContain('url            = "https://${local.github_oidc_host}"');
    expect(oidc).toContain('github_oidc_host = "token.actions.githubusercontent.com"');
    expect(oidc).not.toMatch(/StringLike/);
    expect(oidc.match(/variable = "\$\{local.github_oidc_host\}:aud"/g)?.length).toBe(2);
    expect(oidc.match(/values   = \["sts.amazonaws.com"\]/g)?.length).toBe(2);
    expect(oidc).toContain('sub_pull_request = "repo:${var.github_repository}:pull_request"');
    expect(oidc).toContain('sub_production   = "repo:${var.github_repository}:environment:${var.github_environment}"');
  });

  it("no long-lived keys, public ACLs or committed secrets in infra/", () => {
    const files = listFiles(path.join(repo, "infra"), ".tf");
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/aws_iam_access_key|aws_iam_user\b/);
      expect(src, f).not.toMatch(/public-read/);
      expect(src, f).not.toMatch(/\b\d{12}\b/); // không account ID cứng
      expect(src, f).not.toMatch(/block_public_\w+\s*=\s*false|ignore_public_acls\s*=\s*false|restrict_public_buckets\s*=\s*false/);
    }
  });

  it("site bucket policy only allows CloudFront scoped to the distribution ARN", () => {
    const src = readFileSync(path.join(repo, "infra/modules/static-site/main.tf"), "utf8");
    expect(src).toContain('identifiers = ["cloudfront.amazonaws.com"]');
    expect(src).toContain('variable = "AWS:SourceArn"');
    expect(src).toContain("values   = [aws_cloudfront_distribution.site.arn]");
  });
});

describe("CloudFront Functions (static-site)", () => {
  const load = (name: string) =>
    new Function(`${readFileSync(path.join(repo, "infra/modules/static-site/functions", name), "utf8")}; return handler;`)() as (
      e: unknown,
    ) => Record<string, unknown> & { uri?: string; statusCode?: number; headers: Record<string, { value: string }> };
  const req = (host: string, uri: string, querystring: Record<string, unknown> = {}) => ({
    request: { uri, querystring, headers: { host: { value: host } } },
  });
  const viewerRequest = load("viewer-request.js");

  it("rewrites directory URLs to index.html", () => {
    expect(viewerRequest(req("example.com", "/")).uri).toBe("/index.html");
    expect(viewerRequest(req("example.com", "/en/quick/")).uri).toBe("/en/quick/index.html");
    expect(viewerRequest(req("example.com", "/_next/static/a.js")).uri).toBe("/_next/static/a.js");
  });

  it("301 adds the trailing slash and keeps the query string", () => {
    const r = viewerRequest(req("example.com", "/en/quick", { a: { value: "1" } }));
    expect(r.statusCode).toBe(301);
    expect(r.headers.location?.value).toBe("/en/quick/?a=1");
  });

  it("301 www -> apex in one hop", () => {
    const r = viewerRequest(req("WWW.example.com", "/en/quick"));
    expect(r.statusCode).toBe(301);
    expect(r.headers.location?.value).toBe("https://example.com/en/quick/");
  });

  it("viewer-response adds Permissions-Policy and CSP frame-ancestors", () => {
    const r = load("viewer-response.js")({ response: { headers: {} } }) as { headers: Record<string, { value: string }> };
    expect(r.headers["content-security-policy"]?.value).toBe("frame-ancestors 'none'");
    expect(r.headers["permissions-policy"]?.value).toContain("camera=()");
  });
});
