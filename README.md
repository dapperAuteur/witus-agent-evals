# witus-agent-evals

Agent-agnostic eval harness for the WitUS ecosystem's LangGraph agents. Runs curated,
property-based test cases (deterministic checks + LLM-as-judge) against two production agents,
detects regressions against a baseline, and compares providers (Claude vs Gemini). Offline,
CLI-triggered; output is JSONL results plus a markdown report.

**Agents under test** (each lives in its own repo; this harness imports them as dependencies):

- **Wanderlearn Field Reporter** (`claude/lang-chain/wanderlearn-field-reporter`) — single
  agent, research → outline → write → critique refine loop.
- **Centenarian Coach Multi-Agent** (`claude/lang-chain/centenarian-coach-multiagent`) —
  supervisor + four specialist subgraphs (nutrition, workout, recovery, corrective exercise).

## Status

Milestone 4 of 7 complete (Build Brief order): scaffold + zod models + registries (M1),
the seven deterministic checks (M2), the LLM judge with free-provider support and
anti-sycophancy evidence rule (M3), and the **agent adapters** (M4): each invokes the real
LangGraph in a tsx subprocess run inside the agent's own repo (its tsconfig/`@/`
alias/node_modules/env resolve normally), normalizes output for the checks, and reports
telemetry — web-search calls, revision count + rev-0 draft (field-reporter), invoked
specialists + specialist-scoped citations (coach). `pnpm test:smoke` runs one real case
per agent end-to-end. **Milestone 5** adds the runner (`src/runner.ts`: the full
case→checks→judge→CaseResult→RunSummary flow, error cases never kill a run), JSONL
storage under `runs/<run_id>/` with a cross-run agent-output cache keyed by case-input
hash (re-judging never re-runs an agent), baseline regression detection
(`src/regression.ts`), and the approved witus-inbox regression alert (`src/inbox/` —
env-gated, fire-and-forget, inert until the slug is provisioned). **Milestone 6** adds
the curated datasets (`datasets/`): 21 cases per agent — 8 easy / 7 known-hard / 6
adversarial, each hard case naming its target assertion — with source-material fixtures,
shared assertion packs, and a coach namespace map generated from that repo's real KB
(see `datasets/README.md`). Stack: **TypeScript** — zod + Vitest + strict tsc + pnpm
(see CLAUDE.md). Next: Milestone 7, CLI + report + provider comparison. A consolidated
help/docs/video-tutorial pass is planned for the end of the build
(`plans/03-help-docs-and-video-tutorial.md`).

## Development

```sh
pnpm install
pnpm build      # strict tsc (no emit)
pnpm test       # vitest; pnpm test:cov for coverage
pnpm evals      # CLI — commands print which milestone implements them until wired
```

Copy `.env.example` to `.env` for anything model-touching (Milestones 3+); Milestones 1–2
run fully offline.

- [`eval-harness-PRD.md`](eval-harness-PRD.md) — what and why
- [`eval-harness-BUILD-BRIEF.md`](eval-harness-BUILD-BRIEF.md) — how, and milestone order
- [`CLAUDE.md`](CLAUDE.md) — repo identity, working conventions, ecosystem rules

## Working in this repo

One-time per clone, activate the branch-hygiene guard:

```sh
git config core.hooksPath .githooks
```

Never commit on `main`; branch (`feat/ fix/ chore/ docs/`), push, and BAM merges. Operator
tasks live in `plans/user-tasks/` (gitignored, on-disk queue).
