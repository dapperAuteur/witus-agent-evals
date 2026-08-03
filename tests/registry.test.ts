import { afterEach, describe, expect, it } from "vitest";
import {
  clearRegistries,
  getAdapter,
  getCheck,
  registerAdapter,
  registerCheck,
} from "../src/registry.js";
import type { DeterministicCheck } from "../src/registry.js";
import type { AgentAdapter } from "../src/adapters/base.js";

const dummyCheck: DeterministicCheck = (_output, _case, _telemetry, assertion) => ({
  assertion_id: assertion.id,
  passed: true,
  score: 1,
  rationale: null,
});

const dummyAdapter: AgentAdapter = {
  name: "field_reporter",
  run: async () => ({
    output: {},
    trace_ref: null,
    telemetry: { tool_calls: 0, latency_ms: 0 },
  }),
};

afterEach(clearRegistries);

describe("check registry", () => {
  it("registers and resolves by name", () => {
    registerCheck("citation_present", dummyCheck);
    expect(getCheck("citation_present")).toBe(dummyCheck);
  });

  it("throws on duplicate registration", () => {
    registerCheck("citation_present", dummyCheck);
    expect(() => registerCheck("citation_present", dummyCheck)).toThrow(/already registered/);
  });

  it("throws on unknown lookup, naming what is registered", () => {
    registerCheck("within_budget", dummyCheck);
    expect(() => getCheck("citaton_present")).toThrow(/within_budget/);
  });
});

describe("adapter registry", () => {
  it("registers and resolves by adapter name", () => {
    registerAdapter(dummyAdapter);
    expect(getAdapter("field_reporter")).toBe(dummyAdapter);
  });

  it("throws on duplicate registration", () => {
    registerAdapter(dummyAdapter);
    expect(() => registerAdapter(dummyAdapter)).toThrow(/already registered/);
  });

  it("throws on unknown lookup", () => {
    expect(() => getAdapter("coach_multiagent")).toThrow(/Unknown adapter/);
  });
});
