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
 */
export const AssertionResultSchema = z.object({
  assertion_id: z.string(),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  rationale: z.string().nullable().default(null), // required for model_graded; enforced by the judge, not the schema
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
  pass_rate: z.number().min(0).max(1),
  per_assertion_pass_rate: z.record(z.string(), z.number().min(0).max(1)),
  baseline_run_id: z.string().nullable().default(null),
  regressions: z.array(z.string()).default([]), // assertion ids newly failing vs baseline
});
export type RunSummary = z.infer<typeof RunSummarySchema>;
