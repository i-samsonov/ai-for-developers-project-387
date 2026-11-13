import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  assert.match(review, /run\.path === "\.github\/workflows\/release-please\.yml"/);
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

async function resolveReview({ run, candidates, currentMain, reviews = [], contexts, manualInputs,
  associated = candidates, manualContext }) {
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
      actions: {
        listWorkflowRunsForWorkflow: () => {},
        getWorkflowRun: async () => ({ data: manualContext ?? {
          id: 42, path: ".github/workflows/opencode-review.yml",
          event: "pull_request", conclusion: "success",
          head_sha: candidates[0].head.sha,
          head_repository: { full_name: "owner/repo" },
          pull_requests: [{ number: candidates[0].number }],
        } }),
      },
    },
    paginate: async (method, params) => method === github.rest.repos.listPullRequestsAssociatedWithCommit ? associated
      : method === github.rest.pulls.list ? candidates
      : method === github.rest.actions.listWorkflowRunsForWorkflow ? (contexts ?? [{
        id: 42, event: "pull_request", conclusion: "success", head_sha: params.head_sha,
        head_repository: { full_name: "owner/repo" }, pull_requests: [],
      }]) : reviews,
  };
  const context = { eventName: manualInputs ? "workflow_dispatch" : "workflow_run",
    payload: { workflow_run: run, inputs: manualInputs }, repo: { owner: "owner", repo: "repo" } };
  const core = { setOutput: (key, value) => { outputs[key] = value; }, info: () => {} };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("github", "context", "core", source)(github, context, core);
  if (manualInputs?.all || run?.all) return outputs.prs ? JSON.parse(outputs.prs) : [];
  return outputs.prs ? JSON.parse(outputs.prs)[0] : {};
}

test("release-please resolves only a current same-repo bot PR and skips previously reviewed heads", async () => {
  const main = "main-sha";
  const run = { name: "release-please", path: ".github/workflows/release-please.yml",
    event: "push", head_branch: "main", head_sha: main };
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
  assert.deepEqual(await resolveReview({ run, candidates: [release], currentMain: main, reviews: [{ commit_id: "release-sha", state: "COMMENTED", user: { login: "github-actions[bot]" } }] }), {});
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
  const run = { name: "review-context-PR-11", path: ".github/workflows/opencode-review.yml", event: "pull_request",
    head_sha: "old-sha", pull_requests: [{ number: 11 }] };
  assert.deepEqual(await resolveReview({ run, candidates: [current], currentMain: "main-sha" }), {});
  assert.deepEqual(await resolveReview({ run: { ...run, head_sha: "new-sha" }, candidates: [current], currentMain: "main-sha" }),
    { number: "11", head_sha: "new-sha", base_sha: "main-sha" });
  assert.deepEqual(await resolveReview({ run: { ...run, head_sha: "new-sha" }, candidates: [current], currentMain: "main-sha",
    reviews: [{ commit_id: "new-sha", state: "COMMENTED", user: { login: "github-actions[bot]" } }] }), {});
  const foreign = { ...run, path: ".github/workflows/release-please.yml", head_sha: "new-sha" };
  assert.deepEqual(await resolveReview({ run: foreign, candidates: [current], currentMain: "main-sha" }), {});
  const review = readFileSync(new URL("../workflows/opencode-review-publish.yml", import.meta.url), "utf8");
  assert.match(review, /github\.event\.workflow_run\.path == '\.github\/workflows\/opencode-review\.yml' &&\s*github\.event\.workflow_run\.event == 'pull_request'/);
});

