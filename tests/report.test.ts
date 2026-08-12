import { describe, expect, it } from "vitest";
import type { CaseResult, RunSummary } from "../src/models.js";
import { makeComparison, makeReport } from "../src/report.js";

function summary(overrides: Partial<RunSummary>): RunSummary {
  return {
    run_id: "r-claude",
    agent: "field_reporter",
    provider: "claude",
    started_at: new Date("2026-07-31T12:00:00Z"),
    finished_at: new Date("2026-07-31T12:20:00Z"),
    n_cases: 2,
    pass_rate: 0.5,
    errored_cases: 0,
    pass_rate_excluding_errors: null,
    per_assertion_pass_rate: { "fr.grounded": 0.5, "fr.citations_present": 1 },
    baseline_run_id: null,
    regressions: [],
    ...overrides,
  };
}

function result(overrides: Partial<CaseResult>): CaseResult {
  return {
    case_id: "fr-easy-001",
    agent: "field_reporter",
    provider: "claude",
    run_id: "r-claude",
    output: {},
    trace_ref: null,
    assertion_results: [
      { assertion_id: "fr.grounded", passed: true, score: 1, rationale: "ok" },
    ],
    tool_calls: 3,
    revisions: 1,
    latency_ms: 12000,
    passed: true,
    timestamp: new Date("2026-07-31T12:01:00Z"),
    ...overrides,
  };
}

const failing = result({
  case_id: "fr-adv-004",
  passed: false,
  trace_ref: "langsmith:evals#run-1",
  assertion_results: [
    {
      assertion_id: "fr.grounded",
      passed: false,
      score: 0.2,
      rationale: "The draft corrects the guide's claims from world knowledge, so it is not grounded in the source material.",
    },
  ],
});

describe("makeReport", () => {
  const report = makeReport(summary({}), [result({}), failing]);

  it("includes the run header, pass rate, and per-assertion table", () => {
    expect(report).toContain("# Eval report — r-claude");
    expect(report).toContain("**50.0%**");
    expect(report).toContain("| `fr.grounded` | 50.0% |");
  });

  it("lists each case with verdict and telemetry", () => {
    expect(report).toContain("| `fr-easy-001` | ✅ pass |");
    expect(report).toContain("| `fr-adv-004` | ❌ fail |");
    expect(report).toContain("12.0s");
  });

  it("details failures with rationale and trace ref", () => {
    expect(report).toContain("## Failure detail");
    expect(report).toContain("langsmith:evals#run-1");
    expect(report).toContain("not grounded in the source material");
  });

  it("shows regressions when a baseline was used", () => {
    const withRegressions = makeReport(
      summary({ baseline_run_id: "r-base", regressions: ["fr.grounded"] }),
      [failing],
    );
    expect(withRegressions).toContain("## Regressions vs r-base");
    expect(withRegressions).toContain("- `fr.grounded`");
  });
});

describe("makeComparison", () => {
  const claude = {
    summary: summary({}),
    results: [result({}), failing],
  };
  const gemini = {
    summary: summary({
      run_id: "r-gemini",
      provider: "gemini",
      pass_rate: 1,
      errored_cases: 0,
      pass_rate_excluding_errors: null,
      per_assertion_pass_rate: { "fr.grounded": 1, "fr.citations_present": 1 },
    }),
    results: [
      result({ provider: "gemini", run_id: "r-gemini", latency_ms: 30000 }),
      result({
        case_id: "fr-adv-004",
        provider: "gemini",
        run_id: "r-gemini",
        passed: true,
      }),
    ],
  };
  const comparison = makeComparison(claude, gemini);

  it("compares pass rates and per-assertion deltas", () => {
    expect(comparison).toContain("# Provider comparison — field_reporter");
    expect(comparison).toContain("| `fr.grounded` | 50.0% | 100.0% | +50.0pp |");
  });

  it("lists divergent cases with the differing assertions", () => {
    expect(comparison).toContain("## Divergent cases");
    expect(comparison).toContain("| `fr-adv-004` | ❌ | ✅ | `fr.grounded` |");
  });

  it("reports none when verdicts align", () => {
    const same = makeComparison(claude, {
      summary: gemini.summary,
      results: claude.results.map((r) => ({ ...r, provider: "gemini" as const })),
    });
    expect(same).toContain("None — both providers pass and fail the same cases.");
  });
});

