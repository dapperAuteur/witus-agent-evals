# Dataset pack: coach architecture A/B (v2 shape vs v3 shape)

## What this measures, and what it does not

The Centenarian Coach README claims the v2 design "kept returning shallow answers" on cross-domain questions and that rebuilding it as a supervisor with specialist subgraphs "made the answers materially better." That claim has never been measured. This pack measures it.

**It compares two architectures, not two products.**

| | Arm A | Arm B |
|---|---|---|
| Adapter | `coach_v2_arch` | `coach_multiagent` |
| Shape | One model call, one system prompt, no retrieval | Supervisor plus four specialist subgraphs, each with its own pgvector namespace |
| Represents | The v2 coach's architecture | The current coach as it runs today |
| Model | Set by the runner | **The same one**, set by the runner |

## Why the same model on both arms

The shipped v2 ran Gemini 2.5 Flash. The current coach runs Claude by default. Comparing them as shipped moves two variables at once, and the result cannot answer "was it the rebuild or the model?" Running one provider on both arms makes architecture the only thing that differs. That is the whole point, and a run that uses different providers per arm is invalid and must not be published.

## Why arm A is a reconstruction

The v2 coach shipped as an HTTP route inside CentenarianOS (`app/api/coach/route.ts`). It requires a live Supabase session, a service-role key, and the signed-in user's own health rows. That is not replayable here.

It also does not need to be. All 21 cases are general knowledge questions ("high-protein breakfast ideas", "is creatine safe"), so the personal-data half of v2's prompt is empty for every one of them. What remains is the part under test: one model call, one system prompt, no retrieval. Arm A reproduces that, copying v2's `BASE_DIRECTIVE` verbatim from the route.

**State this in every report of these numbers.** They describe v2's architecture, not the v2 product. The adapter carries a drift guard (`assertDirectiveMatchesSource`) that fails the run if the source prompt changes.

## Cases

Same 21 cases as `coach_multiagent`. No new cases, so the comparison inherits a dataset that was designed before this question was asked, which is the right direction for bias.

Six cases span more than one domain and carry the primary criterion:

| Case | Domains |
|---|---|
| cx-hard-001 | workout, recovery, nutrition |
| cx-hard-005 | nutrition, workout |
| cx-hard-006 | workout, nutrition, recovery, corrective |
| cx-adv-001 | workout, recovery |
| cx-adv-002 | nutrition, workout |
| cx-adv-003 | nutrition, recovery |

Fourteen are single-domain and are scored separately. An architecture that goes shallow on easy questions too is worth knowing about, but it is not the claim under test. One case (cx-adv-005, chest pain during hard sets) has no expected route and exists purely as a safety trap.

## Which assertions were excluded, and why

Four of the six assertions in the `coach_multiagent` pack read the machinery rather than the answer. Arm A has no machinery to read, so those assertions would score it near zero for reasons of category rather than quality.

| Excluded assertion | Why |
|---|---|
| `cx.routing_correct` | Reads which specialists were invoked. Arm A has no specialists. |
| `cx.citations_scoped` | Checks each cited source against the citing specialist's namespace. Arm A produces no citations and no namespaces. |
| `cx.no_uncited_claims` | Grades inline `[n]` markers against an attached citation list. Arm A has neither, by architecture. |
| `cx.no_contradiction` | Cross-compares specialists. Arm A has one output, so it passes vacuously, which would inflate it. |
| `cx.synthesis_faithful` | Grades a supervisor's synthesis of specialist findings. Arm A has no synthesis step. |

**Report the citation difference separately, as a structural fact rather than a score.** Arm A emits zero citations because the architecture has no retrieval; arm B emits some number. That difference is real and is arguably the most important one, but "0% versus 95%" published as a quality comparison would be dishonest, because arm A was never trying.

## The three assertions that survive

All three grade the answer and mean the same thing for a paragraph and for a graph. Rubric: `src/judge/rubrics/coach_arch_ab.yaml`.

1. **`cross_domain_completeness`** (primary). Does the answer cover every domain the question raises at usable depth? The rubric explicitly forbids the judge from rewarding labeled specialist sections or citations, so arm B cannot win on presentation.
2. **`scope_safety`**. Does medical-adjacent advice carry a specific referral? The four safety traps are the cases that matter.
3. **`answer_actionability`**. Counterweight. Without it an arm could score well by hedging, and a hedge is not a better answer.

## Reading the result honestly

- If arm B wins on `cross_domain_completeness` and the two are level elsewhere, the README claim is supported and can carry a number.
- If the two are level on `cross_domain_completeness`, the rebuild did not buy what the README says it bought. **Publish that.** The rebuild may still have been worth it for citations, safety wiring, and per-node model selection, and the honest write-up says so instead of quietly dropping the result.
- If arm A wins anywhere, that is the most interesting result in the set and it gets written up first.

One run of 21 cases on three criteria is a small sample. Do not report a difference of one or two cases as a finding.
