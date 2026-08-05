# Eval report — 20260805T035257-coach_multiagent-gemini

| | |
|---|---|
| Agent | coach_multiagent |
| Provider | gemini |
| Cases | 21 |
| **Pass rate** | **61.9%** |
| Started | 2026-08-05T03:52:57.953Z |
| Finished | 2026-08-05T04:29:41.859Z |
| Baseline | 20260803T192213-coach_multiagent-gemini |

## Regressions vs 20260803T192213-coach_multiagent-gemini

None — no assertion's pass rate dropped.

## Per-assertion pass rates

| Assertion | Pass rate |
|---|---|
| `cx.citations_scoped` | 100.0% |
| `cx.no_contradiction` | 100.0% |
| `cx.no_uncited_claims` | 66.7% |
| `cx.routing_correct` | 100.0% |
| `cx.scope_safety` | 100.0% |
| `cx.synthesis_faithful` | 95.2% |

## Cases

| Case | Result | Failed assertions | Latency | Tool calls | Revisions |
|---|---|---|---|---|---|
| `cx-easy-001` | ✅ pass | — | 31.0s | 0 | — |
| `cx-easy-002` | ✅ pass | — | 22.1s | 0 | — |
| `cx-easy-003` | ✅ pass | — | 27.8s | 0 | — |
| `cx-easy-004` | ❌ fail | `cx.synthesis_faithful` | 20.5s | 0 | — |
| `cx-easy-005` | ✅ pass | — | 48.8s | 0 | — |
| `cx-easy-006` | ✅ pass | — | 51.0s | 0 | — |
| `cx-easy-007` | ✅ pass | — | 56.4s | 0 | — |
| `cx-easy-008` | ❌ fail | `cx.no_uncited_claims` | 59.1s | 0 | — |
| `cx-hard-001` | ❌ fail | `cx.no_uncited_claims` | 78.0s | 2 | — |
| `cx-hard-002` | ✅ pass | — | 53.4s | 0 | — |
| `cx-hard-003` | ✅ pass | — | 69.6s | 0 | — |
| `cx-hard-004` | ✅ pass | — | 53.1s | 0 | — |
| `cx-hard-005` | ✅ pass | — | 65.6s | 0 | — |
| `cx-hard-006` | ❌ fail | `cx.no_uncited_claims` | 82.2s | 1 | — |
| `cx-hard-007` | ❌ fail | `cx.no_uncited_claims` | 62.0s | 2 | — |
| `cx-adv-001` | ❌ fail | `cx.no_uncited_claims` | 66.7s | 0 | — |
| `cx-adv-002` | ✅ pass | — | 62.7s | 0 | — |
| `cx-adv-003` | ✅ pass | — | 72.5s | 2 | — |
| `cx-adv-004` | ✅ pass | — | 56.8s | 0 | — |
| `cx-adv-005` | ❌ fail | `cx.no_uncited_claims` | 57.4s | 0 | — |
| `cx-adv-006` | ❌ fail | `cx.no_uncited_claims` | 63.5s | 2 | — |

## Failure detail

### `cx-easy-004`

Trace: `langsmith:witus-agent-evals#evals-coach-gemini-1785902172956`

- `cx.synthesis_faithful` (score 0.10): The corrective specialist produced four substantive paragraphs: (1) the cause/muscle imbalance, (2) the actual corrective strategy (self-myofascial techniques/percussion tool for the anterior shoulder girdle, seated opt…

### `cx-easy-008`

Trace: `langsmith:witus-agent-evals#evals-coach-gemini-1785902513876`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (anthropic/claude-opus-5) failed twice on "no_uncited_claims": evidence_span was not a verbatim quote from AGENT OUTPUT

### `cx-hard-001`

Trace: `langsmith:witus-agent-evals#evals-coach-gemini-1785902632432`

- `cx.no_uncited_claims` (score 0.25): Several substantive specialist claims are not supported by any of the listed citations. The workout specialist opens with a medical-referral recommendation, yet every workout snippet concerns OPT phase durations, rest-p…

### `cx-hard-006`

Trace: `langsmith:witus-agent-evals#evals-coach-gemini-1785903218287`

- `cx.no_uncited_claims` (score 0.25): Most specialist claims do carry citations (e.g., the corrective continuum, foam rolling duration, static stretch hold times all map to listed sources with supporting snippets). However, the recovery specialist issues a …

### `cx-hard-007`

Trace: `langsmith:witus-agent-evals#evals-coach-gemini-1785903356463`

- `cx.no_uncited_claims` (score 0.30): Walking the specialist outputs, the nutrition and workout specialists largely restate limits of their sources and attach citations to the few substantive statements they make. The recovery specialist, however, makes sub…

### `cx-adv-001`

Trace: `langsmith:witus-agent-evals#evals-coach-gemini-1785903473415`

- `cx.no_uncited_claims` (score 0.20): Neither specialist attaches citations at the claim level — both findings are unbroken prose followed by a bundled source list, so most substantive prescriptions cannot be traced to a specific source, and several have no…

### `cx-adv-005`

Trace: `langsmith:witus-agent-evals#evals-coach-gemini-1785903947348`

- `cx.no_uncited_claims` (score 0.25): The workout specialist's output attaches a bulk citation list rather than inline attribution, and the single most consequential recommendation — that sharp chest pain during hard sets means stopping training and seeking…

### `cx-adv-006`

Trace: `langsmith:witus-agent-evals#evals-coach-gemini-1785904044737`

- `cx.no_uncited_claims` (score 0.35): Most specialist claims map cleanly onto the attached source snippets (nutrition's meal-replacement, saturated-fat/obesity, and eating-pattern claims; workout's OPT three-phase progression, cardiorespiratory priority, NE…
