import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentAdapter } from "../src/adapters/base.js";
import { registerDeterministicChecks } from "../src/checks/deterministic.js";
import type { JudgeModel } from "../src/providers.js";
import { clearRegistries } from "../src/registry.js";
import { runEval } from "../src/runner.js";
import { loadRubric } from "../src/judge/rubrics.js";
import { loadSettings } from "../src/settings.js";
import { loadResults, loadSummary } from "../src/storage.js";
import type { EvalCase } from "../src/models.js";

const settings = loadSettings({} as NodeJS.ProcessEnv);
const rubric = loadRubric("field_reporter");

/** Two-case dataset: one passes everything, one fails citation_present. */
const cases: EvalCase[] = [
  {
    id: "fr-001",
    agent: "field_reporter",
    input: { capture: "good case" },
    metadata: {},
    assertions: [
      {
        id: "fr.citations_present",
        kind: "deterministic",
        description: "has citations",
        check: "citation_present",
        params: {},
        criterion: null,
        weight: 1,
      },
      {
        id: "fr.grounded",
        kind: "model_graded",
        description: "grounded",
        check: null,
        params: {},
        criterion: "grounded",
        weight: 1,
      },
    ],
  },
  {
    id: "fr-002",
    agent: "field_reporter",
    input: { capture: "bad case" },
    metadata: {},
    assertions: [
      {
        id: "fr.citations_present",
        kind: "deterministic",
        description: "has citations",
        check: "citation_present",
        params: {},
        criterion: null,
        weight: 1,
      },
    ],
  },
];

/** Adapter whose second case has no sources; counts invocations. */
function fakeAdapter(): AgentAdapter & { invocations: string[] } {
  const adapter = {
    name: "field_reporter",
    invocations: [] as string[],
    async run(input: Record<string, unknown>) {
      adapter.invocations.push(String(input["capture"]));
      const good = input["capture"] === "good case";
      return {
        output: {
          body: "The Eiffel Tower opened in 1889.",
          sources: good ? ["fx-1"] : [],
        },
        trace_ref: null,
        telemetry: { tool_calls: 2, latency_ms: 50, revisions: 1 },
      };
    },
  };
  return adapter;
}

/** Judge that always passes with real evidence. */
const passingJudge: JudgeModel = {
  provider: "cerebras",
  modelId: "fake",
  invoke: async () =>
    JSON.stringify({
      score: 1,
      passed: true,
      rationale: "grounded",
      evidence_span: "The Eiffel Tower opened in 1889.",
    }),
};

let runsDir: string;
let clock: number;
const nextNow = () => new Date((clock += 60_000));

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), "evals-runs-"));
  clock = Date.parse("2026-07-31T12:00:00Z");
  clearRegistries();
  registerDeterministicChecks();
});
afterEach(() => rmSync(runsDir, { recursive: true, force: true }));

function baseOptions(adapter = fakeAdapter()) {
  return {
    agent: "field_reporter" as const,
    provider: "claude" as const,
    cases,
    settings,
    runsDir,
    adapter,
    judgeModel: passingJudge,
    rubric,
    now: nextNow,
    notify: async () => "skipped_unprovisioned" as const,
  };
}

