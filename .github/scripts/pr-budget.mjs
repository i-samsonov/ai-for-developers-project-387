// Budget is derived from the Actions history, which the agent's App token cannot edit.
// Run only in the serialized /oc job, before handing the model its API key.
const { GH_TOKEN, GH_REPO, PR_NUMBER, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_OUTPUT } =
  process.env;
const limit = 3;

if (!GH_TOKEN || !GH_REPO || !PR_NUMBER || !GITHUB_RUN_ID || !GITHUB_RUN_ATTEMPT || !GITHUB_OUTPUT) {
  throw new Error("Missing Actions budget context");
}

const api = async (path) => {
  const response = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${path}`);
  return response.json();
};

const pr = await api(`/pulls/${PR_NUMBER}`);
if (pr.head.repo?.full_name !== GH_REPO) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(GITHUB_OUTPUT, "allowed=false\nreason=untrusted_pr\n");
  console.log("Fork PR: no model secret will be exposed.");
} else {
  let used = 0;
  for (let page = 1; page <= 10; page++) {
    const { workflow_runs: runs } = await api(
      `/actions/workflows/opencode.yml/runs?per_page=100&page=${page}`,
    );
    for (const run of runs) {
      if (run.display_title !== `opencode PR-${PR_NUMBER}`) continue;
      for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
        if (String(run.id) === GITHUB_RUN_ID && String(attempt) === GITHUB_RUN_ATTEMPT) continue;
        const { jobs } = await api(
          `/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`,
        );
        if (
          jobs.some((job) =>
            job.steps?.some(
              (step) => step.name === "Budget admitted" && step.conclusion === "success",
            ),
          )
        ) used++;
        if (used >= limit) break;
      }
      if (used >= limit) break;
    }
    if (used >= limit || runs.length < 100) break;
    if (page === 10) throw new Error("Actions history exceeds the API window; failing closed");
  }

  const { appendFileSync } = await import("node:fs");
  const allowed = used < limit;
  appendFileSync(
    GITHUB_OUTPUT,
    `allowed=${allowed}\nreason=${allowed ? "admitted" : "limit_exhausted"}\n`,
  );
  console.log(`PR #${PR_NUMBER}: ${used}/${limit} prior admitted attempts; ${allowed ? "admitted" : "limit_exhausted"}`);
}
