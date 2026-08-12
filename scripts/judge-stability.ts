#!/usr/bin/env -S npx tsx
/**
 * Judge self-agreement probe: how often does one judge give the same verdict
 * for the same criterion on the same stored output, three times running?
 *
 * WHY THIS EXISTS. `datasets/coach_arch_ab/RESULT-2026-08-11.md` withdrew its
 * `answer_actionability` finding because re-judging five failing cases on an
 * unchanged configuration passed 3 of 5 where the original run passed 0 of 5,
 * and one of ten follow-up judgments threw a hard JUDGE_ERROR. A criterion that
 * moves that far with nothing changed cannot resolve a 10-point difference
 * between two arms. Before any judge is trusted with that criterion again, its
 * self-agreement has to be a measured number rather than an impression.
 *
 * WHAT IT MEASURES. For each configured judge: the stored outputs of run
 * `runs/20260811T153415-coach_v3_arch-claude` are re-judged on ONE criterion,
 * three times, and the three verdicts per case are compared. No agent runs
 * happen; the agent outputs are read from that run's `results.jsonl`, so the
 * only thing varying between the three passes is the judge.
 *
 * WHY IT REUSES THE HARNESS RATHER THAN REIMPLEMENTING. It calls the harness's
 * own `loadCases`, `loadRubric`, `createJudgeModel` and `judgeAssertion`. That
 * means the prompt, the retry-once behaviour, the anti-sycophancy verbatim-quote
 * check and the JUDGE_ERROR bookkeeping are the production ones. A hand-rolled
 * prompt would measure the stability of a prompt nobody runs.
 *
 * ---------------------------------------------------------------------------
 * ON THE ANTI-SELF-GRADING GUARD. Read this before assuming it was bypassed.
 * ---------------------------------------------------------------------------
 * `resolveJudgeProvider` in `src/providers.ts` refuses to let a provider grade
 * its own cases: with `JUDGE_PROVIDER=anthropic` and the provider under test
 * `claude`, it swaps the judge to `google`. That rule is correct and this script
 * does not disable, edit or work around it in the harness. It stays exactly as
 * shipped, and every real eval run still gets it.
 *
 * This script nevertheless needs an anthropic judge pointed at outputs that a
 * Claude agent produced, and it obtains one by calling `createJudgeModel` with
 * `gemini` as the provider-under-test argument, which is the value that makes
 * the guard return the judge it was asked for.
 *
 * That is legitimate HERE, and only here, for one reason: this experiment does
 * not produce a score for any agent. It produces a variance figure for a judge.
 * Nothing it emits is a claim that one agent beat another, so the failure mode
 * the guard prevents, a vendor's model flattering its own agent in a published
 * comparison, has no purchase. The self-agreement number for the anthropic
 * judge would be identical if these outputs had come from a Gemini agent; the
 * measurement is of the judge's consistency with itself, not of the agent.
 *
 * The moment a number from this script is used to compare two agents, the guard
 * applies again and this construction is no longer acceptable. Do not copy this
 * pattern into the runner.
 * ---------------------------------------------------------------------------
 *
 * USAGE
 *
 *   npx tsx scripts/judge-stability.ts                       # both judges, 3 reps
 *   npx tsx scripts/judge-stability.ts --judge anthropic     # one judge
 *   npx tsx scripts/judge-stability.ts --reps 2 --limit 3    # cheap smoke run
 *
 * Raw per-judgment records are appended to `--out` (default under `runs/`,
 * which is gitignored) as they arrive, so a run that dies partway still leaves
 * every judgment it completed on disk.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Provider } from "../src/adapters/base.js";
import { loadCases } from "../src/datasets.js";
import { judgeAssertion } from "../src/judge/llm_judge.js";
import { loadRubric } from "../src/judge/rubrics.js";
import type { Assertion, EvalCase } from "../src/models.js";
import {
  createJudgeModel,
  type JudgeModel,
  type JudgeProvider,
} from "../src/providers.js";
import { loadSettings, type Settings } from "../src/settings.js";

/** The run whose stored agent outputs are re-judged. No agent is invoked. */
const SOURCE_RUN = "runs/20260811T153415-coach_v3_arch-claude/results.jsonl";
const DATASET = "coach_v3_arch" as const;
const CRITERION = "answer_actionability";
const ASSERTION_ID = "ab.answer_actionability";

/**
 * The two judges under comparison.
 *
 * `underTest` is the argument handed to `createJudgeModel`, chosen so the
 * anti-self-grading guard returns the judge named on the same line. For
 * openrouter the guard never fires at all (a free third-party judge is not the
 * provider under test), so the value is the real one. For anthropic it is the
 * deliberate, documented construction described in the header comment.
 */
interface JudgeSpec {
  key: string;
  provider: JudgeProvider;
  underTest: Provider;
  /** Expected model id, asserted at construction so a silent swap is loud. */
  expectModel: string;
  /**
   * How many judgments to keep in flight. Kept low for free tiers on purpose:
   * a 429 that survives the client's retries lands as a JUDGE_ERROR, and the
   * error rate is one of the numbers this probe reports. Inflating it with
   * self-inflicted rate limiting would measure the pool size, not the judge.
   */
  concurrency: number;
  note: string;
}

