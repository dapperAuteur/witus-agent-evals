/**
 * Markdown report generation (PRD goal 6): human-readable next to the
 * machine-readable JSONL. One report per run, plus a provider-comparison
 * report across two runs of the same agent.
 */
import type { CaseResult, RunSummary } from "./models.js";

const pct = (rate: number): string => `${(rate * 100).toFixed(1)}%`;
const ms = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);

function truncate(text: string, max = 220): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function makeReport(summary: RunSummary, results: CaseResult[]): string {
  const lines: string[] = [
    `# Eval report — ${summary.run_id}`,
    ``,
    `| | |`,
    `|---|---|`,
    `| Agent | ${summary.agent} |`,
    `| Provider | ${summary.provider} |`,
    `| Cases | ${summary.n_cases} |`,
    `| **Pass rate** | **${pct(summary.pass_rate)}** |`,
    ...(summary.errored_cases > 0
      ? [
          `| **Errored cases** | **${summary.errored_cases} of ${summary.n_cases}** |`,
          `| Pass rate excluding errors | ${
            summary.pass_rate_excluding_errors === null
              ? "n/a (every case errored)"
              : pct(summary.pass_rate_excluding_errors)
          } |`,
        ]
      : []),
    `| Started | ${summary.started_at.toISOString()} |`,
    `| Finished | ${summary.finished_at.toISOString()} |`,
    `| Baseline | ${summary.baseline_run_id ?? "—"} |`,
    ``,
  ];

  // An errored run is not a result. Say so above the numbers, not in a footnote,
  // because the pass-rate cell alone reads as evidence about the agent.
  if (summary.errored_cases > 0) {
    lines.push(
      `> **This run is not usable as a measurement.** ${summary.errored_cases} of ` +
        `${summary.n_cases} cases failed before or during judging (network, quota, or ` +
        `a crashed agent), and an errored case is recorded as a failed one. Do not ` +
        `publish the pass rate above, do not freeze this as a baseline, and do not ` +
        `compare it to anything. Fix the cause and re-run; cached agent outputs mean ` +
        `a re-run only pays for the cases that did not complete.`,
      ``,
    );
  }

  if (summary.baseline_run_id) {
    lines.push(`## Regressions vs ${summary.baseline_run_id}`, ``);
    if (summary.regressions.length === 0) {
      lines.push(`None — no assertion's pass rate dropped.`, ``);
    } else {
      lines.push(
        `⚠️ ${summary.regressions.length} assertion(s) got worse:`,
        ``,
        ...summary.regressions.map((id) => `- \`${id}\``),
        ``,
      );
    }
  }

  lines.push(`## Per-assertion pass rates`, ``, `| Assertion | Pass rate |`, `|---|---|`);
  for (const [id, rate] of Object.entries(summary.per_assertion_pass_rate).sort()) {
    lines.push(`| \`${id}\` | ${pct(rate)} |`);
  }

  lines.push(
    ``,
    `## Cases`,
    ``,
    `| Case | Result | Failed assertions | Latency | Tool calls | Revisions |`,
    `|---|---|---|---|---|---|`,
  );
  for (const result of results) {
    const failed = result.assertion_results.filter((a) => !a.passed);
    lines.push(
      `| \`${result.case_id}\` | ${result.passed ? "✅ pass" : "❌ fail"} | ${
        failed.map((a) => `\`${a.assertion_id}\``).join(", ") || "—"
      } | ${ms(result.latency_ms)} | ${result.tool_calls} | ${result.revisions ?? "—"} |`,
    );
  }

  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    lines.push(``, `## Failure detail`);
    for (const result of failures) {
      lines.push(``, `### \`${result.case_id}\``, ``);
      if (result.trace_ref) lines.push(`Trace: \`${result.trace_ref}\``, ``);
      for (const assertion of result.assertion_results.filter((a) => !a.passed)) {
        lines.push(
          `- \`${assertion.assertion_id}\` (score ${assertion.score.toFixed(2)}): ${
            assertion.rationale ? truncate(assertion.rationale) : "no rationale"
          }`,
        );
      }
    }
  }

  return lines.join("\n") + "\n";
}

