import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AdapterOutput } from "../src/adapters/base.js";
import type { CaseResult, RunSummary } from "../src/models.js";
import {
  cacheGet,
  cachePut,
  listRuns,
  loadResults,
  loadSummary,
  saveRun,
} from "../src/storage.js";

let runsDir: string;
beforeEach(() => (runsDir = mkdtempSync(join(tmpdir(), "evals-storage-"))));
afterEach(() => rmSync(runsDir, { recursive: true, force: true }));

const caseResult: CaseResult = {
  case_id: "c-1",
  agent: "field_reporter",
  provider: "claude",
  run_id: "r-1",
  output: { body: "b" },
  trace_ref: null,
  assertion_results: [
    { assertion_id: "a", passed: true, score: 1, rationale: null },
  ],
  tool_calls: 1,
  revisions: null,
  latency_ms: 10,
  passed: true,
  timestamp: new Date("2026-07-31T12:00:00Z"),
};

const summary: RunSummary = {
  run_id: "r-1",
  agent: "field_reporter",
  provider: "claude",
  started_at: new Date("2026-07-31T12:00:00Z"),
  finished_at: new Date("2026-07-31T12:05:00Z"),
  n_cases: 1,
  pass_rate: 1,
  per_assertion_pass_rate: { a: 1 },
  baseline_run_id: null,
  regressions: [],
};

describe("run persistence", () => {
  it("saves and reloads results.jsonl + summary.json losslessly", () => {
    saveRun(runsDir, "r-1", [caseResult], summary);
    expect(loadSummary(runsDir, "r-1")).toEqual(summary);
    expect(loadResults(runsDir, "r-1")).toEqual([caseResult]);
  });

  it("lists runs but never the cache directory", () => {
    saveRun(runsDir, "r-1", [caseResult], summary);
    saveRun(runsDir, "r-2", [caseResult], { ...summary, run_id: "r-2" });
    cachePut(runsDir, "field_reporter", "c-1", "claude", { q: 1 }, {
      output: {},
      trace_ref: null,
      telemetry: { tool_calls: 0, latency_ms: 0 },
    });
    expect(listRuns(runsDir)).toEqual(["r-1", "r-2"]);
  });

  it("unknown run ids fail loudly, naming what exists", () => {
    saveRun(runsDir, "r-1", [caseResult], summary);
    expect(() => loadSummary(runsDir, "nope")).toThrow(/r-1/);
  });
});

describe("agent-output cache", () => {
  const output: AdapterOutput = {
    output: { body: "cached" },
    trace_ref: "langsmith:p#run",
    telemetry: { tool_calls: 3, latency_ms: 99, revisions: 2, invoked_specialists: ["nutrition"] },
  };

  it("round-trips by (agent, case, provider, input-hash)", () => {
    cachePut(runsDir, "coach_multiagent", "c-9", "gemini", { q: "hi" }, output);
    expect(cacheGet(runsDir, "coach_multiagent", "c-9", "gemini", { q: "hi" })).toEqual(output);
  });

  it("misses on a different provider or changed input", () => {
    cachePut(runsDir, "coach_multiagent", "c-9", "gemini", { q: "hi" }, output);
    expect(cacheGet(runsDir, "coach_multiagent", "c-9", "claude", { q: "hi" })).toBeNull();
    expect(cacheGet(runsDir, "coach_multiagent", "c-9", "gemini", { q: "changed" })).toBeNull();
  });
});
