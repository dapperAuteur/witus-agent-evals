/**
 * The eval runner — orchestrates PRD §5.3 for one agent × one provider:
 *
 *   load cases → (cached?) adapter run → deterministic checks → judge →
 *   CaseResult per case → RunSummary (+ baseline regressions) → persist →
 *   inbox alert.
 *
 * Failure philosophy (brief §1.7): one bad case never kills a run. An
 * adapter crash records an error CaseResult; a thrown deterministic check
 * (dataset bug) records an error AssertionResult; the judge already returns
 * JUDGE_ERROR results instead of throwing. Everything is visible in the
 * artifacts, nothing is silently a pass.
 */
import type { AdapterOutput, AgentAdapter, Provider } from "./adapters/base.js";
import { judgeAssertion, judgeAssertionRepeated } from "./judge/llm_judge.js";
import { loadRubric, type Rubric, type RubricAgent } from "./judge/rubrics.js";
import type {
  Assertion,
  AssertionResult,
  CaseResult,
  EvalCase,
  RunSummary,
} from "./models.js";
import { createJudgeModel, type JudgeModel } from "./providers.js";
import { getAdapter, getCheck } from "./registry.js";
import { regressionsAgainstBaseline } from "./regression.js";
import { sendRegressionAlert } from "./inbox/alert.js";
import type { Settings } from "./settings.js";
import { DEFAULT_RUNS_DIR, cacheGet, cachePut, saveRun } from "./storage.js";

export interface RunOptions {
  agent: RubricAgent;
  provider: Provider;
  cases: EvalCase[];
  settings: Settings;
  /** Compare against this prior run and populate regressions. */
  baselineRunId?: string;
  /** Smoke-run cap (PRD §11 --limit). */
  limit?: number;
  runsDir?: string;
  /**
   * A case passes when its weighted pass-fraction ≥ this. Default 1.0 —
   * every assertion must pass; weights <1 only soften when lowered.
   */
  passThreshold?: number;
  /**
   * Judgments per model_graded assertion; the verdict is the majority.
   * Defaults to settings.JUDGE_REPEATS, which itself defaults to 1.
   */
  judgeRepeats?: number;
  /* Injectables — tests swap these; production uses the defaults. */
  adapter?: AgentAdapter;
  judgeModel?: JudgeModel;
  rubric?: Rubric;
  now?: () => Date;
  notify?: typeof sendRegressionAlert;
}

export interface RunOutcome {
  runId: string;
  runDir: string;
  summary: RunSummary;
  results: CaseResult[];
  erroredCases: number;
  alert: Awaited<ReturnType<typeof sendRegressionAlert>>;
}

function makeRunId(agent: string, provider: string, at: Date): string {
  const stamp = at.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  return `${stamp}-${agent}-${provider}`;
}

function errorAssertion(assertion: Assertion, detail: string): AssertionResult {
  return {
    assertion_id: assertion.id,
    passed: false,
    score: 0,
    rationale: `RUNNER_ERROR: ${detail}`,
  };
}

/** Weighted pass-fraction over the case's assertions. */
export function weightedPassFraction(
  assertions: Assertion[],
  results: AssertionResult[],
): number {
  const byId = new Map(results.map((r) => [r.assertion_id, r]));
  let total = 0;
  let passed = 0;
  for (const assertion of assertions) {
    total += assertion.weight;
    if (byId.get(assertion.id)?.passed) passed += assertion.weight;
  }
  return total === 0 ? 1 : passed / total;
}

async function evaluateCase(args: {
  evalCase: EvalCase;
  provider: Provider;
  runId: string;
  adapterOutput: AdapterOutput;
  judgeModel: JudgeModel;
  rubric: Rubric;
  passThreshold: number;
  judgeRepeats: number;
  timestamp: Date;
}): Promise<CaseResult> {
  const { evalCase, adapterOutput } = args;
  const assertionResults: AssertionResult[] = [];

  for (const assertion of evalCase.assertions) {
    if (assertion.kind === "deterministic") {
      try {
        if (!assertion.check) {
          throw new Error(`assertion "${assertion.id}" names no check fn`);
        }
        assertionResults.push(
          getCheck(assertion.check)(
            adapterOutput.output,
            evalCase,
            adapterOutput.telemetry,
            assertion,
          ),
        );
      } catch (error) {
        assertionResults.push(
          errorAssertion(assertion, error instanceof Error ? error.message : String(error)),
        );
      }
    } else {
      // judgeAssertion returns JUDGE_ERROR results for model failures and
      // throws only on dataset bugs — map those to error results too.
      // The repeats > 1 branch is spelled out rather than folded into one call
      // so the default path is visibly the same code it has always been.
      try {
        assertionResults.push(
          args.judgeRepeats > 1
            ? await judgeAssertionRepeated({
                model: args.judgeModel,
                rubric: args.rubric,
                assertion,
                evalCase,
                output: adapterOutput.output,
                repeats: args.judgeRepeats,
              })
            : await judgeAssertion({
                model: args.judgeModel,
                rubric: args.rubric,
                assertion,
                evalCase,
                output: adapterOutput.output,
              }),
        );
      } catch (error) {
        assertionResults.push(
          errorAssertion(assertion, error instanceof Error ? error.message : String(error)),
        );
      }
    }
  }

  return {
    case_id: evalCase.id,
    agent: evalCase.agent,
    provider: args.provider,
    run_id: args.runId,
    output: adapterOutput.output,
    trace_ref: adapterOutput.trace_ref,
    assertion_results: assertionResults,
    tool_calls: adapterOutput.telemetry.tool_calls,
    revisions: adapterOutput.telemetry.revisions ?? null,
    latency_ms: adapterOutput.telemetry.latency_ms,
    passed:
      weightedPassFraction(evalCase.assertions, assertionResults) >=
      args.passThreshold,
    timestamp: args.timestamp,
  };
}

