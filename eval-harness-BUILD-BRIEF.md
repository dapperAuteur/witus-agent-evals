# Build Brief for Claude Code: `witus-agent-evals`

**Give this file to Claude Code in VS Code alongside `eval-harness-PRD.md`.**
This brief tells Claude Code *how to work* and *in what order to build*. The PRD is the *what and why*. When they conflict, ask BAM.

---

## 0. Read first (context for Claude Code)

You are building the eval harness specified in `eval-harness-PRD.md`. It tests two existing LangGraph agents in separate repos:
- **Wanderlearn Field Reporter** — single agent, `research → outline → write → critique` loop, `MAX_REVISIONS=3`, tool-call budget guard, Claude/Gemini A/B.
- **Centenarian Coach Multi-Agent** — supervisor + four specialist subgraphs (nutrition, workout, recovery, corrective exercise), each with its own retrieval namespace, supervisor synthesizes with citations.

Build the harness as its **own repo/package** (`witus-agent-evals`). It imports the two agents as dependencies (editable installs or path deps); it does **not** live inside either agent's repo.

---

## 1. Working conventions (non-negotiable)

These match how BAM already works across the ecosystem. Follow them exactly.

1. **Plans-first.** Before writing code for a milestone, post a short plan (files you'll touch, functions you'll add, tests you'll write). Wait for BAM's OK on Milestone 1's plan; after that, proceed milestone-by-milestone but keep posting the plan at the top of each.
2. **Never commit to `main`.** Work on `feat/eval-harness`. Open a PR; let BAM merge.
3. **Out-of-editor actions go in a task list for BAM.** Anything you can't do from the editor (create an API key, add an env var, grant a permission) → collect in a running `TASKS-FOR-BAM.md` at repo root. Do not block; stub and continue.
4. **Type safety.** Python with full type hints. `mypy --strict` (or pyright strict) must pass on `eval_harness/`. Zero bare `Any` where a real type is knowable; if `Any` is unavoidable, add a `# reason:` comment.
5. **Docstrings.** Every public function/class gets a docstring saying *why*, not just *what*.
6. **No secrets in code.** All keys from env via a small typed settings loader. Ship `.env.example`; never a real `.env`.
7. **Errors are loud.** No silent `except: pass`. Log with context. A failed judge call is an *error result*, never a pass.
8. **Small functions.** Single responsibility, ≤ ~50 lines. If a function needs a paragraph to explain, split it.

---

## 2. Tech stack (use what the agents already use)

- **Python 3.12+**, `pyproject.toml`, `uv` or `poetry` (match the agents' repos).
- **pydantic v2** for all models.
- **LangGraph / LangChain** to invoke the agents; **LangSmith** for trace refs (the agents already emit these).
- **pytest** + **pytest-cov** for tests.
- **PyYAML** for rubric files.
- Judge and providers via the existing per-node model-selection pattern the agents already use — reuse it, don't reinvent.

---

## 3. Milestones (build in this order)

Each milestone ends with **green tests** and a **runnable state**. Do not start the next until the current one's acceptance box is checked.

### Milestone 1 — Skeleton + models + registry
**Build:** repo scaffold per PRD §5.2, `models.py` per PRD §6, `registry.py` (empty registries + register decorators), `CLAUDE.md`, `.env.example`, `pyproject.toml`, `README.md` stub.
**Acceptance:**
- [ ] `pip install -e .` works.
- [ ] `mypy --strict eval_harness/` passes.
- [ ] `from eval_harness.models import EvalCase, CaseResult, RunSummary` works.
- [ ] `test_models_roundtrip` — every model serializes to JSON and back.

### Milestone 2 — Deterministic checks + tests
**Build:** `checks/deterministic.py` with the code checks from PRD §8 (`citation_present`, `within_budget`, `revisions_ok`, `valid_schema`, `routing_correct`, `citations_scoped`, `no_pii`). Register each in `registry.py`.
**Acceptance:**
- [ ] Each check has ≥2 unit tests (pass case + fail case).
- [ ] `pytest --cov=eval_harness/checks` ≥ 80%.
- [ ] Checks are pure functions: `(output, case, telemetry) -> AssertionResult`.

### Milestone 3 — The judge
**Build:** `judge/llm_judge.py` (structured output, evidence-span requirement, retry-once-then-error), the two rubric YAMLs. Use a judge model *different* from the evaluated provider.
**Acceptance:**
- [ ] `test_judge_contract` — malformed judge output retries once, then returns an error `AssertionResult` (not a pass).
- [ ] Judge output validates against a pydantic model.
- [ ] A criterion with no supporting evidence span cannot return `passed=True`.

### Milestone 4 — Adapters
**Build:** `adapters/base.py` (a `Protocol` with `run(input, provider) -> AdapterOutput`), then `field_reporter.py` and `coach_multiagent.py`. Each adapter invokes the real graph and returns output + `trace_ref` + telemetry (`tool_calls`, `revisions` for field-reporter, invoked specialists for coach).
**Acceptance:**
- [ ] `test_runner_smoke` — each adapter runs one trivial case against `claude` end-to-end and returns a populated `AdapterOutput`.
- [ ] Coach adapter reports which specialists were invoked (needed by `cx.routing_correct`).
- [ ] Field-reporter adapter reports revision count and can return the rev-0 draft (needed by `fr.revision_improved`).

### Milestone 5 — Runner + storage + regression
**Build:** `runner.py` (orchestrates §5.3 flow, caches agent output per case+provider), `storage.py` (JSONL under `runs/<run_id>/`), `regression.py` (baseline diff → `RunSummary.regressions`).
**Acceptance:**
- [ ] Full run over a tiny dataset produces `CaseResult`s + a `RunSummary`.
- [ ] Re-running re-uses cached agent output (verified: agent not re-invoked).
- [ ] A deliberately-broken baseline test populates `regressions` correctly.

### Milestone 6 — Datasets
**Build:** ≥20 cases per agent per PRD §8.3 (easy / known-hard / adversarial), with fixtures. Each hard case names its `targets` assertion.
**Acceptance:**
- [ ] `datasets/field_reporter/cases.jsonl` and `datasets/coach_multiagent/cases.jsonl` load and validate as `EvalCase`s.
- [ ] Each agent has ≥3 adversarial cases targeting the "money" failure modes (self-grading leniency; cross-specialist contradiction).

### Milestone 7 — CLI + report + provider compare
**Build:** `cli.py` with the commands in PRD §9; `report.py` (markdown report: pass rates, per-assertion table, regressions, and a Claude-vs-Gemini comparison).
**Acceptance:**
- [ ] All PRD §10 acceptance criteria pass.
- [ ] `README.md` gets a stranger from clone → one eval run in < 10 minutes.
- [ ] One full run of each agent against `--provider all` is committed to `runs/` as a reference artifact.

---

## 4. Definition of done (whole project)

Everything in PRD §10, plus: `feat/eval-harness` PR is open with a description linking each milestone to its tests, and `TASKS-FOR-BAM.md` lists any keys/permissions BAM still needs to supply.

---

## 5. `TASKS-FOR-BAM.md` — start it now with these

Claude Code: seed this file at repo root on Milestone 1.
- [ ] Provide `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `LANGSMITH_API_KEY` in `.env`.
- [ ] Confirm the import path / package name for each agent repo (editable install vs path dep).
- [ ] Confirm the field-reporter's rubric source (so the harness's independent rubric matches the one the agent critiques against).
- [ ] Confirm the coach's specialist namespace identifiers (needed for `cx.citations_scoped`).
- [ ] Decide the judge model (recommend: the strongest available, and NOT the provider under test for a given case).
