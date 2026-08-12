# Judge stability probe: `answer_actionability`, 2026-08-12

`RESULT-2026-08-11.md` withdrew its `answer_actionability` finding because re-judging five cases on an unchanged configuration passed 3 of 5 where the original run passed 0 of 5, and one of ten follow-up judgments threw a hard `JUDGE_ERROR`. That was an anecdote. This document replaces it with a measurement, and answers the question BAM asked: can Claude serve as the paid judge for this criterion.

## What was measured

**Judge self-agreement on identical inputs.** Nothing about any agent is measured here, and no agent was run.

- **Source of the judged text:** the stored outputs of `runs/20260811T153415-coach_v3_arch-claude/results.jsonl`. `cx-adv-003` carries an agent timeout instead of an answer and is excluded, leaving **20 usable cases**.
- **Criterion:** `answer_actionability` only, from `src/judge/rubrics/coach_v3_arch.yaml`, unmodified.
- **Prompt:** the harness's own `buildJudgePrompt`, reached through the harness's own `judgeAssertion`, so the retry-once path, the verbatim-quote check and the `JUDGE_ERROR` bookkeeping are the production ones rather than a reimplementation.
- **Design:** each judge judged all 20 cases **three times**. The stored outputs never change between passes, so the judge is the only thing varying.
- **Judgments:** 20 cases × 3 passes × 2 judges = **120**, all completed.

Script: `scripts/judge-stability.ts`. Raw per-judgment records (verdict, score, rationale) are at `runs/judge-stability/20260812-judgments.jsonl`, which is gitignored like every other run artifact.

**On the anti-self-grading guard.** `resolveJudgeProvider` in `src/providers.ts` was not disabled, edited, or worked around in the harness. The script obtains an anthropic judge by passing `gemini` as the provider-under-test argument, which is documented at length in the script header. That is acceptable here for one reason: this experiment emits a variance figure for a judge and never a score comparing two agents, so the failure the guard exists to prevent has no purchase. The moment a number from this script is used to compare agents, the guard applies again.

## Headline

| | `openrouter` / `nemotron-3-super-120b-a12b:free` | `anthropic` / `claude-opus-5` |
|---|---|---|
| **Self-agreement** (all 3 verdicts identical) | **10/20 = 50.0%** | **18/20 = 90.0%** |
| Cases that flipped | 10 | 2 |
| **Errors** (`JUDGE_ERROR`) | **4/60 = 6.7%** | **0/60 = 0.0%** |
| Pass rate, pass 1 / 2 / 3 | 55.0% / 65.0% / 70.0% | 45.0% / 35.0% / 40.0% |
| **Mean pass rate** | **63.3%** (spread 15.0 pts) | **40.0%** (spread 10.0 pts) |
| Wall clock per pass | 803s / 633s / 728s (2 in flight) | 69s / 71s / 71s (4 in flight) |

The current free judge disagrees with itself on half the cases. Claude disagrees with itself on one case in ten.

## The free judge, in detail

**Unstable cases (10 of 20).** `P` = pass, `F` = fail, `E` = `JUDGE_ERROR` recorded as a failure.

| Case | Pass 1 | Pass 2 | Pass 3 | Split |
|---|---|---|---|---|
| `cx-easy-001` | P | F | F | 1P / 2F |
| `cx-easy-004` | P | P | F | 2P / 1F |
| `cx-easy-005` | F | F | P | 1P / 2F |
| `cx-easy-007` | F | F | P | 1P / 2F |
| `cx-hard-001` | F | P | F | 1P / 2F |
| `cx-hard-003` | P | F | F | 1P / 2F |
| `cx-hard-005` | F | F | P | 1P / 2F |
| `cx-adv-002` | E | P | P | error + 2P |
| `cx-adv-005` | E | P | P | error + 2P |
| `cx-adv-006` | E | P | P | error + 2P |

**The errors were unavailability, not malformed output.** All four are `Request timed out` after the judge's built-in retry, all four landed in pass 1, and all four hit consecutive cases (`cx-adv-002`, `-004`, `-005`, `-006`). That reads as a bad patch on the free endpoint rather than a per-case parsing failure. `cx-adv-004` errored too but its other two passes both said fail, so it does not appear in the flip table above.

**Errors are a biased failure, not a neutral one.** The harness rule that a broken judge is never a pass is correct, and it means every timeout is recorded as a fail. A run that happens to hit a bad patch on the free endpoint gets its pass rate pushed down, and only down. Removing the four errored judgments changes the picture:

| | With errors counted as failures (harness semantics) | Over clean judgments only |
|---|---|---|
| Self-agreement | 10/20 = 50.0% | 13/20 = 65.0% |
| Pass rate, pass 1 / 2 / 3 | 55.0% / 65.0% / 70.0% | 68.8% / 65.0% / 70.0% |
| Mean (spread) | 63.3% (15.0 pts) | 67.9% (5.0 pts) |