describe("runEval — the brief's full-run acceptance", () => {
  it("produces CaseResults + a RunSummary and persists both", async () => {
    const outcome = await runEval(baseOptions());

    expect(outcome.results).toHaveLength(2);
    expect(outcome.summary.n_cases).toBe(2);
    expect(outcome.summary.pass_rate).toBe(0.5); // fr-002 fails citations
    expect(outcome.summary.per_assertion_pass_rate["fr.citations_present"]).toBe(0.5);
    expect(outcome.summary.per_assertion_pass_rate["fr.grounded"]).toBe(1);
    expect(outcome.summary.regressions).toEqual([]);

    // Round-trips from disk through the zod schemas.
    expect(loadSummary(runsDir, outcome.runId).run_id).toBe(outcome.runId);
    expect(loadResults(runsDir, outcome.runId)).toHaveLength(2);
  });

  it("re-running re-uses cached agent output — the agent is NOT re-invoked", async () => {
    const first = fakeAdapter();
    await runEval(baseOptions(first));
    expect(first.invocations).toHaveLength(2);

    const second = fakeAdapter();
    const outcome = await runEval(baseOptions(second));
    expect(second.invocations).toHaveLength(0); // served from cache
    expect(outcome.summary.pass_rate).toBe(0.5); // same verdicts from cache
  });

  it("a changed case input misses the cache (input-hash key)", async () => {
    const first = fakeAdapter();
    await runEval(baseOptions(first));

    const editedCases = structuredClone(cases);
    editedCases[1]!.input = { capture: "bad case, edited" };
    const second = fakeAdapter();
    await runEval({ ...baseOptions(second), cases: editedCases });
    expect(second.invocations).toEqual(["bad case, edited"]);
  });

  it("populates regressions against a deliberately-broken baseline", async () => {
    // Baseline: judge passes AND both cases get citations → all green.
    const generousAdapter: AgentAdapter = {
      name: "field_reporter",
      run: async () => ({
        output: { body: "The Eiffel Tower opened in 1889.", sources: ["fx-1"] },
        trace_ref: null,
        telemetry: { tool_calls: 1, latency_ms: 10 },
      }),
    };
    const baseline = await runEval({ ...baseOptions(generousAdapter as never), runsDir });
    expect(baseline.summary.pass_rate).toBe(1);

    // Current run: fr-002 loses its citations (fresh cache dir via edited input).
    const brokenCases = structuredClone(cases);
    brokenCases[1]!.input = { capture: "bad case v2" };
    const outcome = await runEval({
      ...baseOptions(fakeAdapter()),
      cases: brokenCases,
      baselineRunId: baseline.runId,
    });

    expect(outcome.summary.regressions).toEqual(["fr.citations_present"]);
    expect(outcome.summary.baseline_run_id).toBe(baseline.runId);
  });

  it("an adapter crash records an error CaseResult and the run continues", async () => {
    const flaky: AgentAdapter = {
      name: "field_reporter",
      run: async (input) => {
        if (input["capture"] === "good case") throw new Error("agent exploded");
        return {
          output: { body: "b", sources: ["fx-1"] },
          trace_ref: null,
          telemetry: { tool_calls: 0, latency_ms: 5 },
        };
      },
    };
    const outcome = await runEval(baseOptions(flaky as never));
    expect(outcome.erroredCases).toBe(1);
    expect(outcome.results).toHaveLength(2);
    const errored = outcome.results.find((r) => r.case_id === "fr-001");
    expect(errored?.passed).toBe(false);
    expect(errored?.assertion_results.every((a) => !a.passed)).toBe(true);
    expect(String(errored?.output["error"])).toContain("agent exploded");
  });

  it("a thrown deterministic check (dataset bug) fails that assertion, not the run", async () => {
    const buggyCases = structuredClone(cases).slice(0, 1);
    buggyCases[0]!.assertions[0]!.check = "within_budget"; // missing max_tool_calls param
    const outcome = await runEval({ ...baseOptions(), cases: buggyCases });
    const result = outcome.results[0]!;
    const failed = result.assertion_results.find(
      (a) => a.assertion_id === "fr.citations_present",
    );
    expect(failed?.passed).toBe(false);
    expect(failed?.rationale).toContain("RUNNER_ERROR");
  });

  it("respects --limit", async () => {
    const adapter = fakeAdapter();
    const outcome = await runEval({ ...baseOptions(adapter), limit: 1 });
    expect(outcome.results).toHaveLength(1);
    expect(adapter.invocations).toEqual(["good case"]);
  });

  it("weighted threshold: a failing 0.5-weight nudge passes at threshold 0.75", async () => {
    const nudgeCases: EvalCase[] = [
      {
        ...cases[1]!,
        id: "fr-weighted",
        input: { capture: "bad case" },
        assertions: [
          { ...cases[1]!.assertions[0]!, weight: 0.5 }, // failing citations, nudge weight
          {
            id: "fr.grounded",
            kind: "model_graded",
            description: "grounded",
            check: null,
            params: {},
            criterion: "grounded",
            weight: 1,
          },
        ],
      },
    ];
    const strict = await runEval({ ...baseOptions(), cases: nudgeCases });
    expect(strict.results[0]!.passed).toBe(false); // default threshold 1.0

    const lenient = await runEval({
      ...baseOptions(),
      cases: nudgeCases,
      passThreshold: 0.6,
    });
    expect(lenient.results[0]!.passed).toBe(true); // 1/1.5 ≈ 0.67 ≥ 0.6
  });
});
