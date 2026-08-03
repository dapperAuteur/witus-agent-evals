/**
 * YAML rubric loader (PRD §7: rubrics are versioned, diff-able files).
 *
 * A rubric pack maps criterion keys (what cases name in
 * `assertion.criterion`) to a description + judging guidance. Loading
 * validates the shape; an unknown criterion at judge time throws — a case
 * naming a criterion the rubric doesn't define is a dataset bug, never a
 * silent skip.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";

export const RubricCriterionSchema = z.object({
  description: z.string().min(1),
  guidance: z.string().min(1),
});
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

export const RubricSchema = z.object({
  agent: z.string().min(1),
  criteria: z.record(z.string(), RubricCriterionSchema),
});
export type Rubric = z.infer<typeof RubricSchema>;

export type RubricAgent = "field_reporter" | "coach_multiagent";

/** Load and validate the rubric pack shipped for an agent. */
export function loadRubric(agent: RubricAgent): Rubric {
  const path = fileURLToPath(new URL(`./rubrics/${agent}.yaml`, import.meta.url));
  return RubricSchema.parse(parse(readFileSync(path, "utf8")));
}

/** Resolve a criterion or throw — a missing criterion is a dataset bug. */
export function getCriterion(rubric: Rubric, key: string): RubricCriterion {
  const criterion = rubric.criteria[key];
  if (!criterion) {
    throw new Error(
      `Criterion "${key}" is not in the ${rubric.agent} rubric. Defined: ${Object.keys(rubric.criteria).join(", ")}`,
    );
  }
  return criterion;
}
