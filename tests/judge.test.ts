import { describe, expect, it } from "vitest";
import type { Assertion, EvalCase } from "../src/models.js";
import type { JudgeModel } from "../src/providers.js";
import { resolveJudgeProvider, createJudgeModel } from "../src/providers.js";
import { judgeAssertion, JudgeVerdictSchema } from "../src/judge/llm_judge.js";
import { getCriterion, loadRubric } from "../src/judge/rubrics.js";
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

// The judged output; evidence spans must be verbatim from its JSON serialization.
const output = { body: "The Eiffel Tower opened in 1889. Drink water." };

/** A fake judge model that replays scripted replies and counts invocations. */
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

const passVerdict = JSON.stringify({
  score: 0.9,
  passed: true,
  rationale: "The opening date is supported by the capture notes.",
  evidence_span: "The Eiffel Tower opened in 1889.",
});

describe("judgeAssertion — happy path", () => {
  it("returns the verdict when output is valid and evidence is verbatim", async () => {
    const model = fakeModel([passVerdict]);
    const result = await judgeAssertion({ model, rubric, assertion, evalCase, output });
    expect(result).toEqual({
      assertion_id: "fr.grounded",
      passed: true,
      score: 0.9,
      rationale: "The opening date is supported by the capture notes.",
    });
    expect(model.calls).toBe(1);
  });

  it("accepts JSON wrapped in code fences and prose", async () => {
    const model = fakeModel(["Here you go:\n```json\n" + passVerdict + "\n```"]);
    const result = await judgeAssertion({ model, rubric, assertion, evalCase, output });
    expect(result.passed).toBe(true);
  });

  it("a failing verdict does not require an evidence span", async () => {
    const failVerdict = JSON.stringify({
      score: 0.2,
      passed: false,
      rationale: "The draft invents a 1901 renovation not in the source.",
      evidence_span: "",
    });
    const model = fakeModel([failVerdict]);
    const result = await judgeAssertion({ model, rubric, assertion, evalCase, output });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.2);
    expect(result.rationale).not.toContain("JUDGE_ERROR");
  });
});

describe("judgeAssertion — the brief's test_judge_contract", () => {
  it("malformed output retries once, then returns an error result (not a pass)", async () => {
    const model = fakeModel(["I think it looks great!", "still not json"]);
    const result = await judgeAssertion({ model, rubric, assertion, evalCase, output });
    expect(model.calls).toBe(2); // exactly one retry
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.rationale).toContain("JUDGE_ERROR");
  });

  it("malformed output then a valid verdict succeeds on the retry", async () => {
    const model = fakeModel(["oops", passVerdict]);
    const result = await judgeAssertion({ model, rubric, assertion, evalCase, output });
    expect(model.calls).toBe(2);
    expect(result.passed).toBe(true);
    expect(result.rationale).not.toContain("JUDGE_ERROR");
  });

  it("a model call that throws twice becomes an error result, never a throw", async () => {
    const model = fakeModel([new Error("rate limited"), new Error("rate limited")]);
    const result = await judgeAssertion({ model, rubric, assertion, evalCase, output });
    expect(result.passed).toBe(false);
    expect(result.rationale).toContain("JUDGE_ERROR");
    expect(result.rationale).toContain("rate limited");
  });

  it("schema-invalid verdicts (score out of range) count as malformed", async () => {
    const bad = JSON.stringify({ score: 5, passed: true, rationale: "r", evidence_span: "Drink water." });
    const model = fakeModel([bad, bad]);
    const result = await judgeAssertion({ model, rubric, assertion, evalCase, output });
    expect(result.rationale).toContain("JUDGE_ERROR");
  });
});

describe("judgeAssertion — anti-sycophancy (no quote, no pass)", () => {
  it("a pass with a fabricated evidence span cannot pass", async () => {
    const fabricated = JSON.stringify({
      score: 1,
      passed: true,
      rationale: "Looks fully grounded.",
      evidence_span: "this sentence is not in the output",
    });
    const model = fakeModel([fabricated, fabricated]);
    const result = await judgeAssertion({ model, rubric, assertion, evalCase, output });
    expect(result.passed).toBe(false);
    expect(result.rationale).toContain("JUDGE_ERROR");
    expect(result.rationale).toContain("evidence_span");
  });

  it("a pass with an empty evidence span cannot pass", async () => {
    const empty = JSON.stringify({ score: 1, passed: true, rationale: "Fine.", evidence_span: "  " });
    const model = fakeModel([empty, empty]);
    const result = await judgeAssertion({ model, rubric, assertion, evalCase, output });
    expect(result.passed).toBe(false);
  });

  it("evidence matching is whitespace-insensitive but content-strict", async () => {
    const reflowed = JSON.stringify({
      score: 0.9,
      passed: true,
      rationale: "Supported.",
      evidence_span: "The Eiffel Tower\n  opened   in 1889.",
    });
    const model = fakeModel([reflowed]);
    const result = await judgeAssertion({ model, rubric, assertion, evalCase, output });
    expect(result.passed).toBe(true);
  });
});

