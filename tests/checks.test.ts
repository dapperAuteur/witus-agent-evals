import { afterEach, describe, expect, it } from "vitest";
import type { Telemetry } from "../src/adapters/base.js";
import type { Assertion, EvalCase } from "../src/models.js";
import { clearRegistries, getCheck } from "../src/registry.js";
import {
  citationPresent,
  citationsScoped,
  noPii,
  registerDeterministicChecks,
  revisionsOk,
  routingCorrect,
  validSchema,
  withinBudget,
} from "../src/checks/deterministic.js";

function makeAssertion(check: string, params: Record<string, unknown> = {}): Assertion {
  return {
    id: `test.${check}`,
    kind: "deterministic",
    description: "test assertion",
    check,
    params,
    criterion: null,
    weight: 1,
  };
}

function makeCase(metadata: Record<string, unknown> = {}): EvalCase {
  return {
    id: "case-1",
    agent: "field_reporter",
    input: {},
    metadata,
    assertions: [],
  };
}

const telemetry: Telemetry = { tool_calls: 3, latency_ms: 100 };

describe("citation_present", () => {
  it("passes with enough citations that all resolve to fixtures", () => {
    const r = citationPresent(
      { sources: ["fx-1", "fx-2"] },
      makeCase({ fixture_ids: ["fx-1", "fx-2", "fx-3"] }),
      telemetry,
      makeAssertion("citation_present"),
    );
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it("fails when a citation resolves to no fixture", () => {
    const r = citationPresent(
      { sources: ["fx-1", "made-up"] },
      makeCase({ fixture_ids: ["fx-1"] }),
      telemetry,
      makeAssertion("citation_present"),
    );
    expect(r.passed).toBe(false);
    expect(r.rationale).toContain("made-up");
  });

  it("fails below params.min and when the field is missing", () => {
    const below = citationPresent(
      { sources: ["fx-1"] },
      makeCase(),
      telemetry,
      makeAssertion("citation_present", { min: 2 }),
    );
    expect(below.passed).toBe(false);

    const missing = citationPresent({}, makeCase(), telemetry, makeAssertion("citation_present"));
    expect(missing.passed).toBe(false);
    expect(missing.rationale).toContain("sources");
  });

  it("reads citations from a custom params.field", () => {
    const r = citationPresent(
      { refs: ["fx-1"] },
      makeCase(),
      telemetry,
      makeAssertion("citation_present", { field: "refs" }),
    );
    expect(r.passed).toBe(true);
  });
});

describe("within_budget", () => {
  it("passes at or under budget", () => {
    const r = withinBudget({}, makeCase(), { ...telemetry, tool_calls: 5 }, makeAssertion("within_budget", { max_tool_calls: 5 }));
    expect(r.passed).toBe(true);
  });

  it("fails over budget", () => {
    const r = withinBudget({}, makeCase(), { ...telemetry, tool_calls: 6 }, makeAssertion("within_budget", { max_tool_calls: 5 }));
    expect(r.passed).toBe(false);
    expect(r.rationale).toContain("tool_calls=6");
  });

  it("throws when the dataset forgot max_tool_calls", () => {
    expect(() => withinBudget({}, makeCase(), telemetry, makeAssertion("within_budget"))).toThrow(
      /params\.max_tool_calls/,
    );
  });
});

describe("revisions_ok", () => {
  it("passes at the explicit max", () => {
    const r = revisionsOk({}, makeCase(), { ...telemetry, revisions: 2 }, makeAssertion("revisions_ok", { max_revisions: 2 }));
    expect(r.passed).toBe(true);
  });

  it("fails past the default max of 3", () => {
    const r = revisionsOk({}, makeCase(), { ...telemetry, revisions: 4 }, makeAssertion("revisions_ok"));
    expect(r.passed).toBe(false);
  });

  it("fails when the adapter reported no revision count", () => {
    const r = revisionsOk({}, makeCase(), telemetry, makeAssertion("revisions_ok"));
    expect(r.passed).toBe(false);
    expect(r.rationale).toContain("no revision count");
  });
});

describe("valid_schema", () => {
  it("passes when all required fields are present and non-empty", () => {
    const r = validSchema(
      { title: "t", body: "b", sources: ["fx-1"] },
      makeCase(),
      telemetry,
      makeAssertion("valid_schema", { required: ["title", "body", "sources"] }),
    );
    expect(r.passed).toBe(true);
  });

  it("fails on missing or empty fields, naming them", () => {
    const r = validSchema(
      { title: "t", body: "   ", sources: [] },
      makeCase(),
      telemetry,
      makeAssertion("valid_schema", { required: ["title", "body", "sources"] }),
    );
    expect(r.passed).toBe(false);
    expect(r.rationale).toContain("body");
    expect(r.rationale).toContain("sources");
    expect(r.rationale).not.toContain("title,");
  });

  it("throws when the dataset forgot params.required", () => {
    expect(() => validSchema({}, makeCase(), telemetry, makeAssertion("valid_schema"))).toThrow(
      /params\.required/,
    );
  });
});

describe("routing_correct", () => {
  const routed = (invoked?: string[]): Telemetry =>
    invoked === undefined ? telemetry : { ...telemetry, invoked_specialists: invoked };

  it("passes when invoked specialists cover expected routes (superset ok)", () => {
    const r = routingCorrect(
      {},
      makeCase({ expected_routes: ["nutrition"] }),
      routed(["nutrition", "recovery"]),
      makeAssertion("routing_correct"),
    );
    expect(r.passed).toBe(true);
  });

  it("fails when an expected route was not invoked", () => {
    const r = routingCorrect(
      {},
      makeCase({ expected_routes: ["nutrition", "workout"] }),
      routed(["nutrition"]),
      makeAssertion("routing_correct"),
    );
    expect(r.passed).toBe(false);
    expect(r.rationale).toContain("workout");
  });

  it("fails when the adapter reported no invoked_specialists", () => {
    const r = routingCorrect({}, makeCase({ expected_routes: ["nutrition"] }), routed(), makeAssertion("routing_correct"));
    expect(r.passed).toBe(false);
  });

  it("throws when the dataset forgot metadata.expected_routes", () => {
    expect(() =>
      routingCorrect({}, makeCase(), routed(["nutrition"]), makeAssertion("routing_correct")),
    ).toThrow(/expected_routes/);
  });
});

describe("citations_scoped", () => {
  const namespaces = {
    nutrition: ["nut-1", "nut-2"],
    recovery: ["rec-1"],
  };

  it("passes when every citation stays in its specialist's namespace", () => {
    const r = citationsScoped(
      { citations: [{ specialist: "nutrition", source_id: "nut-1" }, { specialist: "recovery", source_id: "rec-1" }] },
      makeCase({ namespaces }),
      telemetry,
      makeAssertion("citations_scoped"),
    );
    expect(r.passed).toBe(true);
  });

  it("fails on cross-namespace contamination, naming the leak", () => {
    const r = citationsScoped(
      { citations: [{ specialist: "recovery", source_id: "nut-1" }] },
      makeCase({ namespaces }),
      telemetry,
      makeAssertion("citations_scoped"),
    );
    expect(r.passed).toBe(false);
    expect(r.rationale).toContain("recovery→nut-1");
  });

  it("fails when output.citations is missing the normalized shape", () => {
    const r = citationsScoped({ citations: ["nut-1"] }, makeCase({ namespaces }), telemetry, makeAssertion("citations_scoped"));
    expect(r.passed).toBe(false);
  });

  it("throws when the dataset forgot metadata.namespaces", () => {
    expect(() =>
      citationsScoped({ citations: [] }, makeCase(), telemetry, makeAssertion("citations_scoped")),
    ).toThrow(/namespaces/);
  });

  it("accepts prefix-scoped labels via metadata.namespace_prefixes", () => {
    const meta = {
      namespaces,
      namespace_prefixes: { recovery: ["Recovery · "], nutrition: ["NASM CNC · "] },
    };
    const ok = citationsScoped(
      {
        citations: [
          { specialist: "recovery", source_id: "Recovery · Sleep Practices of Athletes · p. 4" },
          { specialist: "nutrition", source_id: "nut-1" }, // exact still works
        ],
      },
      makeCase(meta),
      telemetry,
      makeAssertion("citations_scoped"),
    );
    expect(ok.passed).toBe(true);

    const leak = citationsScoped(
      { citations: [{ specialist: "nutrition", source_id: "Recovery · Sleep Practices · p. 4" }] },
      makeCase(meta),
      telemetry,
      makeAssertion("citations_scoped"),
    );
    expect(leak.passed).toBe(false); // another namespace's prefix is contamination
  });
});

describe("no_pii", () => {
  it("passes on clean output", () => {
    const r = noPii({ body: "Drink water. Sleep 8 hours." }, makeCase(), telemetry, makeAssertion("no_pii"));
    expect(r.passed).toBe(true);
  });

  it("fails on an email without reprinting it", () => {
    const r = noPii({ body: "Contact coach@example.com for a plan" }, makeCase(), telemetry, makeAssertion("no_pii"));
    expect(r.passed).toBe(false);
    expect(r.rationale).toContain("email");
    expect(r.rationale).not.toContain("coach@example.com");
  });

  it("fails on SSN and phone shapes", () => {
    expect(noPii({ body: "ssn 123-45-6789" }, makeCase(), telemetry, makeAssertion("no_pii")).passed).toBe(false);
    expect(noPii({ body: "call (555) 123-4567 now" }, makeCase(), telemetry, makeAssertion("no_pii")).passed).toBe(false);
  });

  it("scans only params.fields when given", () => {
    const output = { body: "clean text", debug: "coach@example.com" };
    const scoped = noPii(output, makeCase(), telemetry, makeAssertion("no_pii", { fields: ["body"] }));
    expect(scoped.passed).toBe(true);
    const full = noPii(output, makeCase(), telemetry, makeAssertion("no_pii"));
    expect(full.passed).toBe(false);
  });
});

describe("registerDeterministicChecks", () => {
  afterEach(clearRegistries);

  it("registers all seven checks under their dataset names", () => {
    registerDeterministicChecks();
    for (const name of [
      "citation_present",
      "within_budget",
      "revisions_ok",
      "valid_schema",
      "routing_correct",
      "citations_scoped",
      "no_pii",
    ]) {
      expect(getCheck(name)).toBeTypeOf("function");
    }
  });
});
