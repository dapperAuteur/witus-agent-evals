import { describe, expect, it } from "vitest";
import { loadCases, resolveFixtures } from "../src/datasets.js";

const fieldReporter = loadCases("field_reporter");
const coach = loadCases("coach_multiagent");

describe("dataset packs load and validate (brief M6 acceptance)", () => {
  it("field_reporter has ≥20 valid EvalCases", () => {
    expect(fieldReporter.length).toBeGreaterThanOrEqual(20);
    for (const c of fieldReporter) {
      expect(c.agent).toBe("field_reporter");
      expect(c.assertions.length).toBeGreaterThan(0);
    }
  });

  it("coach_multiagent has ≥20 valid EvalCases", () => {
    expect(coach.length).toBeGreaterThanOrEqual(20);
    for (const c of coach) {
      expect(c.agent).toBe("coach_multiagent");
      expect(c.assertions.length).toBeGreaterThan(0);
    }
  });

  it("case ids are unique within each pack", () => {
    for (const pack of [fieldReporter, coach]) {
      expect(new Set(pack.map((c) => c.id)).size).toBe(pack.length);
    }
  });

  it("every hard/adversarial case names its target assertions, and targets exist", () => {
    for (const pack of [fieldReporter, coach]) {
      for (const c of pack) {
        if (c.metadata["difficulty"] === "easy") continue;
        const targets = c.metadata["targets"] as string[];
        expect(targets, `${c.id} must declare metadata.targets`).toBeInstanceOf(Array);
        expect(targets.length).toBeGreaterThan(0);
        const assertionIds = new Set(c.assertions.map((a) => a.id));
        for (const target of targets) {
          expect(assertionIds.has(target), `${c.id} targets unknown assertion ${target}`).toBe(true);
        }
      }
    }
  });

  it("≥3 adversarial cases target each agent's money failure mode", () => {
    const frMoney = fieldReporter.filter(
      (c) =>
        c.metadata["difficulty"] === "adversarial" &&
        (c.metadata["targets"] as string[]).includes("fr.independent_rubric_pass"),
    );
    expect(frMoney.length).toBeGreaterThanOrEqual(3); // self-grading leniency

    const cxMoney = coach.filter(
      (c) =>
        c.metadata["difficulty"] === "adversarial" &&
        (c.metadata["targets"] as string[]).includes("cx.no_contradiction"),
    );
    expect(cxMoney.length).toBeGreaterThanOrEqual(3); // cross-specialist contradiction
  });
});

describe("fixture resolution", () => {
  it("inlines transcripts from source_material into case input", () => {
    const eiffel = fieldReporter.find((c) => c.id === "fr-easy-001")!;
    const rawInput = eiffel.input["rawInput"] as { transcript: string };
    expect(rawInput.transcript).toContain("1889 Exposition Universelle");
  });

  it("injects the coach namespace map with the real KB source labels", () => {
    const anyCase = coach[0]!;
    const namespaces = anyCase.metadata["namespaces"] as Record<string, string[]>;
    expect(Object.keys(namespaces).sort()).toEqual([
      "corrective",
      "nutrition",
      "recovery",
      "workout",
    ]);
    expect(namespaces["nutrition"]!.length).toBeGreaterThan(50);
    expect(namespaces["nutrition"]!.every((s) => typeof s === "string")).toBe(true);
  });

  it("expands the shared assertion packs per agent", () => {
    expect(fieldReporter[0]!.assertions.map((a) => a.id)).toContain("fr.independent_rubric_pass");
    expect(coach[0]!.assertions.map((a) => a.id)).toContain("cx.no_contradiction");
  });

  it("coach cases carry expected_routes for the routing check", () => {
    for (const c of coach) {
      expect(Array.isArray(c.metadata["expected_routes"]), `${c.id}`).toBe(true);
    }
  });

  it("rejects fixture refs that escape the dataset dir", () => {
    expect(() =>
      resolveFixtures({ $fixture: "../../.env" }, "datasets/field_reporter"),
    ).toThrow(/escapes/);
  });
});
