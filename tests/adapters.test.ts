import { describe, expect, it } from "vitest";
import type { GraphInvoker, GraphRunSpec } from "../src/adapters/subprocess.js";
import {
  createFieldReporterAdapter,
  normalizeFieldReporterState,
} from "../src/adapters/field_reporter.js";
import {
  createCoachAdapter,
  normalizeCoachState,
} from "../src/adapters/coach_multiagent.js";
import { AGENT_PROVIDER } from "../src/adapters/shared.js";
import { loadSettings } from "../src/settings.js";

const settings = loadSettings({} as NodeJS.ProcessEnv);

/** Capture the spec the adapter builds and return a canned state. */
function fakeInvoker(state: Record<string, unknown>): {
  invoke: GraphInvoker;
  specs: GraphRunSpec[];
} {
  const specs: GraphRunSpec[] = [];
  return {
    specs,
    invoke: async (spec) => {
      specs.push(spec);
      return { state, latency_ms: 1234 };
    },
  };
}

const fieldReporterState = {
  finalMarkdown: "# Eiffel Tower Field Lesson\n\nBody text.",
  draft: {
    revisionNumber: 2,
    markdown: "# Eiffel Tower Field Lesson\n\nBody text.",
    citations: [
      { claim: "Opened 1889", source: "fx-guidebook" },
      { claim: "324m tall", source: "fx-plaque" },
      { claim: "Duplicate source claim", source: "fx-guidebook" },
    ],
  },
  critique: { revisionNumber: 2, passed: true, feedback: "ok" },
  revisionHistory: [
    { revisionNumber: 0, markdown: "rev0 draft text", passed: false, feedback: "thin" },
    { revisionNumber: 1, markdown: "rev1", passed: false, feedback: "closer" },
  ],
  imagePrompts: ["tower at dusk"],
  flaggedForHumanReview: false,
  webSearchCallCount: 3,
};

describe("field_reporter normalization", () => {
  const normalized = normalizeFieldReporterState(fieldReporterState);

  it("maps title/body/sources for the deterministic checks", () => {
    expect(normalized.output["title"]).toBe("Eiffel Tower Field Lesson");
    expect(normalized.output["body"]).toContain("Body text.");
    expect(normalized.output["sources"]).toEqual(["fx-guidebook", "fx-plaque"]); // deduped
  });

  it("reports revision count and the rev-0 draft (fr.revision_improved)", () => {
    expect(normalized.telemetry.revisions).toBe(2);
    expect(normalized.telemetry.rev0_draft).toMatchObject({ markdown: "rev0 draft text" });
  });

  it("reports webSearch tool calls", () => {
    expect(normalized.telemetry.tool_calls).toBe(3);
  });

  it("handles a flagged, unfinished run without throwing", () => {
    const flagged = normalizeFieldReporterState({
      draft: { revisionNumber: 3, markdown: "draft only", citations: [] },
      flaggedForHumanReview: true,
    });
    expect(flagged.output["flagged_for_human_review"]).toBe(true);
    expect(flagged.output["body"]).toBe("draft only");
    expect(flagged.output["title"]).toBe("");
  });
});

const coachState = {
  routing: {
    agents: ["nutrition", "recovery"],
    primaryAgent: "nutrition",
    rationale: "diet question with a sleep angle",
  },
  findings: {
    nutrition: {
      agent: "nutrition",
      text: "Eat protein.",
      citations: [{ source: "nut-doc-1", snippet: "protein...", agent: "nutrition" }],
      toolCalls: [{ name: "retrieve" }, { name: "retrieve" }],
    },
    recovery: {
      agent: "recovery",
      text: "Sleep more.",
      citations: [{ source: "rec-doc-9", snippet: "sleep...", agent: "recovery" }],
      toolCalls: [{ name: "retrieve" }],
    },
  },
  finalAnswer: {
    text: "Protein plus sleep.",
    citations: [{ source: "nut-doc-1", snippet: "protein...", agent: "nutrition" }],
    consultedAgents: ["nutrition", "recovery"],
  },
} as const;

describe("coach_multiagent normalization", () => {
  const normalized = normalizeCoachState(coachState as never);

  it("reports invoked specialists from the supervisor's routing (cx.routing_correct)", () => {
    expect(normalized.telemetry.invoked_specialists).toEqual(["nutrition", "recovery"]);
  });

  it("normalizes specialist-scoped citations (cx.citations_scoped contract)", () => {
    expect(normalized.output["citations"]).toEqual([
      { specialist: "nutrition", source_id: "nut-doc-1" },
      { specialist: "recovery", source_id: "rec-doc-9" },
    ]);
  });

  it("sums specialist tool calls", () => {
    expect(normalized.telemetry.tool_calls).toBe(3);
  });

  it("falls back to findings keys when routing is missing", () => {
    const { routing: _dropped, ...noRouting } = coachState;
    const normalized2 = normalizeCoachState(noRouting as never);
    expect(normalized2.telemetry.invoked_specialists).toEqual(["nutrition", "recovery"]);
  });
});

describe("adapter run() wiring (fake invoker, no subprocess)", () => {
  it("field_reporter maps harness providers to the agent's names and stamps input", async () => {
    const { invoke, specs } = fakeInvoker(fieldReporterState);
    const adapter = createFieldReporterAdapter(settings, invoke);
    const result = await adapter.run(
      { location: { name: "Paris" }, rawInput: { transcript: "t", imageRefs: [] }, targetAudience: "general" },
      "gemini",
    );
    expect(specs[0]?.invokeInput["llmProvider"]).toBe("google");
    expect(specs[0]?.isFactory).toBe(true);
    expect(specs[0]?.extraNodeOptions).toContain("react-server");
    expect(result.telemetry.latency_ms).toBe(1234);
    expect(result.telemetry.revisions).toBe(2);
    expect(result.output["sources"]).toEqual(["fx-guidebook", "fx-plaque"]);
  });

  it("coach pins the provider via COACH_LLM_PROVIDER and passes the query", async () => {
    const { invoke, specs } = fakeInvoker(coachState as never);
    const adapter = createCoachAdapter(settings, invoke);
    const result = await adapter.run({ userQuery: "What should I eat?" }, "claude");
    expect(specs[0]?.invokeInput["userQuery"]).toBe("What should I eat?");
    expect(specs[0]?.extraEnv?.["COACH_LLM_PROVIDER"]).toBe("anthropic");
    expect(result.telemetry.invoked_specialists).toEqual(["nutrition", "recovery"]);
  });

  it("coach throws loudly on a case with no userQuery (dataset bug)", async () => {
    const { invoke } = fakeInvoker(coachState as never);
    const adapter = createCoachAdapter(settings, invoke);
    await expect(adapter.run({}, "claude")).rejects.toThrow(/userQuery/);
  });

  it("provider mapping covers both harness providers", () => {
    expect(AGENT_PROVIDER).toEqual({ claude: "anthropic", gemini: "google" });
  });
});
