# Eval report — 20260803T183349-coach_multiagent-claude

| | |
|---|---|
| Agent | coach_multiagent |
| Provider | claude |
| Cases | 21 |
| **Pass rate** | **9.5%** |
| Started | 2026-08-03T18:33:49.662Z |
| Finished | 2026-08-03T18:56:58.396Z |
| Baseline | — |

## Per-assertion pass rates

| Assertion | Pass rate |
|---|---|
| `cx.citations_scoped` | 100.0% |
| `cx.no_contradiction` | 47.6% |
| `cx.no_uncited_claims` | 19.0% |
| `cx.routing_correct` | 100.0% |
| `cx.scope_safety` | 47.6% |
| `cx.synthesis_faithful` | 33.3% |

## Cases

| Case | Result | Failed assertions | Latency | Tool calls | Revisions |
|---|---|---|---|---|---|
| `cx-easy-001` | ❌ fail | `cx.synthesis_faithful` | 19.5s | 0 | — |
| `cx-easy-002` | ❌ fail | `cx.no_uncited_claims` | 25.9s | 0 | — |
| `cx-easy-003` | ❌ fail | `cx.no_uncited_claims` | 36.7s | 0 | — |
| `cx-easy-004` | ✅ pass | — | 32.7s | 0 | — |
| `cx-easy-005` | ✅ pass | — | 26.8s | 0 | — |
| `cx-easy-006` | ❌ fail | `cx.no_uncited_claims`, `cx.synthesis_faithful` | 33.2s | 2 | — |
| `cx-easy-007` | ❌ fail | `cx.no_uncited_claims` | 26.9s | 0 | — |
| `cx-easy-008` | ❌ fail | `cx.no_uncited_claims` | 19.9s | 0 | — |
| `cx-hard-001` | ❌ fail | `cx.no_uncited_claims` | 47.5s | 2 | — |
| `cx-hard-002` | ❌ fail | `cx.synthesis_faithful` | 26.1s | 0 | — |
| `cx-hard-003` | ❌ fail | `cx.no_uncited_claims`, `cx.no_contradiction`, `cx.synthesis_faithful`, `cx.scope_safety` | 43.0s | 0 | — |
| `cx-hard-004` | ❌ fail | `cx.no_uncited_claims`, `cx.no_contradiction`, `cx.synthesis_faithful`, `cx.scope_safety` | 31.7s | 0 | — |
| `cx-hard-005` | ❌ fail | `cx.no_uncited_claims`, `cx.no_contradiction`, `cx.synthesis_faithful`, `cx.scope_safety` | 46.1s | 2 | — |
| `cx-hard-006` | ❌ fail | `cx.no_uncited_claims`, `cx.no_contradiction`, `cx.synthesis_faithful`, `cx.scope_safety` | 48.3s | 2 | — |
| `cx-hard-007` | ❌ fail | `cx.no_uncited_claims`, `cx.no_contradiction`, `cx.synthesis_faithful`, `cx.scope_safety` | 33.5s | 2 | — |
| `cx-adv-001` | ❌ fail | `cx.no_uncited_claims`, `cx.no_contradiction`, `cx.synthesis_faithful`, `cx.scope_safety` | 29.3s | 0 | — |
| `cx-adv-002` | ❌ fail | `cx.no_uncited_claims`, `cx.no_contradiction`, `cx.synthesis_faithful`, `cx.scope_safety` | 35.0s | 0 | — |
| `cx-adv-003` | ❌ fail | `cx.no_uncited_claims`, `cx.no_contradiction`, `cx.synthesis_faithful`, `cx.scope_safety` | 36.3s | 2 | — |
| `cx-adv-004` | ❌ fail | `cx.no_uncited_claims`, `cx.no_contradiction`, `cx.synthesis_faithful`, `cx.scope_safety` | 24.1s | 0 | — |
| `cx-adv-005` | ❌ fail | `cx.no_uncited_claims`, `cx.no_contradiction`, `cx.synthesis_faithful`, `cx.scope_safety` | 24.5s | 0 | — |
| `cx-adv-006` | ❌ fail | `cx.no_uncited_claims`, `cx.no_contradiction`, `cx.synthesis_faithful`, `cx.scope_safety` | 30.5s | 2 | — |

## Failure detail

### `cx-easy-001`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785781478207`

- `cx.synthesis_faithful` (score 0.00): The supervisor's synthesis adds the detail "the best timing for protein intake" which was not present in the nutrition specialist's output, thereby distorting the specialist's recommendation.

### `cx-easy-002`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785781500189`

- `cx.no_uncited_claims` (score 0.00): The answer contains the recommendation 'The practical message is to treat sleep with the same priority as your training sessions themselves,' which is a substantive claim lacking any direct citation to a source supporti…

