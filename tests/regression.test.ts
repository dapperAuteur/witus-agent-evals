import { describe, expect, it } from "vitest";
import { computeRegressions } from "../src/regression.js";

describe("computeRegressions", () => {
  it("flags assertion ids whose pass rate dropped", () => {
    expect(
      computeRegressions(
        { "fr.grounded": 0.5, "fr.budget_ok": 1 },
        { "fr.grounded": 1, "fr.budget_ok": 1 },
      ),
    ).toEqual(["fr.grounded"]);
  });

  it("flags partial drops, not only 1.0 → failing", () => {
    expect(computeRegressions({ a: 0.6 }, { a: 0.9 })).toEqual(["a"]);
  });

  it("ignores improvements, equal rates, and ids unique to one run", () => {
    expect(
      computeRegressions(
        { improved: 1, same: 0.7, brand_new: 0 },
        { improved: 0.4, same: 0.7, removed: 1 },
      ),
    ).toEqual([]);
  });

  it("returns sorted ids for stable reports", () => {
    expect(
      computeRegressions({ b: 0, a: 0, c: 1 }, { b: 1, a: 1, c: 1 }),
    ).toEqual(["a", "b"]);
  });
});
