import { describe, expect, it } from "vitest";
import {
  AssertionResultSchema,
  AssertionSchema,
  CaseResultSchema,
  EvalCaseSchema,
  RunSummarySchema,
} from "../src/models.js";

const assertion = {
  id: "fr.citations_present",
  kind: "deterministic" as const,
  description: "≥1 citation, each resolving to a real fixture id",
  check: "citation_present",
  params: { min: 1 },
  criterion: null,
  weight: 1.0,
};

const evalCase = {
  id: "fr-easy-001",
  agent: "field_reporter" as const,
  input: { capture: "raw location notes", locale: "en" },
  metadata: { targets: ["fr.citations_present"] },
  assertions: [assertion],
};

const assertionResult = {
  assertion_id: "fr.citations_present",
  passed: true,
  score: 1.0,
  rationale: null,
};

const caseResult = {
  case_id: "fr-easy-001",
  agent: "field_reporter",
  provider: "claude" as const,
  run_id: "run-2026-07-31-0001",
  output: { title: "t", body: "b", sources: ["fx-1"] },
  trace_ref: "https://smith.langchain.com/r/abc",
  assertion_results: [assertionResult],
  tool_calls: 4,
  revisions: 2,
  latency_ms: 8_200,
  passed: true,
  timestamp: new Date("2026-07-31T12:00:00.000Z"),
};

const runSummary = {
  run_id: "run-2026-07-31-0001",
  agent: "field_reporter",
  provider: "claude",
  started_at: new Date("2026-07-31T12:00:00.000Z"),
  finished_at: new Date("2026-07-31T12:20:00.000Z"),
  n_cases: 20,
  pass_rate: 0.85,
  per_assertion_pass_rate: { "fr.citations_present": 0.95 },
  baseline_run_id: null,
  regressions: [],
};

// The brief's test_models_roundtrip: parse → JSON → parse must be lossless for
// every model, because JSONL on disk is the harness's storage format.
describe("models round-trip through JSON", () => {
  const cases = [
    ["Assertion", AssertionSchema, assertion],
    ["EvalCase", EvalCaseSchema, evalCase],
    ["AssertionResult", AssertionResultSchema, assertionResult],
    ["CaseResult", CaseResultSchema, caseResult],
    ["RunSummary", RunSummarySchema, runSummary],
  ] as const;

  it.each(cases)("%s", (_name, schema, value) => {
    const parsed = schema.parse(value);
    const revived = schema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(revived).toEqual(parsed);
  });
});

describe("defaults", () => {
  it("Assertion defaults params/check/criterion/weight", () => {
    const minimal = AssertionSchema.parse({
      id: "a",
      kind: "model_graded",
      description: "d",
      criterion: "grounded",
    });
    expect(minimal.params).toEqual({});
    expect(minimal.check).toBeNull();
    expect(minimal.weight).toBe(1.0);
  });

  it("EvalCase defaults metadata; RunSummary defaults regressions", () => {
    const { metadata, ...noMetadata } = evalCase;
    expect(EvalCaseSchema.parse(noMetadata).metadata).toEqual({});
    const { regressions, ...noRegressions } = runSummary;
    expect(RunSummarySchema.parse(noRegressions).regressions).toEqual([]);
  });
});

describe("rejections", () => {
  it("rejects an unknown assertion kind", () => {
    expect(() => AssertionSchema.parse({ ...assertion, kind: "vibes" })).toThrow();
  });

  it("rejects an unknown agent", () => {
    expect(() => EvalCaseSchema.parse({ ...evalCase, agent: "mystery_agent" })).toThrow();
  });

  it("rejects out-of-range scores and rates", () => {
    expect(() => AssertionResultSchema.parse({ ...assertionResult, score: 1.5 })).toThrow();
    expect(() => RunSummarySchema.parse({ ...runSummary, pass_rate: -0.1 })).toThrow();
  });

  it("rejects an unparseable timestamp", () => {
    expect(() => CaseResultSchema.parse({ ...caseResult, timestamp: "not-a-date" })).toThrow();
  });
});
