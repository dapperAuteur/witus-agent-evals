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
  const { model, rubric, assertion, evalCase, output } = args;
  if (assertion.kind !== "model_graded" || !assertion.criterion) {
    throw new Error(
      `Assertion "${assertion.id}" is not model_graded with a criterion — fix the case in the dataset`,
    );
  }

  const outputText = JSON.stringify(output, null, 2);
  const prompt = buildJudgePrompt({
    criterionKey: assertion.criterion,
    rubric,
    evalCase,
    outputText,
  });

  let lastFailure = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptPrompt =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous reply was invalid (${lastFailure}). Reply again with ONLY the JSON object described above.`;

    let verdict: JudgeVerdict;
    try {
      const reply = await model.invoke(attemptPrompt);
      verdict = JudgeVerdictSchema.parse(JSON.parse(extractJson(reply)));
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      continue;
    }

    // Anti-sycophancy: a pass without a verifiable quote is not a pass.
    if (verdict.passed && !spanAppearsIn(verdict.evidence_span, outputText)) {
      lastFailure = "evidence_span was not a verbatim quote from AGENT OUTPUT";
      continue;
    }

    return {
      assertion_id: assertion.id,
      passed: verdict.passed,
      score: verdict.score,
      rationale: verdict.rationale,
    };
  }

  return errorResult(
    assertion,
    `judge (${model.provider}/${model.modelId}) failed twice on "${assertion.criterion}": ${lastFailure}`,
  );
}
