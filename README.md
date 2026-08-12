# witus-agent-evals

Agent-agnostic eval harness for the WitUS ecosystem's LangGraph agents. It runs curated,
property-based test cases (deterministic checks + an LLM judge) against two production
agents, detects regressions against a baseline, compares providers (Claude vs Gemini),
and writes JSONL results plus a markdown report per run.

**Agents under test** (each lives in its own repo; the harness invokes the real graphs):

- **Wanderlearn Field Reporter** (`claude/lang-chain/wanderlearn-field-reporter`):
  single agent, research → outline → write → critique refine loop.
- **Centenarian Coach Multi-Agent** (`claude/lang-chain/centenarian-coach-multiagent`):
  supervisor + four specialist subgraphs (nutrition, workout, recovery, corrective).

The design bet: agents can't be tested for golden answers, so every case asserts
**properties** (did it cite? did it stay within budget? do the specialists contradict
each other?), half checked in code, half by an independent LLM judge that must quote its
evidence. See [eval-harness-PRD.md](eval-harness-PRD.md) for the full rationale.

## Video tutorial (coming soon)

A walkthrough recording is planned; the one-take script lives at
[docs/video-tutorial-script.md](docs/video-tutorial-script.md).

## Quickstart (clone → first eval in under 10 minutes)

```sh
git clone https://github.com/dapperAuteur/witus-agent-evals.git
cd witus-agent-evals
pnpm install
git config core.hooksPath .githooks   # once per clone (branch-hygiene guard)

cp .env.example .env.local            # then fill in:
#  ANTHROPIC_API_KEY   - runs the agents on Claude
#  GOOGLE_API_KEY      - runs the agents on Gemini
#  OPENROUTER_API_KEY  - the free default judge
#  LANGSMITH_API_KEY   - optional, enables trace refs

pnpm test                             # offline suite, no keys needed

# First real eval, 2 cases against Claude (a few minutes):
pnpm evals run --agent coach_multiagent --provider claude --limit 2
# → prints run_id + pass rate; open runs/<run_id>/report.md
```

The two agent repos must be cloned as siblings (`../lang-chain/...`) or pointed at via
`FIELD_REPORTER_REPO` / `COACH_REPO` in `.env.local`. Each agent runs inside its own
repo with its own env, so their `.env.local` files (DB URLs etc.) must be present there.

## Commands

```sh
pnpm evals run --agent <field_reporter|coach_multiagent> --provider <claude|gemini|all>
               [--baseline <run_id>]   # populate regressions vs a prior run
               [--limit N]             # smoke subset
               [--judge <provider>]    # override the judge (default: free openrouter)
               [--threshold X]         # weighted pass threshold (default 1.0)
pnpm evals report  --run <run_id>            # (re)generate + print a run's report
pnpm evals compare --run-a <id> --run-b <id> # provider comparison report
pnpm evals runs                              # list runs with pass rates
```

- `--provider all` runs Claude then Gemini and writes a comparison report.
- **Exit codes:** 0 clean · 1 usage/config error · 2 run completed with regressions
  (CI-friendly).
- **Caching:** agent outputs are cached under `runs/cache/` keyed by case-input hash.
  Re-running re-judges without re-running agents, so judge comparisons
  (`--judge anthropic` vs the free default) are cheap. Editing a case invalidates its
  cache entry automatically.
- The **witus-inbox alert** fires on regressions/errors once the `INBOX_*` env vars are
  provisioned (inert otherwise).

## Reading a run

```
runs/<run_id>/
  results.jsonl   one CaseResult per line (machine-readable)
  summary.json    RunSummary: pass rates, per-assertion rates, regressions
  report.md       the human-readable report
runs/compare-<a>-vs-<b>.md   provider comparison
```

Judge failures are never silent passes: a broken judge shows up as `JUDGE_ERROR`
rationales, and a crashed agent as an error case; both fail loudly in the report.

## Repeated judging (`JUDGE_REPEATS`)

`JUDGE_REPEATS` sets how many times each `model_graded` assertion is judged. The
verdict is the **majority** of those judgments.

**Default 1**, which is one judgment and exactly the artifacts this harness has
always written, so every frozen baseline stays comparable. Set it (3 or 5, odd)
when a number is going to be published:

```sh
JUDGE_REPEATS=3 pnpm evals run --agent coach_multiagent --provider claude
```

Why: a 2026-08-12 stability probe re-judged one criterion three times on
unchanged inputs and got 55.0 / 65.0 / 70.0 percent from the free judge and
45.0 / 35.0 / 40.0 percent from `claude-opus-5`. Both swings are as large as
findings this repo has published, so one judgment per case cannot carry a
finding whichever judge is configured.

What gets recorded when repeats > 1:

- Per assertion: `judgments`, `judgments_agreeing`, `judgments_errored`, and
  `judgment_tied`. Absent at the default, so single-judgment JSONL is unchanged.
- Per run: `judge_repeats` and `judge_agreement_rate` (agreeing judgments over
  total judgments) in `summary.json`, and a judge-agreement row in `report.md`.
- A judgment that fails is excluded from the vote instead of counting as a fail
  vote. If fewer than a majority succeed, the assertion is **errored**, not
  failed.
- An even count can tie. A tie is recorded as a **failure** and marked
  `judgment_tied`, because a split judge is not evidence of a pass.
- Below 85 percent agreement the report leads with a blockquote saying the run
  is not a measurement, the same treatment an errored run gets.

Repeats cost judge calls, not agent calls: cached agent output means re-judging
never re-runs an agent.

## Extending

- **Add a case:** append a line to `datasets/<agent>/cases.jsonl` (see
  [datasets/README.md](datasets/README.md) for the `$fixture` conventions). Hard cases
  must name their target assertion in `metadata.targets`.
- **Add a deterministic check:** pure function in `src/checks/deterministic.ts`,
  register it, unit-test pass + fail.
- **Add an agent:** an adapter (`src/adapters/`), a dataset pack (`datasets/<name>/`),
  and a rubric pack (`src/judge/rubrics/<name>.yaml`). No core changes: that's the
  PRD §5.1 plug-in contract.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `JUDGE_ERROR ... 404 MODEL_NOT_FOUND` | Judge model id stale for that provider; check `src/judge/config.ts` and the provider's models endpoint |
| `JUDGE_ERROR ... 401` | Judge provider key invalid (see `plans/user-tasks/05`) |
| `Agent repo not found` | Clone the agent repos as siblings or set `FIELD_REPORTER_REPO`/`COACH_REPO` |
| Coach cases all error | The coach repo's `.env.local` (its `STORAGE_DATABASE_URL`) is missing; its KB lives in Postgres |
| Run seems stale | Cached agent output; edit the case input or clear `runs/cache/` |

## Development

```sh
pnpm build       # strict tsc (no emit)
pnpm test        # offline unit suite
pnpm test:smoke  # 1 real case per agent end-to-end (needs keys)
```

Working conventions, ecosystem rules, and integration status: [CLAUDE.md](CLAUDE.md).
Spec: [eval-harness-PRD.md](eval-harness-PRD.md) ·
[eval-harness-BUILD-BRIEF.md](eval-harness-BUILD-BRIEF.md).
