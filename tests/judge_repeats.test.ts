/**
 * Repeated model-graded judging (JUDGE_REPEATS).
 *
 * The premise, from the 2026-08-12 stability probe: re-judging one criterion
 * three times on unchanged inputs moved the pass rate 15 points with the free
 * judge and 10 points with claude-opus-5. So the harness votes, and publishes
 * how close the vote was. The first test in this file is the one that matters
 * most: at the default of 1, nothing about the old path changes.
 */
import { describe, expect, it } from "vitest";
import type { Assertion, EvalCase } from "../src/models.js";
import { AssertionResultSchema } from "../src/models.js";
import type { JudgeModel } from "../src/providers.js";
import { judgeAssertion, judgeAssertionRepeated } from "../src/judge/llm_judge.js";
import { loadRubric } from "../src/judge/rubrics.js";
import { loadSettings } from "../src/settings.js";

const rubric = loadRubric("field_reporter");

const assertion: Assertion = {
  id: "fr.grounded",
  kind: "model_graded",
  description: "Every factual claim is supported by the source material",
  check: null,
  params: {},
  criterion: "grounded",
  weight: 1,
};

const evalCase: EvalCase = {
  id: "fr-easy-001",
  agent: "field_reporter",
  input: { capture: "notes about the Eiffel Tower" },
  metadata: {},
  assertions: [assertion],
};

const output = { body: "The Eiffel Tower opened in 1889. Drink water." };

