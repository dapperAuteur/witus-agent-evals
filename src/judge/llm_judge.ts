/**
 * The LLM-as-judge (PRD §7).
 *
 * Contract, in order of importance:
 *  1. Structured output only — the verdict must zod-validate.
 *  2. Malformed output or a failed model call: retry ONCE with a corrective
 *     prompt, then record an ERROR AssertionResult (passed=false, rationale
 *     prefixed JUDGE_ERROR). A broken judge is never a pass (brief §1.7).
 *  3. Anti-sycophancy: a passing verdict must quote a verbatim span of the
 *     judged output. No verifiable quote → the pass is downgraded to an
 *     error result. Failing verdicts may quote the refuting span but are
 *     not required to.
 */
import { z } from "zod";
import type { Assertion, AssertionResult, EvalCase } from "../models.js";
import type { JudgeModel } from "../providers.js";
import { getCriterion, type Rubric } from "./rubrics.js";

/** What the judge must return — PRD §7's structured-output shape. */
export const JudgeVerdictSchema = z.object({
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  rationale: z.string().min(1),
  evidence_span: z.string(),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

const ERROR_PREFIX = "JUDGE_ERROR";

function errorResult(assertion: Assertion, detail: string): AssertionResult {
  return {
    assertion_id: assertion.id,
    passed: false,
    score: 0,
    rationale: `${ERROR_PREFIX}: ${detail}`,
  };
}

/** Whitespace-insensitive "is this span really in the output" check. */
function spanAppearsIn(span: string, haystack: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const needle = norm(span);
  return needle.length > 0 && norm(haystack).includes(needle);
}

/** Pull the first JSON object out of a model reply (fences, prose, etc.). */
function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("no JSON object found in judge reply");
  }
  return text.slice(start, end + 1);
}

/**
 * Render the rubric's whitelisted case-metadata keys, or nothing at all.
 *
 * Returns an empty array when a rubric declares no keys, so rubrics written
 * before this existed produce a byte-identical prompt and their baselines stay
 * comparable.
 */
function metadataBlock(rubric: Rubric, evalCase: EvalCase): string[] {
  const keys = rubric.include_metadata_keys;
  if (!keys || keys.length === 0) return [];
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in evalCase.metadata) picked[key] = evalCase.metadata[key];
  }
  if (Object.keys(picked).length === 0) return [];
  return [
    `CASE METADATA (ground truth from the dataset, not from the agent):`,
    JSON.stringify(picked, null, 2),
    ``,
  ];
}

export function buildJudgePrompt(args: {
  criterionKey: string;
  rubric: Rubric;
  evalCase: EvalCase;
  outputText: string;
}): string {
  const criterion = getCriterion(args.rubric, args.criterionKey);
  return [
    `You are a strict, independent evaluator for the "${args.rubric.agent}" agent.`,
    `Judge ONE criterion. Do not consider anything else.`,
    ``,
    `CRITERION (${args.criterionKey}): ${criterion.description}`,
    `HOW TO JUDGE: ${criterion.guidance}`,
    ``,
    `CASE INPUT (what the agent was asked to do):`,
    JSON.stringify(args.evalCase.input, null, 2),
    ``,
    ...metadataBlock(args.rubric, args.evalCase),
    `AGENT OUTPUT (the thing you are judging):`,
    args.outputText,
    ``,
    `Reply with ONLY a JSON object, no code fences, no commentary:`,
    `{"score": <0.0-1.0>, "passed": <true|false>, "rationale": "<one paragraph>", "evidence_span": "<verbatim quote from AGENT OUTPUT that supports or refutes the criterion>"}`,
    ``,
    `Rules: evidence_span MUST be copied verbatim from AGENT OUTPUT. A criterion`,
    `cannot pass without a supporting quote. Do not soften a failure because the`,
    `output is well-written; judge only the criterion.`,
  ].join("\n");
}

/** The prompt plus the text the evidence span must be quoted from. */
interface JudgeInputs {
  prompt: string;
  outputText: string;
}

/** Throws on dataset bugs (wrong kind, unknown criterion); never on model failures. */
function prepareJudgeInputs(args: {
  rubric: Rubric;
  assertion: Assertion;
  evalCase: EvalCase;
  output: Record<string, unknown>;
}): JudgeInputs {
  const { rubric, assertion, evalCase, output } = args;
  if (assertion.kind !== "model_graded" || !assertion.criterion) {
    throw new Error(
      `Assertion "${assertion.id}" is not model_graded with a criterion — fix the case in the dataset`,
    );
  }
  const outputText = JSON.stringify(output, null, 2);
  return {
    outputText,
    prompt: buildJudgePrompt({
      criterionKey: assertion.criterion,
      rubric,
      evalCase,
      outputText,
    }),
  };
}

/**
 * One judgment: the model call plus its single corrective retry.
 *
 * Returns a discriminated result rather than an AssertionResult so callers can
 * tell a real verdict from a broken judge structurally, without sniffing the
 * JUDGE_ERROR prefix out of a rationale string.
 */
type Judgment =
  | { ok: true; result: AssertionResult }
  | { ok: false; detail: string };

