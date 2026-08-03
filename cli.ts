/**
 * CLI entrypoint (`pnpm evals ...`), PRD §9.
 *
 * Exit codes: 0 clean, 1 usage/config error, 2 run finished but found
 * regressions (CI can gate on it).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { registerBuiltinAdapters } from "./src/adapters/index.js";
import type { Provider } from "./src/adapters/base.js";
import { registerDeterministicChecks } from "./src/checks/deterministic.js";
import { loadCases } from "./src/datasets.js";
import { JUDGE_PROVIDERS, type JudgeProvider } from "./src/judge/config.js";
import type { RubricAgent } from "./src/judge/rubrics.js";
import { makeComparison, makeReport } from "./src/report.js";
import { runEval, type RunOutcome } from "./src/runner.js";
import { loadSettings, type Settings } from "./src/settings.js";
import {
  DEFAULT_RUNS_DIR,
  listRuns,
  loadResults,
  loadSummary,
} from "./src/storage.js";

const USAGE = `witus-agent-evals — eval harness for WitUS LangGraph agents

Usage:
  pnpm evals run --agent <field_reporter|coach_multiagent> --provider <claude|gemini|all>
                 [--baseline <run_id>] [--limit N] [--judge <provider>] [--threshold X]
  pnpm evals report --run <run_id>
  pnpm evals compare --run-a <run_id> --run-b <run_id>
  pnpm evals runs

Notes:
  --judge      override the judge provider (${JUDGE_PROVIDERS.join("|")});
               default is the free cerebras judge, and the judge is never the
               provider under test.
  --threshold  weighted pass threshold per case (default 1.0 = all assertions).
  Agent output is cached under runs/cache/ — re-running re-judges without
  re-running agents. Exit code 2 signals regressions.
`;

const AGENTS: RubricAgent[] = ["field_reporter", "coach_multiagent"];

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) fail(`Unexpected argument "${arg}"`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) fail(`Flag ${arg} needs a value`);
    flags[arg.slice(2)] = value!;
    i += 1;
  }
  return flags;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}`);
  process.exit(1);
}

function writeReport(runsDir: string, outcome: RunOutcome): string {
  const path = join(outcome.runDir, "report.md");
  writeFileSync(path, makeReport(outcome.summary, outcome.results));
  return path;
}

async function commandRun(flags: Record<string, string>): Promise<number> {
  const agent = flags["agent"] as RubricAgent | undefined;
  if (!agent || !AGENTS.includes(agent)) {
    fail(`--agent must be one of: ${AGENTS.join(", ")}`);
  }
  const providerFlag = flags["provider"];
  if (!providerFlag || !["claude", "gemini", "all"].includes(providerFlag)) {
    fail(`--provider must be claude, gemini, or all`);
  }
  const providers: Provider[] =
    providerFlag === "all" ? ["claude", "gemini"] : [providerFlag as Provider];

  let settings: Settings = loadSettings();
  const judge = flags["judge"];
  if (judge !== undefined) {
    if (!JUDGE_PROVIDERS.includes(judge as JudgeProvider)) {
      fail(`--judge must be one of: ${JUDGE_PROVIDERS.join(", ")}`);
    }
    settings = { ...settings, JUDGE_PROVIDER: judge as JudgeProvider };
  }

  registerDeterministicChecks();
  registerBuiltinAdapters(settings);
  const cases = loadCases(agent);
  const runsDir = flags["runs-dir"] ?? DEFAULT_RUNS_DIR;

  const outcomes: RunOutcome[] = [];
  for (const provider of providers) {
    process.stdout.write(`\n▶ ${agent} × ${provider} (${cases.length} cases)\n`);
    const outcome = await runEval({
      agent,
      provider,
      cases,
      settings,
      runsDir,
      ...(flags["baseline"] !== undefined ? { baselineRunId: flags["baseline"] } : {}),
      ...(flags["limit"] !== undefined ? { limit: Number(flags["limit"]) } : {}),
      ...(flags["threshold"] !== undefined
        ? { passThreshold: Number(flags["threshold"]) }
        : {}),
    });
    const reportPath = writeReport(runsDir, outcome);
    outcomes.push(outcome);
    process.stdout.write(
      [
        `  run_id     ${outcome.runId}`,
        `  pass rate  ${(outcome.summary.pass_rate * 100).toFixed(1)}% (${outcome.summary.n_cases} cases, ${outcome.erroredCases} errored)`,
        `  regressions ${outcome.summary.regressions.length > 0 ? outcome.summary.regressions.join(", ") : "none"}`,
        `  report     ${reportPath}`,
        `  inbox alert ${outcome.alert}`,
        ``,
      ].join("\n"),
    );
  }

  if (outcomes.length === 2) {
    const [a, b] = outcomes as [RunOutcome, RunOutcome];
    const comparison = makeComparison(
      { summary: a.summary, results: a.results },
      { summary: b.summary, results: b.results },
    );
    const path = join(runsDir, `compare-${a.runId}-vs-${b.runId}.md`);
    writeFileSync(path, comparison);
    process.stdout.write(`▶ provider comparison → ${path}\n`);
  }

  return outcomes.some((o) => o.summary.regressions.length > 0) ? 2 : 0;
}

function commandReport(flags: Record<string, string>): number {
  const runId = flags["run"] ?? fail("--run <run_id> is required");
  const runsDir = flags["runs-dir"] ?? DEFAULT_RUNS_DIR;
  const report = makeReport(loadSummary(runsDir, runId), loadResults(runsDir, runId));
  writeFileSync(join(runsDir, runId, "report.md"), report);
  process.stdout.write(report);
  return 0;
}

function commandCompare(flags: Record<string, string>): number {
  const runA = flags["run-a"] ?? fail("--run-a <run_id> is required");
  const runB = flags["run-b"] ?? fail("--run-b <run_id> is required");
  const runsDir = flags["runs-dir"] ?? DEFAULT_RUNS_DIR;
  const comparison = makeComparison(
    { summary: loadSummary(runsDir, runA), results: loadResults(runsDir, runA) },
    { summary: loadSummary(runsDir, runB), results: loadResults(runsDir, runB) },
  );
  const path = join(runsDir, `compare-${runA}-vs-${runB}.md`);
  writeFileSync(path, comparison);
  process.stdout.write(comparison);
  process.stdout.write(`\n(written to ${path})\n`);
  return 0;
}

function commandRuns(flags: Record<string, string>): number {
  const runsDir = flags["runs-dir"] ?? DEFAULT_RUNS_DIR;
  const runs = listRuns(runsDir);
  if (runs.length === 0) {
    process.stdout.write(`No runs in ${runsDir}/ yet.\n`);
    return 0;
  }
  for (const runId of runs) {
    const summary = loadSummary(runsDir, runId);
    process.stdout.write(
      `${runId}  ${(summary.pass_rate * 100).toFixed(1).padStart(5)}%  ${summary.n_cases} cases${summary.regressions.length > 0 ? `  ⚠️ ${summary.regressions.length} regressions` : ""}\n`,
    );
  }
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const command = argv[0];
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }
  const flags = parseFlags(argv.slice(1));
  switch (command) {
    case "run":
      return commandRun(flags);
    case "report":
      return commandReport(flags);
    case "compare":
      return commandCompare(flags);
    case "runs":
      return commandRuns(flags);
    default:
      fail(`Unknown command "${command}"`);
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
