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
  /**
   * Case-metadata keys this rubric's judge is allowed to see, injected into the
   * prompt as a CASE METADATA block.
   *
   * OPT-IN ON PURPOSE. Adding metadata changes the judge prompt, which changes
   * scores, which breaks comparability with every frozen baseline scored without
   * it. Rubrics that omit this field get the exact prompt they always got.
   *
   * The A/B rubrics use it because a completeness criterion that lets the judge
   * infer the domain list from the ANSWER rewards omission: an arm that ignores
   * a domain entirely can be judged only on the domain it did cover, and pass.
   * Both arms must be scored against the same fixed list.
   */
  include_metadata_keys: z.array(z.string().min(1)).optional(),
  criteria: z.record(z.string(), RubricCriterionSchema),
});
export type Rubric = z.infer<typeof RubricSchema>;

export type RubricAgent =
  | "field_reporter"
  | "coach_multiagent"
  // Architecture A/B arms. Both load an identical rubric body; they are separate
  // names only because loadRubric() and the dataset dir both key off the agent.
  | "coach_v2_arch"
  | "coach_v3_arch";

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
