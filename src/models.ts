/**
 * Core data models for the eval harness (PRD §6, transposed pydantic → zod).
 *
 * Why zod: runtime validation at every JSONL boundary (datasets in, results out)
 * with static types inferred from the same source of truth, mirroring what
 * pydantic gave the original Python spec. Field names stay snake_case so the
 * JSONL artifacts match the PRD and stay language-neutral.
 */
import { z } from "zod";

/** JSON-serializable payload whose shape is agent-specific (PRD's `dict[str, Any]`). */
const JsonRecord = z.record(z.string(), z.unknown());

/**
 * One checkable property a case output must satisfy.
 *
 * `kind` decides which half of the harness evaluates it: "deterministic" runs a
 * registered pure-function check; "model_graded" sends a rubric criterion to the
 * LLM judge. The unused half's fields stay null/empty rather than being split
 * into two types, so cases.jsonl rows stay flat and diffable.
 */
export const AssertionSchema = z.object({
  id: z.string(),
  kind: z.enum(["deterministic", "model_graded"]),
  description: z.string(),
  // deterministic only:
  check: z.string().nullable().default(null),
  params: JsonRecord.default({}),
  // model_graded only:
  criterion: z.string().nullable().default(null),
  weight: z.number().default(1.0),
});
export type Assertion = z.infer<typeof AssertionSchema>;

/** A single test case: an input plus the properties its output must have. */
export const EvalCaseSchema = z.object({
  id: z.string(),
  // Adapter registry key. "coach_v2_arch" is the architecture A/B arm that
  // reproduces the v2 coach shape (one call, no retrieval); it is an adapter,
  // not a shipped product. See datasets/coach_arch_ab/README.md.
  agent: z.enum(["field_reporter", "coach_multiagent", "coach_v2_arch"]),
  input: JsonRecord,
  metadata: JsonRecord.default({}),
  assertions: z.array(AssertionSchema),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

/**
 * Outcome of one assertion against one case output.
 *
 * A failed judge call is recorded as `passed: false` with an error rationale by
 * the caller — never omitted — so a broken judge can't masquerade as a pass.
 *
 * The `judgments*` fields are written only when JUDGE_REPEATS > 1. They are
 * optional with NO default, so a single-judgment result serializes to exactly
 * the four fields it always has and every frozen baseline stays comparable.
 */
export const AssertionResultSchema = z.object({
  assertion_id: z.string(),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  rationale: z.string().nullable().default(null), // required for model_graded; enforced by the judge, not the schema
  /** How many judgments were attempted for this assertion (JUDGE_REPEATS). */
  judgments: z.number().int().positive().optional(),
  /**
   * How many judgments voted the verdict recorded above. Agreement for this
   * assertion is `judgments_agreeing / judgments`; publish that rate next to
   * the pass rate, never the pass rate alone.
   */
  judgments_agreeing: z.number().int().nonnegative().optional(),
  /**
   * Individual judgments that failed (bad JSON, model error, unverifiable
   * evidence span). They are excluded from the vote rather than counted as
   * fail votes; a broken judge is not a failing agent.
   */
  judgments_errored: z.number().int().nonnegative().optional(),
  /** Set when an even repeat count split evenly. A tie is recorded as a failure. */
  judgment_tied: z.boolean().optional(),
});
export type AssertionResult = z.infer<typeof AssertionResultSchema>;

/** Everything recorded about running one case against one provider. */
export const CaseResultSchema = z.object({
  case_id: z.string(),
  agent: z.string(),
  provider: z.enum(["claude", "gemini"]),
  run_id: z.string(),
  output: JsonRecord,
  trace_ref: z.string().nullable().default(null), // LangSmith url/id
  assertion_results: z.array(AssertionResultSchema),
  tool_calls: z.number().int().nonnegative(),
  revisions: z.number().int().nonnegative().nullable().default(null), // field_reporter only
  latency_ms: z.number().int().nonnegative(),
  passed: z.boolean(), // weighted threshold across assertions (runner computes)
  timestamp: z.coerce.date(), // ISO string in JSONL, Date in memory
});
export type CaseResult = z.infer<typeof CaseResultSchema>;

/** Aggregate of one run; `regressions` is filled only when a baseline was given. */
export const RunSummarySchema = z.object({
  run_id: z.string(),
  agent: z.string(),
  provider: z.string(), // "claude" | "gemini" | "all" at the summary level
  started_at: z.coerce.date(),
  finished_at: z.coerce.date(),
  n_cases: z.number().int().nonnegative(),
  /**
   * Fraction of ALL cases that passed. Unchanged on purpose: frozen baselines
   * were scored this way and changing the denominator would silently re-score
   * every historical comparison.
   *
   * It counts an errored case as a failure, which is why `errored_cases` below
   * exists and why the report refuses to be read quietly when it is non-zero.
   * A network drop mid-run produced a confident "0.0% pass rate" from a run in
   * which 20 of 21 cases never reached the model at all.
   */
  pass_rate: z.number().min(0).max(1),
  /** Cases whose agent or judge call failed. Not evidence about the agent. */
  errored_cases: z.number().int().nonnegative().default(0),
  /**
   * Pass rate over cases that actually ran. Null when every case errored, since
   * a rate over zero cases is not zero, it is unknown.
   */
  pass_rate_excluding_errors: z.number().min(0).max(1).nullable().default(null),
  /**
   * JUDGE_REPEATS for this run. Written only when it was above 1, so a
   * default run's summary.json is byte-identical to the ones already frozen.
   */
  judge_repeats: z.number().int().positive().optional(),
  /**
   * Agreeing judgments over total judgments, across every model_graded
   * assertion in the run. Null when the run had no model_graded assertions.
   *
   * Floor, not zero: with 3 repeats a majority is at least 2 of 3, so the
   * lowest a clean run can score is 66.7 percent. Anything near that floor
   * means the judge disagreed with itself, and the pass rate is a coin flip
   * rather than a measurement, which is why the report refuses to be read
   * quietly below `LOW_JUDGE_AGREEMENT`.
   */
  judge_agreement_rate: z.number().min(0).max(1).nullable().optional(),
  per_assertion_pass_rate: z.record(z.string(), z.number().min(0).max(1)),
  baseline_run_id: z.string().nullable().default(null),
  regressions: z.array(z.string()).default([]), // assertion ids newly failing vs baseline
});
export type RunSummary = z.infer<typeof RunSummarySchema>;