async function judgeOnce(args: {
  model: JudgeModel;
  assertion: Assertion;
  inputs: JudgeInputs;
}): Promise<Judgment> {
  const { model, assertion, inputs } = args;

  let lastFailure = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptPrompt =
      attempt === 0
        ? inputs.prompt
        : `${inputs.prompt}\n\nYour previous reply was invalid (${lastFailure}). Reply again with ONLY the JSON object described above.`;

    let verdict: JudgeVerdict;
    try {
      const reply = await model.invoke(attemptPrompt);
      verdict = JudgeVerdictSchema.parse(JSON.parse(extractJson(reply)));
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      continue;
    }

    // Anti-sycophancy: a pass without a verifiable quote is not a pass.
    if (verdict.passed && !spanAppearsIn(verdict.evidence_span, inputs.outputText)) {
      lastFailure = "evidence_span was not a verbatim quote from AGENT OUTPUT";
      continue;
    }

    return {
      ok: true,
      result: {
        assertion_id: assertion.id,
        passed: verdict.passed,
        score: verdict.score,
        rationale: verdict.rationale,
      },
    };
  }

  return {
    ok: false,
    detail: `judge (${model.provider}/${model.modelId}) failed twice on "${assertion.criterion}": ${lastFailure}`,
  };
}

/**
 * Judge one model_graded assertion against one case output.
 *
 * Throws only on dataset bugs (wrong assertion kind, unknown criterion) —
 * the runner records those as error results at the case level. Model-side
 * failures never throw; they come back as JUDGE_ERROR results.
 */
export async function judgeAssertion(args: {
  model: JudgeModel;
  rubric: Rubric;
  assertion: Assertion;
  evalCase: EvalCase;
  output: Record<string, unknown>;
}): Promise<AssertionResult> {
  const inputs = prepareJudgeInputs(args);
  const judgment = await judgeOnce({
    model: args.model,
    assertion: args.assertion,
    inputs,
  });
  return judgment.ok
    ? judgment.result
    : errorResult(args.assertion, judgment.detail);
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Judge one assertion `repeats` times and record the MAJORITY verdict plus the
 * agreement behind it.
 *
 * Why this exists: on 2026-08-12 the same criterion re-judged three times on
 * unchanged inputs moved 15 points (free judge) and 10 points (claude-opus-5).
 * A published finding of that size cannot rest on one judgment from either
 * judge, so the harness votes and publishes how close the vote was.
 *
 * Rules, in order:
 *  1. `repeats === 1` delegates to judgeAssertion and adds NOTHING to the
 *     result. The default path stays byte-identical to every frozen baseline.
 *  2. A judgment that failed is excluded from the vote, never counted as a
 *     fail vote, and counted in `judgments_errored`.
 *  3. Fewer successful judgments than a majority (floor(n/2) + 1) makes the
 *     assertion ERRORED, not failed. The harness has always kept those apart.
 *  4. A tie (only reachable with an even `repeats`) records a FAILURE and sets
 *     `judgment_tied`. A judge split down the middle is not evidence of a pass.
 */
export async function judgeAssertionRepeated(args: {
  model: JudgeModel;
  rubric: Rubric;
  assertion: Assertion;
  evalCase: EvalCase;
  output: Record<string, unknown>;
  repeats: number;
}): Promise<AssertionResult> {
  const { model, assertion, repeats } = args;
  if (!Number.isInteger(repeats) || repeats < 1) {
    throw new Error(`JUDGE_REPEATS must be a positive integer, got ${repeats}`);
  }
  if (repeats === 1) return judgeAssertion(args);

  const inputs = prepareJudgeInputs(args);
  const votes: AssertionResult[] = [];
  let errored = 0;
  let lastFailure = "";
  for (let i = 0; i < repeats; i++) {
    const judgment = await judgeOnce({ model, assertion, inputs });
    if (judgment.ok) {
      votes.push(judgment.result);
    } else {
      errored += 1;
      lastFailure = judgment.detail;
    }
  }

  const majority = Math.floor(repeats / 2) + 1;
  if (votes.length < majority) {
    return {
      ...errorResult(
        assertion,
        `only ${votes.length} of ${repeats} judgments succeeded, short of the ${majority} needed for a majority; last failure: ${lastFailure}`,
      ),
      judgments: repeats,
      judgments_agreeing: 0,
      judgments_errored: errored,
    };
  }

  const passVotes = votes.filter((v) => v.passed);
  const failVotes = votes.filter((v) => !v.passed);
  const tied = passVotes.length === failVotes.length;
  // On a tie the failing side wins: a split judge is not evidence of a pass.
  const winners = passVotes.length > failVotes.length ? passVotes : failVotes;
  const note = tied
    ? `[tie ${passVotes.length}-${failVotes.length} of ${repeats} judgments, recorded as a failure]`
    : `[majority ${winners.length} of ${repeats} judgments${errored > 0 ? `, ${errored} errored` : ""}]`;

  return {
    assertion_id: assertion.id,
    passed: passVotes.length > failVotes.length,
    score: mean(winners.map((v) => v.score)),
    rationale: `${note} ${winners[0]?.rationale ?? ""}`.trim(),
    judgments: repeats,
    judgments_agreeing: winners.length,
    judgments_errored: errored,
    ...(tied ? { judgment_tied: true } : {}),
  };
}