/** The whole-case error result for an adapter crash. */
function errorCaseResult(args: {
  evalCase: EvalCase;
  provider: Provider;
  runId: string;
  detail: string;
  timestamp: Date;
}): CaseResult {
  return {
    case_id: args.evalCase.id,
    agent: args.evalCase.agent,
    provider: args.provider,
    run_id: args.runId,
    output: { error: args.detail },
    trace_ref: null,
    assertion_results: args.evalCase.assertions.map((assertion) =>
      errorAssertion(assertion, `agent run failed: ${args.detail}`),
    ),
    tool_calls: 0,
    revisions: null,
    latency_ms: 0,
    passed: false,
    timestamp: args.timestamp,
  };
}

export async function runEval(options: RunOptions): Promise<RunOutcome> {
  const now = options.now ?? (() => new Date());
  const runsDir = options.runsDir ?? DEFAULT_RUNS_DIR;
  const passThreshold = options.passThreshold ?? 1.0;
  const judgeRepeats = options.judgeRepeats ?? options.settings.JUDGE_REPEATS;
  const startedAt = now();
  const runId = makeRunId(options.agent, options.provider, startedAt);
  const adapter = options.adapter ?? getAdapter(options.agent);
  const judgeModel =
    options.judgeModel ?? createJudgeModel(options.settings, options.provider);
  const rubric = options.rubric ?? loadRubric(options.agent);
  const notify = options.notify ?? sendRegressionAlert;

  const cases =
    options.limit !== undefined ? options.cases.slice(0, options.limit) : options.cases;

  const results: CaseResult[] = [];
  let erroredCases = 0;

  for (const evalCase of cases) {
    let adapterOutput = cacheGet(
      runsDir,
      options.agent,
      evalCase.id,
      options.provider,
      evalCase.input,
    );
    if (!adapterOutput) {
      try {
        adapterOutput = await adapter.run(evalCase.input, options.provider);
        cachePut(
          runsDir,
          options.agent,
          evalCase.id,
          options.provider,
          evalCase.input,
          adapterOutput,
        );
      } catch (error) {
        erroredCases += 1;
        results.push(
          errorCaseResult({
            evalCase,
            provider: options.provider,
            runId,
            detail: error instanceof Error ? error.message : String(error),
            timestamp: now(),
          }),
        );
        continue;
      }
    }
    results.push(
      await evaluateCase({
        evalCase,
        provider: options.provider,
        runId,
        adapterOutput,
        judgeModel,
        rubric,
        passThreshold,
        judgeRepeats,
        timestamp: now(),
      }),
    );
  }

  // Per-assertion pass rates across cases that carry the assertion.
  const perAssertion: Record<string, { passed: number; total: number }> = {};
  for (const result of results) {
    for (const assertionResult of result.assertion_results) {
      const bucket = (perAssertion[assertionResult.assertion_id] ??= {
        passed: 0,
        total: 0,
      });
      bucket.total += 1;
      if (assertionResult.passed) bucket.passed += 1;
    }
  }
  const perAssertionRates = Object.fromEntries(
    Object.entries(perAssertion).map(([id, { passed, total }]) => [
      id,
      total === 0 ? 0 : passed / total,
    ]),
  );

  // Judge agreement across every repeated judgment in the run. Only assertions
  // that actually carry the bookkeeping count, so deterministic checks never
  // dilute the figure.
  let totalJudgments = 0;
  let agreeingJudgments = 0;
  for (const result of results) {
    for (const assertionResult of result.assertion_results) {
      if (assertionResult.judgments === undefined) continue;
      totalJudgments += assertionResult.judgments;
      agreeingJudgments += assertionResult.judgments_agreeing ?? 0;
    }
  }
  const judgeAgreementRate =
    totalJudgments === 0 ? null : agreeingJudgments / totalJudgments;

  const regressions = options.baselineRunId
    ? regressionsAgainstBaseline(runsDir, options.baselineRunId, perAssertionRates)
        .regressions
    : [];

  const summary: RunSummary = {
    run_id: runId,
    agent: options.agent,
    provider: options.provider,
    started_at: startedAt,
    finished_at: now(),
    n_cases: results.length,
    pass_rate:
      results.length === 0
        ? 0
        : results.filter((r) => r.passed).length / results.length,
    errored_cases: erroredCases,
    pass_rate_excluding_errors:
      results.length - erroredCases === 0
        ? null
        : results.filter((r) => r.passed).length /
          (results.length - erroredCases),
    // Absent at the default of 1, so a single-judgment summary.json keeps the
    // exact key set the frozen baselines have.
    ...(judgeRepeats > 1
      ? {
          judge_repeats: judgeRepeats,
          judge_agreement_rate: judgeAgreementRate,
        }
      : {}),
    per_assertion_pass_rate: perAssertionRates,
    baseline_run_id: options.baselineRunId ?? null,
    regressions,
  };

  const { runDir } = saveRun(runsDir, runId, results, summary);
  const alert = await notify(options.settings, { summary, erroredCases, runDir });

  return { runId, runDir, summary, results, erroredCases, alert };
}
