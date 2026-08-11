#!/usr/bin/env node
/**
 * Materialize the two architecture-A/B arm dataset packs from one canonical
 * case file.
 *
 * WHY THIS EXISTS. The CLI keys the dataset directory off `--agent`, so the two
 * arms need two directories. Two hand-maintained case files drift, and a drifted
 * case file makes the comparison meaningless without making it look broken. So
 * `datasets/coach_arch_ab/cases.jsonl` is canonical and this script stamps the
 * arms from it. Edit the canonical file, run this, commit both.
 *
 *   node scripts/build-ab-arms.mjs
 *
 * The only per-arm difference is the `agent` field, which is the ADAPTER the
 * runner resolves from the registry. Note it is not the same as the CLI's
 * `--agent`: arm B's directory is `coach_v3_arch` (so it gets its own rubric)
 * while its cases name the `coach_multiagent` adapter (so the real coach runs).
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CANONICAL = "datasets/coach_arch_ab";
const KB_SOURCE = "datasets/coach_multiagent/kb_fixtures";

/** CLI --agent name (and dataset dir) -> adapter registry key under test. */
const ARMS = {
  coach_v2_arch: "coach_v2_arch",
  coach_v3_arch: "coach_multiagent",
};

const cases = readFileSync(join(CANONICAL, "cases.jsonl"), "utf8")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

for (const [arm, adapter] of Object.entries(ARMS)) {
  const dir = join("datasets", arm);
  mkdirSync(dir, { recursive: true });
  cpSync(
    join(CANONICAL, "assertion_pack.json"),
    join(dir, "assertion_pack.json"),
  );
  rmSync(join(dir, "kb_fixtures"), { recursive: true, force: true });
  cpSync(KB_SOURCE, join(dir, "kb_fixtures"), { recursive: true });
  writeFileSync(
    join(dir, "cases.jsonl"),
    cases.map((c) => JSON.stringify({ ...c, agent: adapter })).join("\n") + "\n",
  );
  writeFileSync(
    join(dir, "GENERATED.md"),
    [
      "# Generated. Do not hand-edit.",
      "",
      "Materialized from `datasets/coach_arch_ab/cases.jsonl` by",
      "`scripts/build-ab-arms.mjs`. That file is canonical. This copy exists only",
      "because the CLI keys the dataset directory off `--agent`. Edit the canonical",
      "file and re-run the script, or the two arms drift and the comparison stops",
      "meaning anything.",
      "",
      `CLI agent: \`${arm}\``,
      `Adapter under test: \`${adapter}\``,
      `Rubric: \`src/judge/rubrics/${arm}.yaml\` (identical body in both arms)`,
      "",
    ].join("\n"),
  );
  process.stdout.write(`${arm}: ${cases.length} cases -> adapter ${adapter}\n`);
}