describe("errored runs are not presented as results", () => {
  // Regression guard for a real incident: a network drop mid-run left 20 of 21
  // cases unable to reach the model, and the report printed "0.0% pass rate"
  // with nothing to indicate the number was meaningless.
  it("shouts, and shows the honest denominator, when cases errored", () => {
    const md = makeReport(
      summary({ n_cases: 21, pass_rate: 0, errored_cases: 20, pass_rate_excluding_errors: 0 }),
      [],
    );
    expect(md).toContain("not usable as a measurement");
    expect(md).toContain("20 of 21");
  });

  it("reports n/a rather than 0 when every case errored", () => {
    const md = makeReport(
      summary({ n_cases: 5, pass_rate: 0, errored_cases: 5, pass_rate_excluding_errors: null }),
      [],
    );
    expect(md).toContain("n/a (every case errored)");
  });

  it("stays quiet when nothing errored", () => {
    const md = makeReport(summary({ errored_cases: 0 }), []);
    expect(md).not.toContain("not usable as a measurement");
    expect(md).not.toContain("Errored cases");
  });
});

describe("repeated judging in the report", () => {
  const repeatedResult = result({
    assertion_results: [
      {
        assertion_id: "fr.grounded",
        passed: true,
        score: 1,
        rationale: "[majority 2 of 3 judgments] ok",
        judgments: 3,
        judgments_agreeing: 2,
        judgments_errored: 0,
      },
    ],
  });

  // Frozen baselines and every published report were written at one judgment
  // per assertion. A default run must produce the same bytes it always has.
  it("is byte-identical at one judgment, fields present or not", () => {
    const withoutFields = makeReport(summary({}), [result({}), failing]);
    const withRepeatsOne = makeReport(
      summary({ judge_repeats: 1, judge_agreement_rate: 1 }),
      [result({}), failing],
    );
    expect(withRepeatsOne).toBe(withoutFields);
    expect(withoutFields).not.toContain("Judge agreement");
    expect(withoutFields).not.toContain("Judge repeats");
  });

  it("shows repeats and agreement once repeats > 1", () => {
    const md = makeReport(
      summary({ judge_repeats: 3, judge_agreement_rate: 1 }),
      [repeatedResult],
    );
    expect(md).toContain("| Judge repeats | 3 per model-graded assertion, verdict by majority |");
    expect(md).toContain("| **Judge agreement** | **100.0%** |");
    expect(md).not.toContain("did not agree with itself");
  });

  it("shouts when agreement is low, the way an errored run does", () => {
    const md = makeReport(
      summary({ judge_repeats: 3, judge_agreement_rate: 0.5, pass_rate: 0.55 }),
      [repeatedResult],
    );
    expect(md).toContain("| **Judge agreement** | **50.0%** |");
    expect(md).toContain("The judge did not agree with itself, so this run is not a measurement.");
    expect(md).toContain("do not freeze it as a baseline");
    // The warning leads; it is not a footnote under the numbers.
    expect(md.indexOf("did not agree with itself")).toBeLessThan(
      md.indexOf("## Per-assertion pass rates"),
    );
  });

  it("counts tied assertions and says a tie is a failure", () => {
    const tied = result({
      case_id: "fr-tied",
      passed: false,
      assertion_results: [
        {
          assertion_id: "fr.grounded",
          passed: false,
          score: 0.4,
          rationale: "[tie 1-1 of 2 judgments, recorded as a failure] split",
          judgments: 2,
          judgments_agreeing: 1,
          judgments_errored: 0,
          judgment_tied: true,
        },
      ],
    });
    const md = makeReport(
      summary({ judge_repeats: 2, judge_agreement_rate: 0.5 }),
      [tied],
    );
    expect(md).toContain("| Tied judgments | 1 (a tie is recorded as a failure) |");
    expect(md).toContain("1 assertion(s) tied");
  });

  it("says n/a rather than a number when no assertion was model-graded", () => {
    const md = makeReport(
      summary({ judge_repeats: 3, judge_agreement_rate: null }),
      [result({})],
    );
    expect(md).toContain("n/a (no model-graded assertions)");
    expect(md).not.toContain("did not agree with itself");
  });
});
