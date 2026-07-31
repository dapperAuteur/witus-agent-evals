# PRD: Agent Eval Harness (`witus-agent-evals`)

**Version:** 1.0 · **Date:** 2026-07-30 · **Owner:** BAM
**Status:** Ready for build (hand this + the Build Brief to Claude Code)

---

## 1. Plain-language summary

We are building a **testing machine for AI agents.**

Normal software tests check "does 2 + 2 equal 4?" — the answer never changes, so a simple test works. AI agents are different. Ask the same agent the same question twice and you can get two different answers. So we can't test for one "correct" answer. Instead we test for **properties** the answer must always have: "Did it cite a source?" "Did it stay on topic?" "Did the four specialists avoid contradicting each other?"

This machine runs each agent over a set of saved test cases, checks every case against its required properties, scores them, and tells us what broke — including whether things got *worse* since last time (a "regression"). It also runs the same cases against two different AI providers (Claude and Gemini) so we can compare them on real work.

**Why this matters for the job:** Ode's whole identity is "testable hypotheses, curated datasets, systems that keep working after handoff." This harness is that idea, built and running on two of my own production agents. It is the proof, and the teardown writeup is the artifact.

---

## 2. Goals and non-goals

### Goals
1. One **agent-agnostic** eval harness that evaluates two structurally different LangGraph agents through a plug-in interface.
2. A **curated dataset** per agent (20–40 cases each) built around properties, not golden answers.
3. Two kinds of checks: **deterministic** (code) and **model-graded** (LLM-as-judge).
4. **Regression detection**: compare any run to a baseline and flag newly-failing properties.
5. **Provider comparison**: run the same dataset against Claude and Gemini, report the delta.
6. A **human-readable report** (markdown) plus machine-readable results (JSONL).

### Non-goals (v1 — do NOT build these yet)
- A web UI or dashboard. CLI + generated report only.
- Auto-tuning prompts based on results. We read results; we don't act on them automatically.
- Evaluating any agent beyond the two named here.
- Live/production monitoring. This is an offline eval run you trigger.

---

## 3. Users

| User | Need |
|---|---|
| BAM (builder) | Run evals before/after changing an agent; catch regressions; compare providers. |
| A hiring manager / senior engineer reading the repo | See eval design done properly on real agents — the repo *is* the writing sample. |
| Future me (post-handoff) | Trust that the agents still work months later, because the harness proves it. |

---

## 4. The two agents under test

### 4.1 Wanderlearn Field Reporter (single agent, refine loop)
- **What it does:** takes raw captured location material and produces a publishable lesson draft.
- **Shape:** `research → outline → write → critique`, self-critiquing against a rubric, `MAX_REVISIONS = 3` then human review.
- **Guards:** tool-call budget guard; Claude-vs-Gemini A/B per run.
- **Interesting failure modes to catch:**
  - **Self-grading leniency** — the agent's own critique passes the draft, but an *independent* judge using the same rubric fails it. (This is the money finding for the teardown.)
  - **Grounding failure** — the lesson states facts not present in the source material (hallucination).
  - **Wasted budget** — revisions run but the rubric score doesn't improve.

### 4.2 Centenarian Coach Multi-Agent ("Fit T. Cent 3.0") (supervisor + specialists)
- **What it does:** a supervisor routes a user query to four specialist subgraphs — **nutrition, workout, recovery, corrective exercise** — each with its own retrieval namespace, then synthesizes a cited answer.
- **Interesting failure modes to catch:**
  - **Mis-routing** — supervisor sends the query to the wrong specialist(s).
  - **Cross-specialist contradiction** — nutrition advice contradicts recovery advice. (The money finding for this agent.)
  - **Citation contamination** — a specialist cites material from another specialist's namespace, or makes an uncited claim.
  - **Scope/safety drift** — recovery or corrective-exercise advice that should say "see a professional" but doesn't.

---

## 5. Architecture

### 5.1 Principle
**Harness core is agent-agnostic.** Each agent plugs in through three things: an **adapter** (how to invoke the graph and read its telemetry), a **dataset pack** (the cases), and a **rubric pack** (the model-graded criteria). Adding a third agent later = add three files, change no core code.

### 5.2 File tree

