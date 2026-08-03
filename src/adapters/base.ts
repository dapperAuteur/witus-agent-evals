/**
 * The adapter contract every agent under test plugs in through (PRD §5.1).
 *
 * Concrete adapters (field_reporter, coach_multiagent) land in Milestone 4;
 * the types live here now because the registry is typed against them. Adding a
 * third agent later = implement this interface + a dataset pack + a rubric
 * pack, with no core changes.
 */
import type { EvalCase } from "../models.js";

export type Provider = "claude" | "gemini";

/**
 * Run telemetry the checks need beyond the output itself. Optional fields are
 * per-agent: `revisions`/`rev0_draft` only mean something for the
 * field-reporter's refine loop; `invoked_specialists` only for the coach's
 * supervisor routing.
 */
export interface Telemetry {
  tool_calls: number;
  latency_ms: number;
  revisions?: number;
  rev0_draft?: Record<string, unknown>;
  invoked_specialists?: string[];
}

/** What every adapter returns: the agent's output plus how it got there. */
export interface AdapterOutput {
  output: Record<string, unknown>;
  trace_ref: string | null;
  telemetry: Telemetry;
}

/** How the harness invokes a real agent graph for one case. */
export interface AgentAdapter {
  /** Registry key; must match `EvalCase.agent`. */
  readonly name: string;
  run(input: EvalCase["input"], provider: Provider): Promise<AdapterOutput>;
}
