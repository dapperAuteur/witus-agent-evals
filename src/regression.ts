/**
 * Regression detection (PRD goal 4): compare a run to a baseline and flag
 * newly-failing properties.
 *
 * An assertion id counts as a regression when its pass rate STRICTLY
 * dropped versus the baseline run. Assertion ids only one run knows about
 * are skipped — dataset growth is not a regression.
 */
import { loadSummary } from "./storage.js";
import type { RunSummary } from "./models.js";

export function computeRegressions(
  current: Record<string, number>,
  baseline: Record<string, number>,
): string[] {
  return Object.keys(current)
    .filter((id) => {
      const base = baseline[id];
      const now = current[id];
      return base !== undefined && now !== undefined && now < base - 1e-9;
    })
    .sort();
}

/** Load a baseline by run id and diff against the current per-assertion rates. */
export function regressionsAgainstBaseline(
  runsDir: string,
  baselineRunId: string,
  currentRates: Record<string, number>,
): { regressions: string[]; baseline: RunSummary } {
  const baseline = loadSummary(runsDir, baselineRunId);
  return {
    regressions: computeRegressions(currentRates, baseline.per_assertion_pass_rate),
    baseline,
  };
}
