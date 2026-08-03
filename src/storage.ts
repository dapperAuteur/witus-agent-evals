/**
 * Result storage (PRD §5.2: JSONL under runs/<run_id>/) and the cross-run
 * agent-output cache (PRD §11: re-judging must not re-run an agent).
 *
 * Layout:
 *   runs/<run_id>/results.jsonl   one CaseResult per line
 *   runs/<run_id>/summary.json    the RunSummary
 *   runs/cache/<agent>/<case_id>.<provider>.<hash8>.json   AdapterOutput
 *
 * Reads zod-validate — a corrupt artifact fails loudly, never half-parses.
 * The cache key hashes the case INPUT, so editing a case in the dataset
 * invalidates its cached output automatically.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { AdapterOutput, Provider } from "./adapters/base.js";
import {
  CaseResultSchema,
  RunSummarySchema,
  type CaseResult,
  type RunSummary,
} from "./models.js";

/** Persisted AdapterOutput (validated loosely — agent output is agent-shaped). */
const CachedOutputSchema = z.object({
  output: z.record(z.string(), z.unknown()),
  trace_ref: z.string().nullable(),
  telemetry: z.object({
    tool_calls: z.number(),
    latency_ms: z.number(),
    revisions: z.number().optional(),
    rev0_draft: z.record(z.string(), z.unknown()).optional(),
    invoked_specialists: z.array(z.string()).optional(),
  }),
});

export const DEFAULT_RUNS_DIR = "runs";

export function saveRun(
  runsDir: string,
  runId: string,
  results: CaseResult[],
  summary: RunSummary,
): { runDir: string } {
  const runDir = join(runsDir, runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, "results.jsonl"),
    results.map((r) => JSON.stringify(CaseResultSchema.parse(r))).join("\n") + "\n",
  );
  writeFileSync(
    join(runDir, "summary.json"),
    JSON.stringify(RunSummarySchema.parse(summary), null, 2) + "\n",
  );
  return { runDir };
}

export function loadSummary(runsDir: string, runId: string): RunSummary {
  const path = join(runsDir, runId, "summary.json");
  if (!existsSync(path)) {
    throw new Error(
      `No run summary at ${path} — known runs: ${listRuns(runsDir).join(", ") || "(none)"}`,
    );
  }
  return RunSummarySchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function loadResults(runsDir: string, runId: string): CaseResult[] {
  const path = join(runsDir, runId, "results.jsonl");
  if (!existsSync(path)) {
    throw new Error(`No results at ${path}`);
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => CaseResultSchema.parse(JSON.parse(line)));
}

/** Run ids on disk, oldest-first (directory names are timestamp-prefixed). */
export function listRuns(runsDir: string): string[] {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "cache")
    .map((entry) => entry.name)
    .sort();
}

function cachePath(
  runsDir: string,
  agent: string,
  caseId: string,
  provider: Provider,
  input: Record<string, unknown>,
): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 8);
  return join(runsDir, "cache", agent, `${caseId}.${provider}.${hash}.json`);
}

export function cacheGet(
  runsDir: string,
  agent: string,
  caseId: string,
  provider: Provider,
  input: Record<string, unknown>,
): AdapterOutput | null {
  const path = cachePath(runsDir, agent, caseId, provider, input);
  if (!existsSync(path)) return null;
  return CachedOutputSchema.parse(
    JSON.parse(readFileSync(path, "utf8")),
  ) as AdapterOutput;
}

export function cachePut(
  runsDir: string,
  agent: string,
  caseId: string,
  provider: Provider,
  input: Record<string, unknown>,
  output: AdapterOutput,
): void {
  const path = cachePath(runsDir, agent, caseId, provider, input);
  mkdirSync(join(runsDir, "cache", agent), { recursive: true });
  writeFileSync(path, JSON.stringify(CachedOutputSchema.parse(output), null, 2));
}
