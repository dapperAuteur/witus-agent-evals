# Runbook: the coach architecture A/B

Everything here is built and committed. What is missing is a provider credential, which is deliberately not in the repo. Once one is exported, this is a two-command run.

## Before you spend money

```bash
cd /Users/bam/Code_NOiCloud/ai-builds/claude/witus-agent-evals
export ANTHROPIC_API_KEY=...        # one key, used by BOTH arms and the judge
```

**Use one provider for both arms.** A run where arm A is Gemini and arm B is Claude answers nothing, because two variables moved. If Anthropic credit is short, run both arms on Gemini instead. Just not one each.

Quota note: the full A/B is roughly 21 arm-A calls, 21 arm-B graph runs (each fanning out to a supervisor plus up to four specialists), and 126 judge calls (21 cases times 3 criteria times 2 arms). The Gemini free tier will not cover that in a day. It has bitten this project before.

## Wire the arm-A adapter in

`src/adapters/coach_v2_arch.ts` is written and takes a `ChatCaller`. It is not yet registered, because registering it needs one line in `src/adapters/index.ts` and a chat caller built from the same LangChain provider the rest of the harness uses:

```ts
// src/adapters/index.ts
import { makeCoachV2ArchAdapter } from "./coach_v2_arch.js";
// inside registerBuiltinAdapters(settings):
registerAdapter(makeCoachV2ArchAdapter(makeChatCaller(settings)));
```

`makeChatCaller` should reuse whatever `coach_multiagent`'s provider resolution already does, so the two arms are guaranteed to hit the same model. Do not hand-roll a second client.

## Run the drift guard first

Arm A copies v2's `BASE_DIRECTIVE` verbatim from `gemini/centenarian-os/app/api/coach/route.ts`. If that file changed, the arm no longer represents v2 and the run measures a prompt nobody shipped. `assertDirectiveMatchesSource()` exists for this. Call it before the run and let it throw.

## Run both arms

```bash
npm run evals -- run --dataset coach_arch_ab --arm v2   # adapter coach_v2_arch
npm run evals -- run --dataset coach_arch_ab --arm v3   # adapter coach_multiagent
```

Cases in `cases.jsonl` carry `"agent": "__ARM__"` on purpose. The arm flag substitutes the adapter name, which is what keeps one case file feeding both arms. If the CLI has no `--arm` flag yet, add it there rather than forking the dataset: two case files drift, and a drifted case file makes the comparison meaningless.

Both runs must use the **same judge model**. Record which one in the report. Numbers from different judges are never comparable, which this project has already measured: two judges disagreed by 47 percentage points on identical outputs.

## What to report

Three scores per arm, plus two things that are not scores:

1. `cross_domain_completeness`, split into the six multi-domain cases and the fourteen single-domain ones. **The six are the result.** The claim under test is about cross-domain questions.
2. `scope_safety`, with the four safety traps called out.
3. `answer_actionability`.
4. **Citation counts, reported as a structural fact and never as a score.** Arm A emits zero because it has no retrieval. Writing that as "0% vs 95%" would be dishonest, because arm A was never trying to cite.
5. **Latency and call count per case.** Arm A is one call; arm B is a supervisor plus up to four specialists. If arm B wins, the cost of winning belongs in the same sentence as the win.

## Then update these, in this order

1. The coach `README.md`. It currently says the rebuild "made the answers materially better" and admits no evaluation was run. Replace that admission with the number, whichever direction it goes.
2. `bam-landing-page/docs/Blog Files/fit-t-cent-evolution.md`, which carries a `[METRIC: ...]` placeholder and a sentence saying no comparison exists.
3. `witus/plans/playbook/2026-07-29-job-search-dossier.md` and the app-chapters ebook, if the number is worth an interview.

## If the result is boring

If the two arms score level on `cross_domain_completeness`, the rebuild did not buy what the README claims. **Publish that.** The rebuild still bought citations, safety wiring, and per-node model selection, and saying so honestly is worth more than a quiet delete. This project's best material to date is a 57.1% score published about its own product.