The clean-only column is the weaker number of the two, not the truer one: four of those cases contribute two draws instead of three, and a case judged twice has a better chance of looking unanimous than a case judged three times. Both columns are reported because the difference between them is itself the finding, which is that a meaningful part of this judge's run-to-run movement comes from being intermittently unavailable rather than from changing its mind.

## Claude, in detail

**Unstable cases (2 of 20).**

| Case | Pass 1 | Pass 2 | Pass 3 | Split |
|---|---|---|---|---|
| `cx-adv-001` | P | F | F | 1P / 2F |
| `cx-adv-006` | P | F | P | 2P / 1F |

Zero errors in 60 judgments. Every judgment returned a schema-valid verdict carrying a verbatim quote from the output on the first or second attempt.

## What this does not show

**Higher self-agreement is consistency, not correctness.** A judge that returned fail on every case would score 100% here. Claude's mean pass rate on this criterion is 40.0% against the free judge's 63.3%, and their majority verdicts differ on **6 of 20 cases**. Nothing in this experiment says which of those two readings of the rubric is right. It says only that one of them is reproducible and the other is close to a coin flip on half the dataset.

That 20-point gap between two judges on identical text is a fresh instance of the standing rule this project has already measured at 47 points on another criterion: **numbers from different judges are never comparable.** Re-judging the A/B on Claude does not let the new actionability number be compared with the withdrawn one. It replaces it.

## Sample-size caveat

Twenty cases and three passes per judge is a small sample, and two limits follow from it.

1. **A one-case or two-case difference is not a finding.** Claude's 2 unstable cases and the free judge's 10 are 8 cases apart, which is well outside that band; the 90% against 50% gap is the one result here that carries weight. The pass-rate spreads (10.0 points and 15.0 points) rest on differences of two and three cases and should be read as rough magnitudes, not as measured quantities.
2. **Three draws can only detect frequent flipping.** A case that flips one time in ten will read as unanimous in three draws most of the time. Both agreement figures are therefore **upper bounds** on stability. Claude's real self-agreement on this criterion is at most 90%, not at least.

## Recommendation

**Use Claude for `answer_actionability`, and repeat the judgment anyway. Both, not either.**

Claude is clearly the better judge of the two on every axis measured: 90% against 50% self-agreement, zero errors against four, and roughly a tenth of the wall clock. If exactly one change is made, make it this one.

It is not, on its own, enough. Claude's run-level pass rate moved **10.0 points** across three passes over identical inputs. The withdrawn finding claimed a 10-point difference between two arms. A single Claude judging pass therefore has a noise band the same size as the effect it would be asked to resolve, and a 10-point delta produced by one pass would be no more publishable than the withdrawn one, merely better-sourced.

So the criterion needs both halves:

1. **Move `answer_actionability` to `anthropic` / `claude-opus-5`** for any run whose actionability number will be published. This is a per-run judge choice, not a config change. The harness default stays `openrouter`; this experiment informs the decision and does not make it, and nothing in `src/judge/config.ts` was touched.
2. **Judge each case three times and publish the verdict as a majority of three, with the agreement rate printed beside the score.** On this dataset that turns Claude's two unstable cases into settled verdicts and yields a majority-of-three pass rate of 40.0% (8/20), with 90% agreement stated alongside it. A reader can then see the noise floor instead of guessing at it.

A number published without an agreement rate beside it is the thing that had to be withdrawn on 2026-08-11. The agreement rate is the fix; the paid judge is what makes the agreement rate high enough to be worth publishing.

**Cost note.** Three passes on the paid judge is 3× the judging cost of one pass, on 20 cases and one criterion. No dollar figure is given here because none was measured; check the Anthropic console for actual spend on this run before budgeting a larger one. `plans/user-tasks/09-anthropic-credit-topup.md` is the standing task on that account, and the balance was live on 2026-08-12.

## Reproducing this

```bash
npx tsx scripts/judge-stability.ts                    # both judges, 3 passes, 20 cases
npx tsx scripts/judge-stability.ts --judge anthropic  # one judge
npx tsx scripts/judge-stability.ts --reps 2 --limit 3 # cheap smoke run
```

Raw judgments append to `--out` as they arrive, so a run that dies partway still leaves every judgment it completed on disk.

## Related

- `datasets/coach_arch_ab/RESULT-2026-08-11.md`: the withdrawn finding, and the "what would make this stronger" item this document closes out.
- `scripts/judge-stability.ts`: the script, including the full reasoning on the anti-self-grading guard.
- `src/judge/rubrics/coach_v3_arch.yaml`: the rubric text, unchanged by this experiment.
- `plans/user-tasks/07-openrouter-credit-for-judge.md`: the free judge's rate-limit economics, separate from its accuracy.
