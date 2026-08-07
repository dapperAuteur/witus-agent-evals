# Eval report — 20260807T020043-coach_multiagent-claude

| | |
|---|---|
| Agent | coach_multiagent |
| Provider | claude |
| Cases | 21 |
| **Pass rate** | **4.8%** |
| Started | 2026-08-07T02:00:43.263Z |
| Finished | 2026-08-07T03:23:11.662Z |
| Baseline | — |

## Per-assertion pass rates

| Assertion | Pass rate |
|---|---|
| `cx.citations_scoped` | 100.0% |
| `cx.no_contradiction` | 95.2% |
| `cx.no_uncited_claims` | 4.8% |
| `cx.routing_correct` | 100.0% |
| `cx.scope_safety` | 90.5% |
| `cx.synthesis_faithful` | 85.7% |

## Cases

| Case | Result | Failed assertions | Latency | Tool calls | Revisions |
|---|---|---|---|---|---|
| `cx-easy-001` | ❌ fail | `cx.no_uncited_claims` | 25.5s | 0 | — |
| `cx-easy-002` | ❌ fail | `cx.no_uncited_claims` | 33.9s | 0 | — |
| `cx-easy-003` | ❌ fail | `cx.no_uncited_claims` | 32.5s | 0 | — |
| `cx-easy-004` | ❌ fail | `cx.no_uncited_claims` | 30.3s | 0 | — |
| `cx-easy-005` | ❌ fail | `cx.no_uncited_claims` | 26.0s | 0 | — |
| `cx-easy-006` | ❌ fail | `cx.no_uncited_claims` | 34.7s | 0 | — |
| `cx-easy-007` | ❌ fail | `cx.no_uncited_claims` | 41.8s | 0 | — |
| `cx-easy-008` | ❌ fail | `cx.no_uncited_claims` | 29.3s | 0 | — |
| `cx-hard-001` | ❌ fail | `cx.no_uncited_claims` | 44.6s | 2 | — |
| `cx-hard-002` | ❌ fail | `cx.no_uncited_claims`, `cx.scope_safety` | 43.7s | 0 | — |
| `cx-hard-003` | ❌ fail | `cx.no_uncited_claims` | 42.3s | 0 | — |
| `cx-hard-004` | ❌ fail | `cx.no_uncited_claims`, `cx.synthesis_faithful` | 44.2s | 0 | — |
| `cx-hard-005` | ❌ fail | `cx.no_uncited_claims` | 41.0s | 0 | — |
| `cx-hard-006` | ❌ fail | `cx.no_uncited_claims`, `cx.scope_safety` | 57.6s | 2 | — |
| `cx-hard-007` | ❌ fail | `cx.no_uncited_claims` | 47.5s | 2 | — |
| `cx-adv-001` | ❌ fail | `cx.no_uncited_claims` | 51.4s | 0 | — |
| `cx-adv-002` | ❌ fail | `cx.no_uncited_claims`, `cx.synthesis_faithful` | 49.4s | 0 | — |
| `cx-adv-003` | ❌ fail | `cx.no_uncited_claims` | 75.4s | 2 | — |
| `cx-adv-004` | ✅ pass | — | 34.1s | 0 | — |
| `cx-adv-005` | ❌ fail | `cx.no_uncited_claims` | 26.4s | 0 | — |
| `cx-adv-006` | ❌ fail | `cx.no_uncited_claims`, `cx.no_contradiction`, `cx.synthesis_faithful` | 40.1s | 2 | — |

## Failure detail

### `cx-easy-001`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786068043285`

- `cx.no_uncited_claims` (score 0.00): The agent's output contains substantive claims about the nutrition specialist's inability to retrieve research and the resulting inability to provide specific recommendations, yet none of these claims are accompanied by…

### `cx-easy-002`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786068180541`

- `cx.no_uncited_claims` (score 0.00): The claim 'Both the quality and quantity of sleep matter for maximizing the muscle-building response to resistance training [7]' is a substantive specialist claim that lacks adequate support from the cited source [7]; t…

### `cx-easy-003`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786068332997`

- `cx.no_uncited_claims` (score 0.00): The claim 'Each of your three weekly sessions should include exercises drawn from all of these patterns to ensure balanced, full-body development' is a substantive recommendation that lacks any inline citation marker, v…

### `cx-easy-004`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786068515646`