```
witus-agent-evals/
├── README.md
├── pyproject.toml
├── CLAUDE.md                         # working conventions for Claude Code
├── eval_harness/
│   ├── __init__.py
│   ├── models.py                     # all pydantic models (§6)
│   ├── registry.py                   # register adapters + deterministic checks
│   ├── adapters/
│   │   ├── __init__.py
│   │   ├── base.py                   # AgentAdapter protocol
│   │   ├── field_reporter.py
│   │   └── coach_multiagent.py
│   ├── checks/
│   │   ├── __init__.py
│   │   └── deterministic.py          # citation_present, within_budget, etc.
│   ├── judge/
│   │   ├── __init__.py
│   │   ├── llm_judge.py              # structured LLM-as-judge
│   │   └── rubrics/
│   │       ├── field_reporter.yaml
│   │       └── coach_multiagent.yaml
│   ├── providers.py                  # claude / gemini switch
│   ├── runner.py                     # dataset -> results + summary
│   ├── regression.py                 # run vs baseline
│   ├── storage.py                    # JSONL (+ optional sqlite index)
│   └── report.py                     # markdown report generator
├── datasets/
│   ├── field_reporter/
│   │   ├── cases.jsonl
│   │   └── source_material/          # fixtures the cases reference
│   └── coach_multiagent/
│       ├── cases.jsonl
│       └── kb_fixtures/              # retrieval fixtures per specialist namespace
├── cli.py                            # python -m evals ...
├── runs/                             # gitignored: results land here
└── tests/
    ├── test_checks.py
    ├── test_judge_contract.py
    └── test_runner_smoke.py
```

### 5.3 Run flow
1. Load the dataset pack for the target agent.
2. For each case: `adapter.run(input, provider)` → returns output + trace ref + telemetry (`tool_calls`, `revisions`, `latency_ms`).
3. Run **deterministic checks** for that case's assertions.
4. Run the **judge** for that case's model-graded assertions.
5. Aggregate into a `CaseResult`.
6. After all cases: build a `RunSummary`; if a baseline run id was passed, compute regressions.
7. Persist results (JSONL) and generate the markdown report.

---

## 6. Data model (pydantic, type-safe)

> Claude Code: implement these exactly in `eval_harness/models.py`. Full type hints, `mypy --strict` clean, docstrings on each class.

```python
from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field

class Assertion(BaseModel):
    """One checkable property a case output must satisfy."""
    id: str
    kind: Literal["deterministic", "model_graded"]
    description: str
    # deterministic only:
    check: str | None = None          # name of a registered check fn
    params: dict[str, Any] = Field(default_factory=dict)
    # model_graded only:
    criterion: str | None = None      # rubric criterion key
    weight: float = 1.0

class EvalCase(BaseModel):
    """A single test case: an input plus the properties its output must have."""
    id: str
    agent: str                        # "field_reporter" | "coach_multiagent"
    input: dict[str, Any]             # agent-specific payload
    metadata: dict[str, Any] = Field(default_factory=dict)  # e.g. expected_routes
    assertions: list[Assertion]

class AssertionResult(BaseModel):
    assertion_id: str
    passed: bool
    score: float                      # 0.0–1.0
    rationale: str | None = None      # required for model_graded

class CaseResult(BaseModel):
    case_id: str
    agent: str
    provider: str                     # "claude" | "gemini"
    run_id: str
    output: dict[str, Any]
    trace_ref: str | None = None      # LangSmith url/id
    assertion_results: list[AssertionResult]
    tool_calls: int
    revisions: int | None = None      # field_reporter only
    latency_ms: int
    passed: bool                      # weighted threshold across assertions
    timestamp: datetime

class RunSummary(BaseModel):
    run_id: str
    agent: str
    provider: str
    started_at: datetime
    finished_at: datetime
    n_cases: int
    pass_rate: float
    per_assertion_pass_rate: dict[str, float]
    baseline_run_id: str | None = None
    regressions: list[str] = Field(default_factory=list)  # assertion ids newly failing
```

---

## 7. The judge (LLM-as-judge)

- Uses a **separate, strong model** as the judge — never the same instance/provider being evaluated in that case (avoid a model grading its own homework).
- **Structured output only**: returns `{score: float 0–1, passed: bool, rationale: str, evidence_span: str}`. Validate against a pydantic model; if the judge returns malformed output, retry once, then record an **error** (not a silent pass).
- **Anti-sycophancy rule:** the judge prompt must require it to quote the specific span of the output that supports or refutes the criterion. No quote → cannot pass.
- Rubrics live in YAML (`judge/rubrics/*.yaml`) so criteria are versioned and diff-able.

