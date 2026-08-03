# Video tutorial script — "Testing AI agents with witus-agent-evals"

Target: 6–8 minutes, one take, screen recording + voiceover. Terminal font ≥16pt.
Prep before recording: fresh clone, keys already in `.env.local`, `pnpm install` done,
`runs/` containing one prior full run to use as the baseline in scene 5.

---

## Scene 1 — The problem (30s, talking over the PRD)

**Screen:** `eval-harness-PRD.md` §1 open.

> "Normal tests check that 2 plus 2 is 4. AI agents don't work like that — ask the same
> agent the same question twice and you get two different answers. So instead of golden
> answers, we test *properties*: did it cite sources? did it stay inside its budget? do
> the four specialists contradict each other? This harness runs two of my production
> LangGraph agents through 42 curated cases and tells me what broke."

## Scene 2 — The anatomy of a case (60s)

**Screen:** `datasets/coach_multiagent/cases.jsonl`, then `assertion_pack.json`.

> "Every case is an input plus the properties its output must satisfy. Half are
> deterministic — code checks like 'the supervisor consulted the specialists we
> expected'. Half go to an LLM judge. Two rules keep the judge honest: it's never the
> same provider as the agent under test, and it cannot pass anything without quoting a
> verbatim evidence span from the output. No quote, no pass."

**Action:** point at one adversarial case's `metadata.targets`.

> "Adversarial cases document which assertion they're trying to break — this one
> pressures the agent to skip its own quality rubric, and the harness catches whether
> its self-review caves."

## Scene 3 — First run (90s, mostly waiting cut in editing)

**Action:**
```sh
pnpm evals run --agent coach_multiagent --provider claude --limit 3
```

> "Each case invokes the real graph in its own repo — real retrieval, real models. Agent
> outputs get cached by input hash, so re-judging later never re-runs the agent. That's
> the cost story: agents run once, judging is nearly free."

**Screen:** open `runs/<run_id>/report.md` when it lands. Scroll: pass-rate header,
per-assertion table, failure detail with judge rationales.

## Scene 4 — Break something on purpose (90s)

**Action:** edit a case (or point `--judge` at a stricter model), or the honest version:
pick a failing assertion from scene 3.

> "This failure isn't a bug in the harness — it's a finding. The judge quotes the exact
> uncited claim. This is the artifact you paste into the issue you file against the
> agent."

## Scene 5 — Regressions (60s)

**Action:**
```sh
pnpm evals runs
pnpm evals run --agent coach_multiagent --provider claude --baseline <prior_run_id>
echo $?   # → 2 when something got worse
```

> "Name a baseline and the summary lists every assertion whose pass rate dropped. Exit
> code 2 means CI can block a deploy on an agent regression, same as a failing unit
> test. And when a run regresses, it files itself into my witus-inbox triage queue."

## Scene 6 — Provider comparison (60s)

**Action:** open a `runs/compare-*.md`.

> "Same cases, Claude versus Gemini, per-assertion deltas and the exact cases where they
> diverge. Not vibes — the same properties, measured."

## Scene 7 — Close (20s)

**Screen:** README "Extending" section.

> "Adding a third agent is an adapter, a dataset pack, and a rubric — no core changes.
> Repo's linked below."

---

**Recording task for BAM:** when this is recorded, file the upload + README-link swap as
a `plans/user-tasks/` entry (replace the README's "coming soon" placeholder with the URL).