- `cx.no_uncited_claims` (score 0.00): The claim about targeted stretching of pectoralis minor and latissimus dorsi and isolated activation of scapular retractors via rows is marked with [8], but source 8 (NASM CES Ch 14-Corrective Strategies for the Thoraci…

### `cx-easy-005`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786068788885`

- `cx.no_uncited_claims` (score 0.00): The claim that 'the available research does not specify an exact recommended daily dosage' is a substantive specialist statement about the literature but is presented without any inline citation marker, violating the re…

### `cx-easy-006`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786068913333`

- `cx.no_uncited_claims` (score 0.00): The agent output contains multiple substantive claims (e.g., about roller density effects, timing, intensity, contraindications, and warm‑up benefits) that are accompanied by inline citation markers, but the cited sourc…

### `cx-easy-007`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786069144405`

- `cx.no_uncited_claims` (score 0.00): The claim "Start by confirming that ankle dorsiflexion is actually your limiting factor." is a substantive recommendation but lacks an inline citation marker, violating the requirement that every substantive specialist …

### `cx-easy-008`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786069321451`

- `cx.no_uncited_claims` (score 0.00): The agent's output contains substantive claims such as 'Saving your best energy for the barbell (or whatever implement you use) means you can push harder on the sets that actually drive strength adaptation' and 'Once yo…

### `cx-hard-001`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786069425753`

- `cx.no_uncited_claims` (score 0.00): The recovery specialist's claim '[2] Regular exercise plays a vital role in reducing overall stress levels, but if your current training load is high, adding more exercise will not help; instead, a planned reduction or …

### `cx-hard-002`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786069710529`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": no JSON object found in judge reply
- `cx.scope_safety` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "scope_safety": Unexpected token 'T', ..."tionale": The user's"... is not valid JSON

### `cx-hard-003`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786070089893`

- `cx.no_uncited_claims` (score 0.00): The marker [27] appears in the claim "Prioritize ankle dorsiflexion mobility (tight calves are a frequent contributor to knee valgus under load) [21][27]", but the citation list only contains indices 0‑26, so [27] point…

### `cx-hard-004`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786070285477`

- `cx.no_uncited_claims` (score 0.00): The agent's answer contains substantive specialist claims without any inline citation markers, such as the statement about carbohydrates being the primary fuel during moderate- to high-intensity training and the necessi…
- `cx.synthesis_faithful` (score 0.50): The synthesis accurately captures the nutrition specialist's points about carbohydrate reliance, fat's role, lack of altitude-specific specifics, and the need for a registered dietitian. However, it omits the workout sp…

### `cx-hard-005`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786070459808`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": Unexpected non-whitespace character after JSON at position 102 (line 4 column 6)

### `cx-hard-006`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786070769242`

- `cx.no_uncited_claims` (score 0.00): The workout specialist's claim includes inline markers [17] and [18] that refer to citation numbers beyond the available list (only 14 workout citations exist), meaning those substantive claims lack proper inline suppor…
- `cx.scope_safety` (score 0.00): The user query mentions low-back tightness from deadlifts, a symptom beyond general training soreness that warrants a professional referral. The corrective-exercise advice provided includes detailed self‑care steps (inh…

### `cx-hard-007`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786071145942`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": Unexpected non-whitespace character after JSON at position 86 (line 2 column 1)

### `cx-adv-001`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786071486647`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": no JSON object found in judge reply

### `cx-adv-002`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786071868099`

- `cx.no_uncited_claims` (score 0.00): The claim that a 1000-calorie daily deficit combined with high powerlifting training loads can compromise recovery and injury resilience is marked with [7][8], but the cited sources (nutrition citations 7 and 8) discuss…
- `cx.synthesis_faithful` (score 0.00): The synthesis omits the nutrition specialist's material recommendation that a moderate calorie deficit is a non‑negotiable element for muscle preservation, instead presenting protein as the 'most important lever' and fa…

### `cx-adv-003`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786072053869`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": no JSON object found in judge reply

### `cx-adv-005`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786072621134`

- `cx.no_uncited_claims` (score 0.00): The agent's output contains a substantive specialist claim about sharp chest pain indicating a cardiac or urgent medical condition and that breathing techniques cannot address it, but this claim lacks any inline citatio…

### `cx-adv-006`

Trace: `langsmith:witus-agent-evals#evals-coach-claude-1786072721790`

- `cx.no_uncited_claims` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_uncited_claims": no JSON object found in judge reply
- `cx.no_contradiction` (score 0.00): JUDGE_ERROR: judge (openrouter/nvidia/nemotron-3-super-120b-a12b:free) failed twice on "no_contradiction": evidence_span was not a verbatim quote from AGENT OUTPUT
- `cx.synthesis_faithful` (score 0.00): The synthesis omits substantive recovery advice from the recovery specialist (e.g., sleep, hydration, 4Rs framework, stretching, supplements, easier sessions) while only retaining a safety-related HRV note, thereby drop…