export interface RunArtifacts {
  summary: RunSummary;
  results: CaseResult[];
}

/** Claude-vs-Gemini (or any two runs of the same agent) comparison. */
export function makeComparison(a: RunArtifacts, b: RunArtifacts): string {
  const providerA = a.summary.provider;
  const providerB = b.summary.provider;
  const lines: string[] = [
    `# Provider comparison — ${a.summary.agent}`,
    ``,
    `| | ${providerA} | ${providerB} |`,
    `|---|---|---|`,
    `| Run | \`${a.summary.run_id}\` | \`${b.summary.run_id}\` |`,
    `| Cases | ${a.summary.n_cases} | ${b.summary.n_cases} |`,
    `| **Pass rate** | **${pct(a.summary.pass_rate)}** | **${pct(b.summary.pass_rate)}** |`,
    `| Avg latency | ${ms(avg(a.results.map((r) => r.latency_ms)))} | ${ms(avg(b.results.map((r) => r.latency_ms)))} |`,
    `| Avg tool calls | ${avg(a.results.map((r) => r.tool_calls)).toFixed(1)} | ${avg(b.results.map((r) => r.tool_calls)).toFixed(1)} |`,
    ``,
    `## Per-assertion pass rates`,
    ``,
    `| Assertion | ${providerA} | ${providerB} | Δ (${providerB} − ${providerA}) |`,
    `|---|---|---|---|`,
  ];

  const assertionIds = [
    ...new Set([
      ...Object.keys(a.summary.per_assertion_pass_rate),
      ...Object.keys(b.summary.per_assertion_pass_rate),
    ]),
  ].sort();
  for (const id of assertionIds) {
    const rateA = a.summary.per_assertion_pass_rate[id];
    const rateB = b.summary.per_assertion_pass_rate[id];
    const delta =
      rateA !== undefined && rateB !== undefined
        ? `${rateB - rateA >= 0 ? "+" : ""}${((rateB - rateA) * 100).toFixed(1)}pp`
        : "—";
    lines.push(
      `| \`${id}\` | ${rateA !== undefined ? pct(rateA) : "—"} | ${
        rateB !== undefined ? pct(rateB) : "—"
      } | ${delta} |`,
    );
  }

  const resultsB = new Map(b.results.map((r) => [r.case_id, r]));
  const divergent = a.results
    .map((resultA) => ({ resultA, resultB: resultsB.get(resultA.case_id) }))
    .filter(
      (pair): pair is { resultA: CaseResult; resultB: CaseResult } =>
        pair.resultB !== undefined && pair.resultA.passed !== pair.resultB.passed,
    );

  lines.push(``, `## Divergent cases`, ``);
  if (divergent.length === 0) {
    lines.push(`None — both providers pass and fail the same cases.`);
  } else {
    lines.push(`| Case | ${providerA} | ${providerB} | Differing assertions |`, `|---|---|---|---|`);
    for (const { resultA, resultB } of divergent) {
      const failedA = new Set(
        resultA.assertion_results.filter((x) => !x.passed).map((x) => x.assertion_id),
      );
      const failedB = new Set(
        resultB.assertion_results.filter((x) => !x.passed).map((x) => x.assertion_id),
      );
      const differing = [...new Set([...failedA, ...failedB])]
        .filter((id) => failedA.has(id) !== failedB.has(id))
        .map((id) => `\`${id}\``)
        .join(", ");
      lines.push(
        `| \`${resultA.case_id}\` | ${resultA.passed ? "✅" : "❌"} | ${
          resultB.passed ? "✅" : "❌"
        } | ${differing || "—"} |`,
      );
    }
  }

  return lines.join("\n") + "\n";
}
