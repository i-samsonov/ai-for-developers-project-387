import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = new URL("./pr-budget.mjs", import.meta.url);

async function check({ runs, jobs, prRepo = "owner/repo", currentAttempt = "1" }) {
  const folder = mkdtempSync(join(tmpdir(), "pr-budget-"));
  const output = join(folder, "output");
  const originalFetch = globalThis.fetch;
  const original = Object.fromEntries(
    ["GH_TOKEN", "GH_REPO", "PR_NUMBER", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_OUTPUT"]
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, {
    GH_TOKEN: "test-token",
    GH_REPO: "owner/repo",
    PR_NUMBER: "12",
    GITHUB_RUN_ID: "100",
    GITHUB_RUN_ATTEMPT: currentAttempt,
    GITHUB_OUTPUT: output,
  });
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    let body;
    if (path.endsWith("/pulls/12")) body = { head: { repo: { full_name: prRepo } } };
    else if (path.endsWith("/workflows/opencode.yml/runs")) body = { workflow_runs: runs };
    else body = { jobs: jobs[path] ?? [] };
    return { ok: true, json: async () => body };
  };
  try {
    await import(`${script.href}?case=${Math.random()}`);
    return readFileSync(output, "utf8");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(folder, { recursive: true, force: true });
  }
}

const admittedJob = {
  steps: [{ name: "Budget admitted", conclusion: "success" }],
};
const deniedJob = {
  steps: [{ name: "Budget admitted", conclusion: "skipped" }],
};

test("one PR budget includes both comment channels and re-runs, but not rejected requests", async () => {
  const runs = [
    { id: 100, display_title: "opencode PR-12", run_attempt: 2 },
    { id: 98, display_title: "opencode PR-12", run_attempt: 1 },
    { id: 97, display_title: "opencode PR-12", run_attempt: 1 },
    { id: 96, display_title: "opencode issue-12", run_attempt: 1 },
    { id: 95, display_title: "opencode PR-13", run_attempt: 1 },
  ];
  const jobs = {
    "/repos/owner/repo/actions/runs/100/attempts/1/jobs": [admittedJob],
    "/repos/owner/repo/actions/runs/98/attempts/1/jobs": [admittedJob],
    "/repos/owner/repo/actions/runs/97/attempts/1/jobs": [deniedJob],
  };
  assert.match(await check({ runs, jobs, currentAttempt: "2" }), /allowed=true/);
  jobs["/repos/owner/repo/actions/runs/97/attempts/1/jobs"] = [admittedJob];
  assert.match(await check({ runs, jobs, currentAttempt: "2" }), /reason=limit_exhausted/);
});

test("fork PR is rejected before consulting the history", async () => {
  assert.match(await check({ runs: [], jobs: {}, prRepo: "other/repo" }), /reason=untrusted_pr/);
});