/** Replays scripted replies in order; an Error entry throws that call. */
function fakeModel(replies: Array<string | Error>): JudgeModel & { calls: number } {
  const model = {
    provider: "cerebras" as const,
    modelId: "fake-model",
    calls: 0,
    async invoke(): Promise<string> {
      const reply = replies[model.calls];
      model.calls += 1;
      if (reply === undefined) throw new Error("fake model exhausted");
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return model;
}

const pass = (score = 0.9, rationale = "Supported by the capture notes.") =>
  JSON.stringify({
    score,
    passed: true,
    rationale,
    evidence_span: "The Eiffel Tower opened in 1889.",
  });

const fail = (score = 0.2, rationale = "Invents a renovation not in the source.") =>
  JSON.stringify({ score, passed: false, rationale, evidence_span: "" });

/** A judgment that errors: judgeOnce retries once, so it eats two calls. */
const errored = (): Array<string | Error> => [
  new Error("rate limited"),
  new Error("rate limited"),
];

describe("JUDGE_REPEATS default of 1 changes nothing", () => {
  it("defaults to 1 and coerces a configured value", () => {
    expect(loadSettings({} as NodeJS.ProcessEnv).JUDGE_REPEATS).toBe(1);
    expect(loadSettings({ JUDGE_REPEATS: "3" } as NodeJS.ProcessEnv).JUDGE_REPEATS).toBe(3);
  });

  it("rejects zero, negatives, and non-numbers rather than judging zero times", () => {
    expect(() => loadSettings({ JUDGE_REPEATS: "0" } as NodeJS.ProcessEnv)).toThrow();
    expect(() => loadSettings({ JUDGE_REPEATS: "-2" } as NodeJS.ProcessEnv)).toThrow();
    expect(() => loadSettings({ JUDGE_REPEATS: "2.5" } as NodeJS.ProcessEnv)).toThrow();
    expect(() => loadSettings({ JUDGE_REPEATS: "lots" } as NodeJS.ProcessEnv)).toThrow();
  });

  it("repeats=1 returns exactly what judgeAssertion returns, with no extra fields", async () => {
    const once = await judgeAssertion({
      model: fakeModel([pass()]),
      rubric,
      assertion,
      evalCase,
      output,
    });
    const model = fakeModel([pass()]);
    const repeated = await judgeAssertionRepeated({
      model,
      rubric,
      assertion,
      evalCase,
      output,
      repeats: 1,
    });

    expect(repeated).toEqual(once);
    expect(model.calls).toBe(1); // one judgment, one call
    // Serialization is the contract the frozen baselines depend on.
    expect(Object.keys(AssertionResultSchema.parse(repeated))).toEqual([
      "assertion_id",
      "passed",
      "score",
      "rationale",
    ]);
    expect(JSON.stringify(AssertionResultSchema.parse(repeated))).not.toContain("judgments");
  });

  it("repeats=1 on a broken judge is still the plain JUDGE_ERROR result", async () => {
    const result = await judgeAssertionRepeated({
      model: fakeModel(errored()),
      rubric,
      assertion,
      evalCase,
      output,
      repeats: 1,
    });
    expect(result.rationale).toContain("JUDGE_ERROR");
    expect(result.judgments).toBeUndefined();
  });

  it("rejects a non-positive or fractional repeat count", async () => {
    await expect(
      judgeAssertionRepeated({
        model: fakeModel([]),
        rubric,
        assertion,
        evalCase,
        output,
        repeats: 0,
      }),
    ).rejects.toThrow(/positive integer/);
  });
});

describe("majority verdict and its agreement", () => {
  it("2 pass + 1 fail is a pass at 2 of 3 agreement", async () => {
    const model = fakeModel([pass(0.9), fail(), pass(0.7)]);
    const result = await judgeAssertionRepeated({
      model,
      rubric,
      assertion,
      evalCase,
      output,
      repeats: 3,
    });

    expect(result.passed).toBe(true);
    expect(result.judgments).toBe(3);
    expect(result.judgments_agreeing).toBe(2);
    expect(result.judgments_errored).toBe(0);
    expect(result.judgment_tied).toBeUndefined();
    expect(result.score).toBeCloseTo(0.8); // mean of the winning side
    expect(result.rationale).toContain("majority 2 of 3");
    expect(model.calls).toBe(3);
  });

  it("2 fail + 1 pass is a fail at 2 of 3 agreement", async () => {
    const result = await judgeAssertionRepeated({
      model: fakeModel([fail(), pass(), fail()]),
      rubric,
      assertion,
      evalCase,
      output,
      repeats: 3,
    });
    expect(result.passed).toBe(false);
    expect(result.judgments_agreeing).toBe(2);
    expect(result.rationale).not.toContain("JUDGE_ERROR");
  });

  it("three judgments that agree record 3 of 3", async () => {
    const unanimousPass = await judgeAssertionRepeated({
      model: fakeModel([pass(), pass(), pass()]),
      rubric,
      assertion,
      evalCase,
      output,
      repeats: 3,
    });
    expect(unanimousPass.passed).toBe(true);
    expect(unanimousPass.judgments_agreeing).toBe(3);
    expect(unanimousPass.judgments).toBe(3);

    const unanimousFail = await judgeAssertionRepeated({
      model: fakeModel([fail(), fail(), fail()]),
      rubric,
      assertion,
      evalCase,
      output,
      repeats: 3,
    });
    expect(unanimousFail.passed).toBe(false);
    expect(unanimousFail.judgments_agreeing).toBe(3);
  });

  it("carries the winning side's rationale, not a losing one", async () => {
    const result = await judgeAssertionRepeated({
      model: fakeModel([
        fail(0.2, "hallucinated date"),
        pass(0.9, "every claim traces to a source"),
        pass(0.9, "second passing rationale"),
      ]),
      rubric,
      assertion,
      evalCase,
      output,
      repeats: 3,
    });
    expect(result.rationale).toContain("every claim traces to a source");
    expect(result.rationale).not.toContain("hallucinated date");
  });
});

describe("an errored judgment is excluded from the vote, never a fail vote", () => {
  it("one error plus two passes still passes, and records the error", async () => {
    const result = await judgeAssertionRepeated({
      model: fakeModel([pass(), ...errored(), pass()]),
      rubric,
      assertion,
      evalCase,
      output,
      repeats: 3,
    });

    expect(result.passed).toBe(true);
    expect(result.judgments).toBe(3);
    expect(result.judgments_agreeing).toBe(2);
    expect(result.judgments_errored).toBe(1);
    expect(result.rationale).toContain("1 errored");
  });

  it("two errors and one pass is ERRORED, not failed, because no majority voted", async () => {
    // If errors were counted as fail votes this would read as a clean 2-1 fail,
    // which is the harness claiming evidence about the agent that it never got.
    const result = await judgeAssertionRepeated({
      model: fakeModel([pass(), ...errored(), ...errored()]),
      rubric,
      assertion,
      evalCase,
      output,
      repeats: 3,
    });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.rationale).toContain("JUDGE_ERROR");
    expect(result.rationale).toContain("1 of 3 judgments succeeded");
    expect(result.judgments).toBe(3);
    expect(result.judgments_agreeing).toBe(0);
    expect(result.judgments_errored).toBe(2);
  });

  it("an error that splits the survivors is a tie, so it fails and is marked", async () => {
    const result = await judgeAssertionRepeated({
      model: fakeModel([pass(), ...errored(), fail()]),
      rubric,
      assertion,
      evalCase,
      output,
      repeats: 3,
    });
    expect(result.passed).toBe(false);
    expect(result.judgment_tied).toBe(true);
    expect(result.judgments_agreeing).toBe(1);
    expect(result.judgments_errored).toBe(1);
  });
});

describe("a tie is a failure, not a pass", () => {
  it("an even repeat count that splits records a failure and marks it tied", async () => {
    const result = await judgeAssertionRepeated({
      model: fakeModel([pass(), fail()]),
      rubric,
      assertion,
      evalCase,
      output,
      repeats: 2,
    });

    expect(result.passed).toBe(false);
    expect(result.judgment_tied).toBe(true);
    expect(result.judgments).toBe(2);
    expect(result.judgments_agreeing).toBe(1);
    expect(result.rationale).toContain("tie");
    expect(result.rationale).toContain("recorded as a failure");
  });

  it("an even count that agrees is not marked tied", async () => {
    const result = await judgeAssertionRepeated({
      model: fakeModel([pass(), pass()]),
      rubric,
      assertion,
      evalCase,
      output,
      repeats: 2,
    });
    expect(result.passed).toBe(true);
    expect(result.judgment_tied).toBeUndefined();
    expect(result.judgments_agreeing).toBe(2);
  });
});

describe("dataset bugs still throw before any model call", () => {
  it("throws on a deterministic assertion instead of judging it repeatedly", async () => {
    const model = fakeModel([]);
    await expect(
      judgeAssertionRepeated({
        model,
        rubric,
        assertion: { ...assertion, kind: "deterministic", criterion: null },
        evalCase,
        output,
        repeats: 3,
      }),
    ).rejects.toThrow(/model_graded/);
    expect(model.calls).toBe(0);
  });
});

describe("repeat bookkeeping round-trips through the schema", () => {
  it("keeps the fields on the way to disk and back", () => {
    const value = {
      assertion_id: "fr.grounded",
      passed: false,
      score: 0.3,
      rationale: "[tie 1-1 of 2 judgments, recorded as a failure] r",
      judgments: 2,
      judgments_agreeing: 1,
      judgments_errored: 0,
      judgment_tied: true,
    };
    const parsed = AssertionResultSchema.parse(value);
    expect(AssertionResultSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("leaves the fields absent on a legacy single-judgment row", () => {
    const parsed = AssertionResultSchema.parse({
      assertion_id: "fr.grounded",
      passed: true,
      score: 1,
      rationale: "ok",
    });
    expect(parsed.judgments).toBeUndefined();
    expect(JSON.stringify(parsed)).toBe(
      '{"assertion_id":"fr.grounded","passed":true,"score":1,"rationale":"ok"}',
    );
  });
});
