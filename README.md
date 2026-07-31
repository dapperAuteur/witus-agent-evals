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

Pre-build. Spec is complete and the stack is decided: **TypeScript** (zod + Vitest + pnpm;
the PRD's Python names transpose 1:1 — see CLAUDE.md). Next step is the Milestone 1 scaffold
per the Build Brief.

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