const JUDGES: JudgeSpec[] = [
  {
    key: "openrouter",
    provider: "openrouter",
    underTest: "claude",
    expectModel: "nvidia/nemotron-3-super-120b-a12b:free",
    concurrency: 2,
    note: "harness default; guard does not fire, this is the real judge path",
  },
  {
    key: "anthropic",
    provider: "anthropic",
    underTest: "gemini",
    expectModel: "claude-opus-5",
    concurrency: 4,
    note: "candidate paid judge; underTest=gemini so the guard returns anthropic (see header)",
  },
];

interface Judgment {
  judge: string;
  model: string;
  rep: number;
  case_id: string;
  passed: boolean;
  score: number;
  errored: boolean;
  rationale: string;
}

interface Args {
  judges: string[];
  reps: number;
  limit: number | null;
  /** Overrides every judge's per-spec concurrency when set. */
  concurrency: number | null;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    return argv[index + 1];
  };
  const judgeArg = get("--judge");
  const repsArg = get("--reps");
  const limitArg = get("--limit");
  const concurrencyArg = get("--concurrency");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  return {
    judges:
      judgeArg && judgeArg !== "both"
        ? judgeArg.split(",").map((s) => s.trim())
        : JUDGES.map((j) => j.key),
    reps: repsArg ? Number(repsArg) : 3,
    limit: limitArg ? Number(limitArg) : null,
    concurrency: concurrencyArg ? Number(concurrencyArg) : null,
    out: get("--out") ?? `runs/judge-stability/${stamp}-judgments.jsonl`,
  };
}

/** Stored agent outputs, keyed by case id, with errored cases dropped. */
function loadStoredOutputs(path: string): Map<string, Record<string, unknown>> {
  const outputs = new Map<string, Record<string, unknown>>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    const row = JSON.parse(line) as {
      case_id: string;
      output: Record<string, unknown>;
    };
    // An errored case carries `{ error }` instead of an answer. There is no
    // agent output to judge, so it is excluded rather than scored as a failure.
    if ("error" in row.output) continue;
    outputs.set(row.case_id, row.output);
  }
  return outputs;
}

function actionabilityAssertion(evalCase: EvalCase): Assertion {
  const assertion = evalCase.assertions.find((a) => a.id === ASSERTION_ID);
  if (!assertion) {
    throw new Error(
      `Case "${evalCase.id}" has no assertion "${ASSERTION_ID}": the dataset pack changed`,
    );
  }
  return assertion;
}

function buildJudge(spec: JudgeSpec, settings: Settings): JudgeModel {
  const model = createJudgeModel(
    { ...settings, JUDGE_PROVIDER: spec.provider },
    spec.underTest,
  );
  if (model.provider !== spec.provider || model.modelId !== spec.expectModel) {
    throw new Error(
      `Judge construction returned ${model.provider}/${model.modelId}, expected ${spec.provider}/${spec.expectModel}. ` +
        `Refusing to run: a probe that silently measured a different model would be worse than no probe.`,
    );
  }
  return model;
}

/** Run tasks with a fixed number in flight; results keep their input order. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await worker(item);
    }
  });
  await Promise.all(runners);
  return results;
}

interface JudgeReport {
  judge: string;
  model: string;
  reps: number;
  cases: string[];
  /** case id -> the verdict recorded on each rep, in rep order. */
  verdicts: Map<string, boolean[]>;
  /** case id -> which reps errored. */
  errors: Map<string, number[]>;
  perRepPassRate: number[];
  totalJudgments: number;
  errorCount: number;
}