---

## 8. Per-agent eval packs

### 8.1 Field Reporter — assertions

| id | kind | what it checks |
|---|---|---|
| `fr.output_valid` | deterministic | Draft has all required sections (title, body, sources). |
| `fr.budget_ok` | deterministic | `tool_calls ≤ budget`, `revisions ≤ MAX_REVISIONS`. |
| `fr.citations_present` | deterministic | ≥1 citation, each resolving to a real source-material fixture id. |
| `fr.grounded` | model_graded | Every factual claim is supported by the provided source material. |
| `fr.independent_rubric_pass` | model_graded | Final draft passes the SAME rubric the agent critiques against — judged independently. |
| `fr.revision_improved` | deterministic | Independent rubric score at final > score at revision 0 (compute by re-judging the rev-0 draft). |

### 8.2 Coach Multi-Agent — assertions

| id | kind | what it checks |
|---|---|---|
| `cx.routing_correct` | deterministic | Specialists actually invoked ⊇ `metadata.expected_routes`. |
| `cx.citations_scoped` | deterministic | Every cited source belongs to the citing specialist's namespace. |
| `cx.no_uncited_claims` | model_graded | No specialist claim lacks a citation. |
| `cx.no_contradiction` | model_graded | Specialist outputs do not contradict each other. |
| `cx.synthesis_faithful` | model_graded | Supervisor synthesis represents specialist outputs without dropping/distorting. |
| `cx.scope_safety` | model_graded | Recovery/corrective advice includes an appropriate "see a professional" flag when the case warrants it. |

### 8.3 Dataset construction rules (both agents)
- 20–40 cases each. Mix of: **easy** (should pass), **known-hard** (designed to trip a specific failure mode), and **adversarial** (edge inputs).
- Each hard/adversarial case must name, in `metadata.targets`, which assertion it is trying to break. This makes the dataset *durable* and self-documenting.
- No real user data. Fixtures only.

---

## 9. CLI

```
python -m evals run --agent field_reporter --provider claude
python -m evals run --agent coach_multiagent --provider all      # claude + gemini
python -m evals run --agent field_reporter --provider claude --baseline <run_id>
python -m evals report --run <run_id>
python -m evals compare --run-a <claude_run> --run-b <gemini_run>
```

---

## 10. Acceptance criteria (definition of done)

- [ ] `python -m evals run --agent field_reporter --provider claude` runs end-to-end on ≥20 cases and writes results + report.
- [ ] Same for `coach_multiagent`.
- [ ] `--provider all` produces a Claude-vs-Gemini comparison table.
- [ ] `--baseline <run_id>` populates `RunSummary.regressions` correctly (verified with a deliberately-broken run in tests).
- [ ] Every deterministic check is unit-tested; **≥80% coverage** on `checks/`.
- [ ] Malformed judge output is retried once, then recorded as an error — never a silent pass (test this).
- [ ] No secrets in code; all keys read from env; `.env.example` documents them.
- [ ] `mypy --strict` (or pyright strict) passes on `eval_harness/`.
- [ ] `README.md` lets a stranger clone and run one eval in under 10 minutes.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Judge is flaky / non-deterministic | Low temperature; require evidence span; report judge disagreement rate; keep rubrics tight. |
| Eval cost (many LLM calls) | Cache agent outputs per case+provider so re-judging doesn't re-run the agent; `--limit N` flag for quick smoke runs. |
| Dataset overfits to today's prompts | Adversarial cases target failure *modes*, not phrasings; review dataset quarterly. |
| Scope creep (dashboard, auto-tuning) | Explicit non-goals in §2. v1 is CLI + report only. |

---

## 12. What we expect to find (feeds the teardown)

Write these down now; confirm or refute them with the harness:
1. Field-reporter grades itself more leniently than an independent judge does.
2. Coach specialists occasionally contradict each other on recovery vs. workout intensity.
3. Claude and Gemini differ measurably on **citation integrity**, not just tone.
4. Some revision loops burn budget without improving the independent score.

Any one of these, shown with data, is a strong Hacker News post.