test("workflow_run accepts the real dynamic run-name only for the trusted context workflow", async () => {
  const workflow = readFileSync(new URL("../workflows/opencode-review-publish.yml", import.meta.url), "utf8");
  const condition = workflow.split("    if: |\n")[1].split("    runs-on:")[0];
  const allowed = (path) => new Function("github", `return ${condition}`)({
    event_name: "workflow_run", repository: "owner/repo",
    event: { workflow_run: { name: "review-context-PR-14", path,
      event: "pull_request", conclusion: "success", head_repository: { full_name: "owner/repo" } } },
  });
  assert.equal(allowed(".github/workflows/opencode-review.yml"), true);
  assert.equal(allowed(".github/workflows/release-please.yml"), false);
  const candidate = { number: 14, state: "open", user: { login: "owner" }, author_association: "OWNER",
    base: { ref: "main", sha: "main-sha" }, head: { sha: "head-sha", repo: { full_name: "owner/repo" } } };
  const run = { name: "review-context-PR-14", path: ".github/workflows/opencode-review.yml",
    event: "pull_request", head_sha: "head-sha", pull_requests: [{ number: 14 }] };
  assert.deepEqual(await resolveReview({ run, candidates: [candidate], currentMain: "main-sha" }),
    { number: "14", head_sha: "head-sha", base_sha: "main-sha" });
});

test("release context with no pull_requests is linked by commit association for both trigger paths", async () => {
  const release = {
    number: 1, state: "open", user: { login: "github-actions[bot]" }, author_association: "NONE",
    base: { ref: "main", sha: "main-sha" },
    head: { sha: "release-sha", ref: "release-please--branches--main--components--calendar-calls",
      repo: { full_name: "owner/repo" } },
  };
  const run = { name: "release-please", path: ".github/workflows/release-please.yml",
    event: "push", head_branch: "main", head_sha: "main-sha" };
  const contexts = [{ id: 42, path: ".github/workflows/opencode-review.yml", event: "pull_request",
    conclusion: "success", head_sha: "release-sha",
    head_repository: { full_name: "owner/repo" }, pull_requests: [] }];
  const expected = { number: "1", head_sha: "release-sha", base_sha: "main-sha" };
  assert.deepEqual(await resolveReview({ run, candidates: [release], currentMain: "main-sha", contexts }), expected);
  assert.deepEqual(await resolveReview({ candidates: [release], currentMain: "main-sha", contexts,
    manualContext: contexts[0], manualInputs: { pr_number: "1", context_run_id: "42" } }), expected);
  assert.deepEqual(await resolveReview({ run, candidates: [release], currentMain: "main-sha",
    contexts, associated: [{ number: 2 }] }), {});
});

test("manual review verifies the requested run directly when the filtered list is empty", async () => {
  const pr = { number: 1, state: "open", user: { login: "github-actions[bot]" },
    author_association: "NONE", base: { ref: "main", sha: "main-sha" },
    head: { sha: "release-sha", ref: "release-please--branches--main--components--calendar-calls",
      repo: { full_name: "owner/repo" } } };
  const manualInputs = { pr_number: "1", context_run_id: "42" };
  const expected = { number: "1", head_sha: "release-sha", base_sha: "main-sha" };
  const options = { candidates: [pr], currentMain: "main-sha", contexts: [], manualInputs };
  assert.deepEqual(await resolveReview({ ...options, associated: [] }), expected);
  const contextRun = { id: 42, path: ".github/workflows/opencode-review.yml",
    event: "pull_request", conclusion: "success", head_sha: "release-sha",
    head_repository: { full_name: "owner/repo" }, pull_requests: [] };
  assert.deepEqual(await resolveReview({ ...options, manualContext: contextRun }), expected);
  assert.deepEqual(await resolveReview({ ...options, manualContext: contextRun, associated: [] }), {});
  assert.deepEqual(await resolveReview({ ...options, manualContext: { ...contextRun,
    pull_requests: [{ number: 2 }] } }), {});
  assert.deepEqual(await resolveReview({ ...options, manualContext: { ...contextRun, path: ".github/workflows/other.yml" } }), {});
  assert.deepEqual(await resolveReview({ ...options, manualContext: { ...contextRun, head_sha: "old-sha" } }), {});
  assert.deepEqual(await resolveReview({ ...options, manualContext: { ...contextRun, event: "push" } }), {});
  assert.deepEqual(await resolveReview({ ...options, manualContext: { ...contextRun, conclusion: "failure" } }), {});
  assert.deepEqual(await resolveReview({ ...options, manualContext: { ...contextRun,
    head_repository: { full_name: "other/repo" } } }), {});
  assert.deepEqual(await resolveReview({ ...options, manualInputs: { ...manualInputs, context_run_id: "43" } }), {});
});