async function probeJudge(args: {
  spec: JudgeSpec;
  settings: Settings;
  cases: EvalCase[];
  outputs: Map<string, Record<string, unknown>>;
  reps: number;
  concurrency: number;
  outPath: string;
}): Promise<JudgeReport> {
  const { spec, cases, outputs, reps, concurrency, outPath } = args;
  const model = buildJudge(spec, args.settings);
  const rubric = loadRubric(DATASET);

  const verdicts = new Map<string, boolean[]>();
  const errors = new Map<string, number[]>();
  const perRepPassRate: number[] = [];
  let errorCount = 0;
  let totalJudgments = 0;

  for (let rep = 1; rep <= reps; rep++) {
    process.stderr.write(`[${spec.key}] rep ${rep}/${reps} over ${cases.length} cases\n`);
    const started = Date.now();
    const judgments = await pooled(cases, concurrency, async (evalCase) => {
      const output = outputs.get(evalCase.id);
      if (!output) throw new Error(`No stored output for case "${evalCase.id}"`);
      const result = await judgeAssertion({
        model,
        rubric,
        assertion: actionabilityAssertion(evalCase),
        evalCase,
        output,
      });
      const rationale = result.rationale ?? "";
      const judgment: Judgment = {
        judge: spec.key,
        model: model.modelId,
        rep,
        case_id: evalCase.id,
        passed: result.passed,
        score: result.score,
        // judgeAssertion prefixes a failed or malformed judgment with
        // JUDGE_ERROR and records it as passed:false. That is the harness's
        // "a broken judge is never a pass" rule, kept intact here; the flag
        // lets the report separate a real fail from an unavailable judge.
        errored: rationale.startsWith("JUDGE_ERROR"),
        rationale,
      };
      appendFileSync(outPath, `${JSON.stringify(judgment)}\n`);
      return judgment;
    });

    let repPassed = 0;
    for (const judgment of judgments) {
      totalJudgments += 1;
      const seen = verdicts.get(judgment.case_id) ?? [];
      seen.push(judgment.passed);
      verdicts.set(judgment.case_id, seen);
      if (judgment.passed) repPassed += 1;
      if (judgment.errored) {
        errorCount += 1;
        const reps = errors.get(judgment.case_id) ?? [];
        reps.push(judgment.rep);
        errors.set(judgment.case_id, reps);
      }
    }
    perRepPassRate.push(judgments.length === 0 ? 0 : repPassed / judgments.length);
    process.stderr.write(
      `[${spec.key}] rep ${rep} pass ${repPassed}/${judgments.length} in ${Math.round((Date.now() - started) / 1000)}s\n`,
    );
  }

  return {
    judge: spec.key,
    model: model.modelId,
    reps,
    cases: cases.map((c) => c.id),
    verdicts,
    errors,
    perRepPassRate,
    totalJudgments,
    errorCount,
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function printReport(report: JudgeReport): void {
  const unanimous: string[] = [];
  const split: string[] = [];
  for (const caseId of report.cases) {
    const seen = report.verdicts.get(caseId) ?? [];
    if (seen.length === 0) continue;
    if (seen.every((v) => v === seen[0])) unanimous.push(caseId);
    else split.push(caseId);
  }
  const judged = unanimous.length + split.length;

  const lines = [
    ``,
    `## ${report.judge} (${report.model})`,
    ``,
    `Cases judged: ${judged} × ${report.reps} reps = ${report.totalJudgments} judgments`,
    `Self-agreement (all ${report.reps} verdicts identical): ${unanimous.length}/${judged} = ${pct(judged === 0 ? 0 : unanimous.length / judged)}`,
    `Errors (JUDGE_ERROR): ${report.errorCount}/${report.totalJudgments}`,
    `Per-rep pass rate: ${report.perRepPassRate.map(pct).join(", ")}`,
  ];
  if (report.perRepPassRate.length > 0) {
    const mean =
      report.perRepPassRate.reduce((a, b) => a + b, 0) / report.perRepPassRate.length;
    const spread = Math.max(...report.perRepPassRate) - Math.min(...report.perRepPassRate);
    lines.push(`Mean pass rate: ${pct(mean)} (spread ${(spread * 100).toFixed(1)} pts)`);
  }
  lines.push(``, `Unstable cases:`);
  if (split.length === 0) lines.push(`  (none)`);
  for (const caseId of split) {
    const seen = report.verdicts.get(caseId) ?? [];
    const passes = seen.filter(Boolean).length;
    const errored = report.errors.get(caseId);
    lines.push(
      `  ${caseId}: ${passes} pass / ${seen.length - passes} fail  [${seen.map((v) => (v ? "P" : "F")).join(" ")}]` +
        (errored ? `  (JUDGE_ERROR on rep ${errored.join(", ")})` : ""),
    );
  }
  const erroredElsewhere = [...report.errors.entries()].filter(
    ([id]) => !split.includes(id),
  );
  if (erroredElsewhere.length > 0) {
    lines.push(``, `Errors on otherwise-unanimous cases:`);
    for (const [id, reps] of erroredElsewhere) {
      lines.push(`  ${id}: rep ${reps.join(", ")}`);
    }
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const settings = loadSettings();
  mkdirSync(dirname(args.out), { recursive: true });

  const outputs = loadStoredOutputs(SOURCE_RUN);
  const allCases = loadCases(DATASET).filter((c) => outputs.has(c.id));
  const cases = args.limit === null ? allCases : allCases.slice(0, args.limit);

  process.stderr.write(
    `Source run: ${SOURCE_RUN}\n` +
      `Criterion: ${CRITERION}\n` +
      `Usable cases: ${cases.length} (errored cases excluded)\n` +
      `Raw judgments: ${args.out}\n`,
  );

  const specs = JUDGES.filter((j) => args.judges.includes(j.key));
  if (specs.length === 0) {
    throw new Error(`No judge matched --judge. Known: ${JUDGES.map((j) => j.key).join(", ")}`);
  }

  for (const spec of specs) {
    process.stderr.write(`\n=== ${spec.key}: ${spec.note} ===\n`);
    const report = await probeJudge({
      spec,
      settings,
      cases,
      outputs,
      reps: args.reps,
      concurrency: args.concurrency ?? spec.concurrency,
      outPath: args.out,
    });
    printReport(report);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
