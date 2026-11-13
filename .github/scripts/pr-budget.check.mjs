import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

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

test("budget guard is checked out from the trusted repository branch", () => {
  const workflow = readFileSync(new URL("../workflows/opencode.yml", import.meta.url), "utf8");
  assert.match(
    workflow,
    /- name: Checkout repository[\s\S]*?with:\s*\n[\s\S]*?ref: \$\{\{ github\.event\.repository\.default_branch \}\}/,
  );
  assert.ok(workflow.indexOf("- name: Budget admitted") < workflow.indexOf("- name: Checkout PR head for the agent"));
  assert.ok(workflow.indexOf("- name: Checkout PR head for the agent") < workflow.indexOf("- name: Run OpenCode"));
  assert.match(workflow, /- name: Checkout PR head for the agent[\s\S]*?ref: \$\{\{ steps\.pr_head\.outputs\.sha \}\}/);
  assert.ok(workflow.indexOf("- name: Verify model key") < workflow.indexOf("- name: Budget admitted"));
});

test("PR event has no secrets; the trusted follow-up only reads PR diff as data", () => {
  const event = readFileSync(new URL("../workflows/opencode-review.yml", import.meta.url), "utf8");
  const review = readFileSync(new URL("../workflows/opencode-review-publish.yml", import.meta.url), "utf8");
  assert.match(event, /pull_request:/);
  assert.match(event, /run: \|\n\s+printf 'PR #%s head %s\\n' "\$PR_NUMBER" "\$HEAD_SHA"/);
  assert.doesNotMatch(event, /OPENCODE_API_KEY|actions\/checkout|pull-requests: write|workflow_run:/);
  assert.match(review, /workflow_run:[\s\S]*?workflows: \["PR review context", "release-please"\]/);
  assert.doesNotMatch(review, /pull_request_target:|ref: \$\{\{ .*head\.sha \}\}/);
  assert.ok(review.indexOf("- name: Install OpenCode CLI outside any checkout") < review.indexOf("- uses: actions/checkout@v4"));
  assert.match(review, /working-directory: \$\{\{ runner\.temp \}\}/);
  assert.match(review, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(review, /pr\.head\.sha !== run\.head_sha/);
  assert.match(review, /git fetch --no-tags --depth=1 origin "\$BASE_SHA" "\$HEAD_SHA"/);
  assert.match(review, /git ls-tree "\$trusted_sha" REVIEW\.md/);
  assert.doesNotMatch(review, /cp REVIEW\.md/);
  assert.match(review, /-f commit_id="\$HEAD_SHA"/);
  assert.match(review, /Current head SHA has already been reviewed/);
  assert.match(review, /gh api --paginate "repos\/\$GH_REPO\/pulls\/\$PR_NUMBER\/reviews\?per_page=100"/);
});

test("release-please completion can start trusted review without changing the unprivileged PR stage", () => {
  const event = readFileSync(new URL("../workflows/opencode-review.yml", import.meta.url), "utf8");
  const review = readFileSync(new URL("../workflows/opencode-review-publish.yml", import.meta.url), "utf8");
  assert.match(review, /workflows: \["PR review context", "release-please"\]/);
  assert.match(review, /run\.name === "release-please"/);
  assert.match(review, /run\.event === "push"/);
  assert.match(review, /run\.head_branch === "main"/);
  assert.match(review, /run\.head_sha !== mainSha/);
  assert.match(review, /pr\.head\.ref\.startsWith\("release-please--branches--main--components--"\)/);
  assert.match(review, /pr\.user\.login !== "github-actions\[bot\]"/);
  assert.match(review, /workflow_dispatch:/);
  assert.match(review, /contextRun\.conclusion === "success"/);
  assert.match(review, /github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(event, /OPENCODE_API_KEY|actions\/checkout|pull-requests: write|workflow_run:/);
});

async function resolveReview({ run, candidates, currentMain, reviews = [], contexts, manualInputs, associated = candidates }) {
  const workflow = readFileSync(new URL("../workflows/opencode-review-publish.yml", import.meta.url), "utf8");
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line === "          script: |") + 1;
  assert.ok(start > 0);
  const end = lines.findIndex((line, index) => index >= start && line === "  review:");
  assert.ok(end > start);
  const source = lines.slice(start, end).map((line) => line.slice(12)).join("\n");
  const outputs = {};
  const github = {
    rest: {
      repos: {
        getBranch: async () => ({ data: { commit: { sha: currentMain } } }),
        listPullRequestsAssociatedWithCommit: () => {},
      },
      pulls: {
        list: () => {},
        get: async ({ pull_number }) => ({ data: candidates.find((pr) => pr.number === pull_number) }),
        listReviews: () => {},
      },
      actions: { listWorkflowRunsForWorkflow: () => {} },
    },
    paginate: async (method) => method === github.rest.repos.listPullRequestsAssociatedWithCommit ? associated
      : method === github.rest.pulls.list ? candidates
      : method === github.rest.actions.listWorkflowRunsForWorkflow ? (contexts ?? [{
        id: 42, conclusion: "success", head_sha: candidates[0].head.sha,
        head_repository: { full_name: "owner/repo" }, pull_requests: [{ number: candidates[0].number }],
      }]) : reviews,
  };
  const context = { eventName: manualInputs ? "workflow_dispatch" : "workflow_run",
    payload: { workflow_run: run, inputs: manualInputs }, repo: { owner: "owner", repo: "repo" } };
  const core = { setOutput: (key, value) => { outputs[key] = value; }, info: () => {} };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("github", "context", "core", source)(github, context, core);
  return outputs;
}

test("release-please resolves only a current same-repo bot PR and skips previously reviewed heads", async () => {
  const main = "main-sha";
  const run = { name: "release-please", event: "push", head_branch: "main", head_sha: main };
  const release = {
    number: 1, state: "open", user: { login: "github-actions[bot]" },
    author_association: "NONE",
    base: { ref: "main", sha: main },
    head: { sha: "release-sha", ref: "release-please--branches--main--components--calendar-calls", repo: { full_name: "owner/repo" } },
  };
  assert.deepEqual(await resolveReview({ run, candidates: [release], currentMain: main }), {
    number: "1", head_sha: "release-sha", base_sha: main,
  });
  assert.deepEqual(await resolveReview({ run, candidates: [release], currentMain: "new-main" }), {});
  assert.deepEqual(await resolveReview({ run, candidates: [{ ...release, head: { ...release.head, repo: { full_name: "fork/repo" } } }], currentMain: main }), {});
  assert.deepEqual(await resolveReview({ run, candidates: [{ ...release, user: { login: "stranger" } }], currentMain: main }), {});
  assert.deepEqual(await resolveReview({ run, candidates: [{ ...release, head: { ...release.head, ref: "feat/not-a-release" } }], currentMain: main }), {});
  assert.deepEqual(await resolveReview({ run, candidates: [{ ...release, base: { ref: "main", sha: "old-main" } }], currentMain: main }), {});
  assert.deepEqual(await resolveReview({ run, candidates: [release], currentMain: main, reviews: [{ commit_id: "release-sha", user: { login: "github-actions[bot]" } }] }), {});
  assert.deepEqual(await resolveReview({ run, candidates: [release], currentMain: main, contexts: [] }), {});
  assert.deepEqual(await resolveReview({ run: undefined, candidates: [release], currentMain: main,
    manualInputs: { pr_number: "1", context_run_id: "42" } }), {
    number: "1", head_sha: "release-sha", base_sha: main,
  });
  assert.deepEqual(await resolveReview({ run: undefined, candidates: [release], currentMain: main,
    manualInputs: { pr_number: "1", context_run_id: "43" } }), {});
});

test("normal PR context still requires the event head SHA", async () => {
  const current = { number: 11, state: "open", user: { login: "owner" },
    author_association: "OWNER", base: { ref: "main", sha: "main-sha" },
    head: { sha: "new-sha", repo: { full_name: "owner/repo" } } };
  const run = { name: "PR review context", event: "pull_request",
    head_sha: "old-sha", pull_requests: [{ number: 11 }] };
  assert.deepEqual(await resolveReview({ run, candidates: [current], currentMain: "main-sha" }), {});
  assert.deepEqual(await resolveReview({ run: { ...run, head_sha: "new-sha" }, candidates: [current], currentMain: "main-sha" }),
    { number: "11", head_sha: "new-sha", base_sha: "main-sha" });
  assert.deepEqual(await resolveReview({ run: { ...run, head_sha: "new-sha" }, candidates: [current], currentMain: "main-sha",
    reviews: [{ commit_id: "new-sha", user: { login: "github-actions[bot]" } }] }), {});
});

test("release context with no pull_requests is linked by commit association for both trigger paths", async () => {
  const release = {
    number: 1, state: "open", user: { login: "github-actions[bot]" }, author_association: "NONE",
    base: { ref: "main", sha: "main-sha" },
    head: { sha: "release-sha", ref: "release-please--branches--main--components--calendar-calls",
      repo: { full_name: "owner/repo" } },
  };
  const run = { name: "release-please", event: "push", head_branch: "main", head_sha: "main-sha" };
  const contexts = [{ id: 42, conclusion: "success", head_sha: "release-sha",
    head_repository: { full_name: "owner/repo" }, pull_requests: [] }];
  const expected = { number: "1", head_sha: "release-sha", base_sha: "main-sha" };
  assert.deepEqual(await resolveReview({ run, candidates: [release], currentMain: "main-sha", contexts }), expected);
  assert.deepEqual(await resolveReview({ candidates: [release], currentMain: "main-sha", contexts,
    manualInputs: { pr_number: "1", context_run_id: "42" } }), expected);
  assert.deepEqual(await resolveReview({ run, candidates: [release], currentMain: "main-sha",
    contexts, associated: [{ number: 2 }] }), {});
});

test("automatic and manual release review share a non-cancelling concurrency group", () => {
  const review = readFileSync(new URL("../workflows/opencode-review-publish.yml", import.meta.url), "utf8");
  const group = review.match(/^\s+group: (.*)$/m)?.[1];
  assert.ok(group);
  assert.match(group, /\$\{\{ github\.repository_id \}\}/);
  assert.match(group, /github\.event_name == 'workflow_dispatch'/);
  assert.match(group, /github\.event\.workflow_run\.name == 'release-please'/);
  assert.match(group, /startsWith\(github\.event\.workflow_run\.head_branch, 'release-please--branches--main--components--'\)/);
  assert.match(group, /&& 'release-please' \|\| github\.event\.workflow_run\.head_branch/);
  assert.match(review, /cancel-in-progress: false/);
  assert.match(review, /Release PR already reviewed at current head SHA/);
});

test("publish skips a matching review beyond the first page", () => {
  const workflow = readFileSync(new URL("../workflows/opencode-review-publish.yml", import.meta.url), "utf8");
  const publish = workflow.slice(workflow.indexOf("      - name: Publish review bound to the checked SHA"));
  const body = publish.slice(publish.indexOf("        run: |\n") + "        run: |\n".length)
    .split("\n").map((line) => line.slice(10)).join("\n");
  const mock = `
    gh() {
      if [[ "$1" == pr ]]; then printf '%s\\n' "$HEAD_SHA"
      elif [[ "$1" == api && "$2" == --paginate ]]; then printf '%s\\n' 101
      elif [[ "$1" == api && "$2" == --method ]]; then echo posted > "$RUNNER_TEMP/posted"
      fi
    }
  `;
  const folder = mkdtempSync(join(tmpdir(), "review-publish-"));
  try {
    // The mock's matching review exists only on page two, returned by --paginate.
    const result = spawnSync("bash", ["-c", `${mock}\n${body}`], {
      env: { ...process.env, HEAD_SHA: "release-sha", PR_NUMBER: "1",
        GH_REPO: "owner/repo", RUNNER_TEMP: folder }, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Current head SHA has already been reviewed/);
    assert.throws(() => readFileSync(join(folder, "posted")));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