test("resolve tolerates deleted reviewers and only considers published reviews", async () => {
  const pr = { number: 11, state: "open", user: { login: "owner" },
    author_association: "OWNER", base: { ref: "main", sha: "main-sha" },
    head: { sha: "new-sha", repo: { full_name: "owner/repo" } } };
  const run = { name: "review-context-PR-11", path: ".github/workflows/opencode-review.yml", event: "pull_request",
    head_sha: "new-sha", pull_requests: [{ number: 11 }] };
  const expected = { number: "11", head_sha: "new-sha", base_sha: "main-sha" };
  const stale = [{ commit_id: "new-sha", state: "COMMENTED", user: null },
    { commit_id: "new-sha", state: "PENDING", user: { login: "github-actions[bot]" } },
    { commit_id: "new-sha", state: "DISMISSED", user: { login: "github-actions[bot]" } }];
  assert.deepEqual(await resolveReview({ run, candidates: [pr], currentMain: "main-sha", reviews: stale }), expected);
  assert.deepEqual(await resolveReview({ run, candidates: [pr], currentMain: "main-sha",
    reviews: [...stale, { commit_id: "new-sha", state: "APPROVED", user: { login: "github-actions[bot]" } }] }), {});
});

test("release completion includes every eligible PR instead of stopping at the first", async () => {
  const makeRelease = (number) => ({
    number, state: "open", user: { login: "github-actions[bot]" }, author_association: "NONE",
    base: { ref: "main", sha: "main-sha" },
    head: { sha: `release-${number}`, ref: `release-please--branches--main--components--component-${number}`,
      repo: { full_name: "owner/repo" } },
  });
  const releases = [makeRelease(1), makeRelease(2)];
  const run = { name: "release-please", path: ".github/workflows/release-please.yml",
    event: "push", head_branch: "main", head_sha: "main-sha", all: true };
  assert.deepEqual(await resolveReview({ run, candidates: releases, currentMain: "main-sha" }), [
    { number: "1", head_sha: "release-1", base_sha: "main-sha" },
    { number: "2", head_sha: "release-2", base_sha: "main-sha" },
  ]);
  assert.deepEqual(await resolveReview({ run, candidates: releases, currentMain: "main-sha",
    reviews: [{ commit_id: "release-1", state: "COMMENTED", user: { login: "github-actions[bot]" } }] }), [
    { number: "2", head_sha: "release-2", base_sha: "main-sha" },
  ]);
  const workflow = readFileSync(new URL("../workflows/opencode-review-publish.yml", import.meta.url), "utf8");
  assert.equal(workflow.match(/include: \$\{\{ fromJSON\(needs\.resolve\.outputs\.prs\) \}\}/g)?.length, 2);
  assert.match(workflow, /if: always\(\) && needs\.resolve\.result == 'success' && needs\.resolve\.outputs\.prs != ''/);
  assert.match(workflow, /name: independent-review-\$\{\{ matrix\.number \}\}-\$\{\{ matrix\.head_sha \}\}/);
  assert.match(workflow, /PR_NUMBER: \$\{\{ matrix\.number \}\}/);
  assert.match(workflow, /HEAD_SHA: \$\{\{ matrix\.head_sha \}\}/);
});

