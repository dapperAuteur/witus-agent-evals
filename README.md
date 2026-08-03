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

Milestone 1 of 7 complete (Build Brief order): TypeScript scaffold, zod data models
(`src/models.ts`), check/adapter registries (`src/registry.ts`), typed env loader, CLI stub.
Stack: **TypeScript** — zod + Vitest + strict tsc + pnpm (the PRD's Python names transpose
1:1 — see CLAUDE.md). Next: Milestone 2, deterministic checks.

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
