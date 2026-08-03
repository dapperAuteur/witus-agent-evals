/**
 * Dataset loader (PRD §5.1: a dataset pack per agent).
 *
 * `datasets/<agent>/cases.jsonl` — one EvalCase per line, kept readable by
 * `{"$fixture": "relative/path"}` references resolved against the agent's
 * dataset dir before validation: `.json` fixtures parse as JSON (shared
 * assertion packs, the coach namespace map), anything else inlines as text
 * (field transcripts). Validation failures name the case and line — a bad
 * dataset never half-loads.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { EvalCaseSchema, type EvalCase } from "./models.js";

export const DEFAULT_DATASETS_DIR = "datasets";

const FIXTURE_KEY = "$fixture";

function isFixtureRef(value: unknown): value is { $fixture: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as Record<string, unknown>)[FIXTURE_KEY] === "string"
  );
}

function loadFixture(agentDir: string, ref: string): unknown {
  const path = join(agentDir, normalize(ref));
  if (!path.startsWith(agentDir)) {
    throw new Error(`Fixture ref "${ref}" escapes the dataset dir`);
  }
  if (!existsSync(path)) {
    throw new Error(`Fixture not found: ${path}`);
  }
  const text = readFileSync(path, "utf8");
  return ref.endsWith(".json") ? JSON.parse(text) : text;
}

/** Recursively resolve $fixture references. Exported for loader tests. */
export function resolveFixtures(value: unknown, agentDir: string): unknown {
  if (isFixtureRef(value)) {
    return loadFixture(agentDir, value[FIXTURE_KEY]);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveFixtures(item, agentDir));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveFixtures(item, agentDir)]),
    );
  }
  return value;
}

export function loadCases(
  agent: "field_reporter" | "coach_multiagent",
  datasetsDir: string = DEFAULT_DATASETS_DIR,
): EvalCase[] {
  const agentDir = join(datasetsDir, agent);
  const casesPath = join(agentDir, "cases.jsonl");
  if (!existsSync(casesPath)) {
    throw new Error(`No dataset at ${casesPath}`);
  }
  const lines = readFileSync(casesPath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  return lines.map((line, index) => {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (error) {
      throw new Error(
        `${casesPath}:${index + 1} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const resolved = resolveFixtures(raw, agentDir);
    const parsed = EvalCaseSchema.safeParse(resolved);
    if (!parsed.success) {
      const id = (raw as { id?: string }).id ?? `line ${index + 1}`;
      throw new Error(`Case "${id}" in ${casesPath} is invalid: ${parsed.error.message}`);
    }
    return parsed.data;
  });
}