test("automatic and manual release review share a non-cancelling concurrency group", () => {
  const review = readFileSync(new URL("../workflows/opencode-review-publish.yml", import.meta.url), "utf8");
  const group = review.match(/^\s+group: (.*)$/m)?.[1];
  assert.ok(group);
  assert.match(group, /github\.event_name == 'workflow_dispatch'/);
  assert.match(group, /github\.event\.workflow_run\.path == '\.github\/workflows\/release-please\.yml'/);
  assert.match(group, /startsWith\(github\.event\.workflow_run\.head_branch, 'release-please--branches--main--components--'\)/);
  assert.match(group, /&& 'release-please' \|\| github\.event\.workflow_run\.head_branch/);
  const evaluate = ({ eventName, path, branch, sourceId }) =>
    group.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, expression) =>
      String(new Function("github", "startsWith", `return ${expression}`)({
        repository_id: 10, event_name: eventName,
        event: { workflow_run: { path, head_branch: branch, head_repository: { id: sourceId } } },
      }, (value, prefix) => value?.startsWith(prefix))));
  const branch = "release-please--branches--main--components--calendar-calls";
  const contextPath = ".github/workflows/opencode-review.yml";
  const trusted = evaluate({ eventName: "workflow_run", path: contextPath, branch, sourceId: 10 });
  assert.equal(evaluate({ eventName: "workflow_run", path: ".github/workflows/release-please.yml",
    branch: "main", sourceId: 10 }), trusted);
  assert.equal(evaluate({ eventName: "workflow_dispatch", branch: "", sourceId: undefined }), trusted);
  assert.notEqual(evaluate({ eventName: "workflow_run", path: contextPath, branch, sourceId: 20 }), trusted);
  assert.notEqual(evaluate({ eventName: "workflow_run", path: contextPath, branch: "feature", sourceId: 20 }),
    evaluate({ eventName: "workflow_run", path: contextPath, branch: "feature", sourceId: 10 }));
  assert.match(review, /cancel-in-progress: false/);
  assert.match(review, /Release PR already reviewed at current head SHA/);
});

test("publish filters paginated reviews by SHA, author and state", () => {
  const workflow = readFileSync(new URL("../workflows/opencode-review-publish.yml", import.meta.url), "utf8");
  const publish = workflow.slice(workflow.indexOf("      - name: Publish review bound to the checked SHA"));
  const body = publish.slice(publish.indexOf("        run: |\n") + "        run: |\n".length)
    .split("\n").map((line) => line.slice(10)).join("\n");
  const mock = `
    gh() {
      if [[ "$1" == pr ]]; then printf '%s\\n' "$HEAD_SHA"
      elif [[ "$1" == api && "$2" == --paginate ]]; then
        printf '%s\\n' "$REVIEWS_JSON" | jq -r "\${@: -1}"
      elif [[ "$1" == api && "$2" == --method ]]; then echo posted > "$RUNNER_TEMP/posted"
      fi
    }
  `;
  const bot = { login: "github-actions[bot]" };
  const page = Array.from({ length: 100 }, (_, i) => ({
    id: i, commit_id: "release-sha", state: "DISMISSED", user: i === 0 ? null : bot,
  }));
  const check = (secondPage, shouldPost) => {
    const folder = mkdtempSync(join(tmpdir(), "review-publish-"));
    try {
      mkdirSync(join(folder, "review"));
      writeFileSync(join(folder, "review", "review.md"), "review");
      const result = spawnSync("bash", ["-c", `${mock}\n${body}`], {
        env: { ...process.env, HEAD_SHA: "release-sha", PR_NUMBER: "1",
          GH_REPO: "owner/repo", RUNNER_TEMP: folder,
          REVIEWS_JSON: `${JSON.stringify(page)}\n${JSON.stringify(secondPage)}` }, encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      if (shouldPost) assert.equal(readFileSync(join(folder, "posted"), "utf8").trim(), "posted");
      else {
        assert.match(result.stdout, /Current head SHA has already been reviewed/);
        assert.throws(() => readFileSync(join(folder, "posted")));
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  };
  check([{ id: 101, commit_id: "release-sha", state: "COMMENTED", user: bot }], false);
  check([{ id: 101, commit_id: "other-sha", state: "COMMENTED", user: bot },
    { id: 102, commit_id: "release-sha", state: "PENDING", user: bot }], true);
});

test("README describes queued rather than cancelled release review runs", () => {
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  assert.doesNotMatch(readme, /новое событие для той же ветки PR отменяет устаревший запуск/);
  assert.match(readme, /новое событие для той же ветки PR не отменяет уже выполняющийся запуск, а ожидает завершения/);
});
