/**
 * The seven deterministic checks (PRD §8), each a pure function:
 * same output/case/telemetry in, same verdict out — no I/O, no clock, no env.
 *
 * Error philosophy (brief §1.7): a missing *required param or metadata* is a
 * dataset-authoring bug and THROWS (the runner records it as an error result,
 * never a pass). Missing *telemetry or output fields* FAIL the assertion with
 * a rationale — that's a finding about the agent/adapter, which is the point.
 */
import type { Assertion, AssertionResult } from "../models.js";
import { registerCheck, type DeterministicCheck } from "../registry.js";

function result(assertion: Assertion, passed: boolean, rationale: string): AssertionResult {
  return { assertion_id: assertion.id, passed, score: passed ? 1 : 0, rationale };
}

/** Read a param that a case MUST provide; absence is a dataset bug, so throw. */
function requireParam<T>(assertion: Assertion, key: string, guard: (v: unknown) => v is T): T {
  const value = assertion.params[key];
  if (!guard(value)) {
    throw new Error(
      `Check for assertion "${assertion.id}" needs params.${key} — fix the case in the dataset`,
    );
  }
  return value;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * `citation_present` — ≥ params.min (default 1) citations in
 * output[params.field ?? "sources"], and when the case pins its fixtures
 * (metadata.fixture_ids), every citation must resolve to one of them.
 */
export const citationPresent: DeterministicCheck = (output, evalCase, _telemetry, assertion) => {
  const field = typeof assertion.params["field"] === "string" ? assertion.params["field"] : "sources";
  const min = isNumber(assertion.params["min"]) ? assertion.params["min"] : 1;

  const citations = output[field];
  if (!isStringArray(citations)) {
    return result(assertion, false, `output.${field} is missing or not a string array`);
  }
  if (citations.length < min) {
    return result(assertion, false, `found ${citations.length} citation(s), need ≥${min}`);
  }
  const fixtureIds = evalCase.metadata["fixture_ids"];
  if (isStringArray(fixtureIds)) {
    const unknown = citations.filter((c) => !fixtureIds.includes(c));
    if (unknown.length > 0) {
      return result(
        assertion,
        false,
        `citation(s) not resolving to a source-material fixture: ${unknown.join(", ")}`,
      );
    }
  }
  return result(assertion, true, `${citations.length} citation(s), all resolve`);
};

/** `within_budget` — telemetry.tool_calls ≤ params.max_tool_calls (required). */
export const withinBudget: DeterministicCheck = (_output, _evalCase, telemetry, assertion) => {
  const max = requireParam(assertion, "max_tool_calls", isNumber);
  const passed = telemetry.tool_calls <= max;
  return result(assertion, passed, `tool_calls=${telemetry.tool_calls}, budget=${max}`);
};

/**
 * `revisions_ok` — telemetry.revisions ≤ params.max_revisions.
 * Default 3 is a fallback mirroring the field-reporter's MAX_REVISIONS; the
 * authoritative value lives in that agent's repo — cases should set the param
 * explicitly rather than lean on this default.
 */
export const revisionsOk: DeterministicCheck = (_output, _evalCase, telemetry, assertion) => {
  const max = isNumber(assertion.params["max_revisions"]) ? assertion.params["max_revisions"] : 3;
  if (telemetry.revisions === undefined) {
    return result(assertion, false, "adapter reported no revision count");
  }
  const passed = telemetry.revisions <= max;
  return result(assertion, passed, `revisions=${telemetry.revisions}, max=${max}`);
};

/** `valid_schema` — every key in params.required (required) exists and is non-empty. */
export const validSchema: DeterministicCheck = (output, _evalCase, _telemetry, assertion) => {
  const required = requireParam(assertion, "required", isStringArray);
  const missing = required.filter((key) => {
    const value = output[key];
    if (value === undefined || value === null) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    return false;
  });
  if (missing.length > 0) {
    return result(assertion, false, `missing/empty required field(s): ${missing.join(", ")}`);
  }
  return result(assertion, true, `all required fields present: ${required.join(", ")}`);
};

/** `routing_correct` — invoked specialists ⊇ metadata.expected_routes (required). */
export const routingCorrect: DeterministicCheck = (_output, evalCase, telemetry, assertion) => {
  const expected = evalCase.metadata["expected_routes"];
  if (!isStringArray(expected)) {
    throw new Error(
      `Check for assertion "${assertion.id}" needs metadata.expected_routes — fix the case in the dataset`,
    );
  }
  const invoked = telemetry.invoked_specialists;
  if (invoked === undefined) {
    return result(assertion, false, "adapter reported no invoked_specialists");
  }
  const missed = expected.filter((s) => !invoked.includes(s));
  if (missed.length > 0) {
    return result(
      assertion,
      false,
      `expected route(s) not invoked: ${missed.join(", ")} (invoked: ${invoked.join(", ") || "none"})`,
    );
  }
  return result(assertion, true, `all expected routes invoked: ${expected.join(", ")}`);
};

interface ScopedCitation {
  specialist: string;
  source_id: string;
}

const isScopedCitations = (v: unknown): v is ScopedCitation[] =>
  Array.isArray(v) &&
  v.every(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      typeof (c as ScopedCitation).specialist === "string" &&
      typeof (c as ScopedCitation).source_id === "string",
  );

/**
 * `citations_scoped` — every cited source belongs to the citing specialist's
 * own retrieval namespace (PRD "citation contamination").
 *
 * Contract for Milestone 4 adapters: normalize the coach's output so
 * `output.citations` is `[{specialist, source_id}]`, and each case's
 * `metadata.namespaces` maps specialist → its valid source ids.
 */
export const citationsScoped: DeterministicCheck = (output, evalCase, _telemetry, assertion) => {
  const namespaces = evalCase.metadata["namespaces"];
  if (typeof namespaces !== "object" || namespaces === null || Array.isArray(namespaces)) {
    throw new Error(
      `Check for assertion "${assertion.id}" needs metadata.namespaces — fix the case in the dataset`,
    );
  }
  const citations = output["citations"];
  if (!isScopedCitations(citations)) {
    return result(assertion, false, "output.citations missing or not [{specialist, source_id}]");
  }
  const leaks = citations.filter((c) => {
    const scope = (namespaces as Record<string, unknown>)[c.specialist];
    return !isStringArray(scope) || !scope.includes(c.source_id);
  });
  if (leaks.length > 0) {
    const detail = leaks.map((c) => `${c.specialist}→${c.source_id}`).join(", ");
    return result(assertion, false, `citation(s) outside the specialist's namespace: ${detail}`);
  }
  return result(assertion, true, `${citations.length} citation(s), all within namespace`);
};

/**
 * `no_pii` — regex sweep for emails, phone numbers, and SSN shapes over the
 * output (whole JSON by default, or just params.fields). Datasets are
 * fixtures-only (PRD §8.3), so ANY hit is a leak. Rationale redacts matches:
 * a PII check that reprints PII into results JSONL would itself be the leak.
 */
const PII_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { label: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { label: "phone", pattern: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/ },
];

export const noPii: DeterministicCheck = (output, _evalCase, _telemetry, assertion) => {
  const fields = assertion.params["fields"];
  const haystacks: string[] = isStringArray(fields)
    ? fields.map((f) => JSON.stringify(output[f] ?? ""))
    : [JSON.stringify(output)];

  const hits = PII_PATTERNS.filter(({ pattern }) => haystacks.some((h) => pattern.test(h)));
  if (hits.length > 0) {
    return result(assertion, false, `PII pattern(s) detected: ${hits.map((h) => h.label).join(", ")} (values redacted)`);
  }
  return result(assertion, true, "no PII patterns detected");
};

/**
 * Explicit registration (not an import side effect) so tests control registry
 * state and the runner wires checks exactly once at startup.
 */
export function registerDeterministicChecks(): void {
  registerCheck("citation_present", citationPresent);
  registerCheck("within_budget", withinBudget);
  registerCheck("revisions_ok", revisionsOk);
  registerCheck("valid_schema", validSchema);
  registerCheck("routing_correct", routingCorrect);
  registerCheck("citations_scoped", citationsScoped);
  registerCheck("no_pii", noPii);
}