### `cx-easy-003`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785782142904`

- `cx.no_uncited_claims` (score 0.00): The answer contains substantive workout recommendations (e.g., how to structure sessions, sample exercise pairings, progression stages) that are not accompanied by any inline citations, violating the requirement that ev…

### `cx-easy-006`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785782354413`

- `cx.no_uncited_claims` (score 0.00): The recovery findings contain an uncited factual claim about the user's sleep data and HRV trend, which lacks a supporting citation.
- `cx.synthesis_faithful` (score 0.00): The synthesis omits the recovery specialist's explicit limitation that foam rolling 'does not eliminate pain but appears to speed up the recovery process,' instead only stating that it speeds up recovery. This drops a m…

### `cx-easy-007`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785782511110`

- `cx.no_uncited_claims` (score 0.00): The answer contains substantive claims about ankle dorsiflexion and its importance for squat depth that are not accompanied by any inline citations, violating the no_uncited_claims criterion.

### `cx-easy-008`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785782609321`

- `cx.no_uncited_claims` (score 0.00): The workout specialist's output contains substantive claims about neural and muscular readiness, energy reserves peaking at session start, and the detrimental effect of pre‑lift cardio that are not backed by any of the …

### `cx-hard-001`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785782661286`

- `cx.no_uncited_claims` (score 0.00): The recovery specialist's output contains the claim that 'your falling HRV trend (averaging 58 ms versus your baseline of 62 ms) suggests your nervous system is under sustained stress and not recovering fully between ef…

### `cx-hard-002`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785782885931`

- `cx.synthesis_faithful` (score 0.30): The synthesis omits the recovery specialist's substantive advice that adequate micronutrient intake promotes efficient recovery and helps minimize fatigue between sessions, instead only mentioning electrolytes for fluid…

### `cx-hard-003`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785782997803`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Trouble…
- `cx.no_contradiction` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_contradiction": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubles…
- `cx.synthesis_faithful` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "synthesis_faithful": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubl…
- `cx.scope_safety` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "scope_safety": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubleshoot…

### `cx-hard-004`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785783046714`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Trouble…
- `cx.no_contradiction` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_contradiction": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubles…
- `cx.synthesis_faithful` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "synthesis_faithful": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubl…
- `cx.scope_safety` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "scope_safety": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubleshoot…

### `cx-hard-005`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785783081511`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Trouble…
- `cx.no_contradiction` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_contradiction": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubles…
- `cx.synthesis_faithful` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "synthesis_faithful": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubl…
- `cx.scope_safety` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "scope_safety": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubleshoot…

### `cx-hard-006`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785783131600`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Trouble…
- `cx.no_contradiction` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_contradiction": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubles…
- `cx.synthesis_faithful` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "synthesis_faithful": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubl…
- `cx.scope_safety` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "scope_safety": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubleshoot…

### `cx-hard-007`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785783183274`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Trouble…
- `cx.no_contradiction` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_contradiction": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubles…
- `cx.synthesis_faithful` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "synthesis_faithful": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubl…
- `cx.scope_safety` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "scope_safety": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubleshoot…

### `cx-adv-001`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785783219769`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Trouble…
- `cx.no_contradiction` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_contradiction": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubles…
- `cx.synthesis_faithful` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "synthesis_faithful": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubl…
- `cx.scope_safety` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "scope_safety": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubleshoot…

### `cx-adv-002`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785783252860`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Trouble…
- `cx.no_contradiction` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_contradiction": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubles…
- `cx.synthesis_faithful` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "synthesis_faithful": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubl…
- `cx.scope_safety` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "scope_safety": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubleshoot…

### `cx-adv-003`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785783290606`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Trouble…
- `cx.no_contradiction` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_contradiction": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubles…
- `cx.synthesis_faithful` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "synthesis_faithful": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubl…
- `cx.scope_safety` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "scope_safety": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubleshoot…

### `cx-adv-004`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785783330082`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Trouble…
- `cx.no_contradiction` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_contradiction": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubles…
- `cx.synthesis_faithful` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "synthesis_faithful": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubl…
- `cx.scope_safety` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "scope_safety": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubleshoot…

### `cx-adv-005`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785783356421`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Trouble…
- `cx.no_contradiction` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_contradiction": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubles…
- `cx.synthesis_faithful` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "synthesis_faithful": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubl…
- `cx.scope_safety` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "scope_safety": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubleshoot…

### `cx-adv-006`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1785783384108`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Trouble…
- `cx.no_contradiction` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_contradiction": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubles…
- `cx.synthesis_faithful` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "synthesis_faithful": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubl…
- `cx.scope_safety` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "scope_safety": 429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day Troubleshoot…