describe("judgeAssertion — dataset bugs throw", () => {
  it("throws on a deterministic assertion", async () => {
    const wrongKind: Assertion = { ...assertion, kind: "deterministic", criterion: null };
    await expect(
      judgeAssertion({ model: fakeModel([]), rubric, assertion: wrongKind, evalCase, output }),
    ).rejects.toThrow(/model_graded/);
  });

  it("throws on a criterion the rubric does not define", async () => {
    const unknown: Assertion = { ...assertion, criterion: "vibes_check" };
    await expect(
      judgeAssertion({ model: fakeModel([passVerdict]), rubric, assertion: unknown, evalCase, output }),
    ).rejects.toThrow(/vibes_check/);
  });
});

describe("rubric packs", () => {
  it("field_reporter rubric covers PRD §8.1 model_graded criteria", () => {
    const r = loadRubric("field_reporter");
    expect(Object.keys(r.criteria).sort()).toEqual(["grounded", "independent_rubric_pass"]);
    expect(r.agent).toBe("field_reporter");
  });

  it("coach_multiagent rubric covers PRD §8.2 model_graded criteria", () => {
    const r = loadRubric("coach_multiagent");
    expect(Object.keys(r.criteria).sort()).toEqual([
      "no_contradiction",
      "no_uncited_claims",
      "scope_safety",
      "synthesis_faithful",
    ]);
  });

  it("getCriterion throws on unknown keys, naming what exists", () => {
    expect(() => getCriterion(rubric, "nope")).toThrow(/grounded/);
  });
});

describe("judge provider selection (PRD §7: never the provider under test)", () => {
  const base = loadSettings({} as NodeJS.ProcessEnv);

  it("defaults to the free openrouter judge for both providers", () => {
    expect(resolveJudgeProvider(base, "claude")).toBe("openrouter");
    expect(resolveJudgeProvider(base, "gemini")).toBe("openrouter");
  });

  it("swaps an anthropic judge off claude cases (and google off gemini)", () => {
    const anthropicJudge = loadSettings({ JUDGE_PROVIDER: "anthropic" } as NodeJS.ProcessEnv);
    expect(resolveJudgeProvider(anthropicJudge, "claude")).toBe("google");
    expect(resolveJudgeProvider(anthropicJudge, "gemini")).toBe("anthropic");

    const googleJudge = loadSettings({ JUDGE_PROVIDER: "google" } as NodeJS.ProcessEnv);
    expect(resolveJudgeProvider(googleJudge, "gemini")).toBe("anthropic");
    expect(resolveJudgeProvider(googleJudge, "claude")).toBe("google");
  });

  it("createJudgeModel fails loudly when the provider's key is missing", () => {
    expect(() => createJudgeModel(base, "claude")).toThrow(/OPENROUTER_API_KEY/);
  });

  it("createJudgeModel builds against a configured free provider", () => {
    const settings = loadSettings({
      JUDGE_PROVIDER: "cerebras",
      CEREBRAS_API_KEY: "csk-test",
    } as NodeJS.ProcessEnv);
    const model = createJudgeModel(settings, "claude");
    expect(model.provider).toBe("cerebras");
    expect(model.modelId).toBe("llama-3.3-70b");
  });

  it("JUDGE_MODEL overrides the default for the configured provider", () => {
    const settings = loadSettings({
      JUDGE_PROVIDER: "openrouter",
      JUDGE_MODEL: "qwen/qwen-2.5-72b-instruct:free",
      OPENROUTER_API_KEY: "or-test",
    } as NodeJS.ProcessEnv);
    const model = createJudgeModel(settings, "gemini");
    expect(model.modelId).toBe("qwen/qwen-2.5-72b-instruct:free");
  });
});

describe("JudgeVerdictSchema", () => {
  it("round-trips a valid verdict and rejects empty rationales", () => {
    const verdict = { score: 0.5, passed: false, rationale: "r", evidence_span: "" };
    expect(JudgeVerdictSchema.parse(verdict)).toEqual(verdict);
    expect(() => JudgeVerdictSchema.parse({ ...verdict, rationale: "" })).toThrow();
  });
});
