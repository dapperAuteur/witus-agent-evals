/**
 * Adapter for the **v2 architecture arm** of the coach comparison.
 *
 * WHAT THIS IS, PRECISELY. This is not the v2 product. The v2 coach shipped as
 * an HTTP route inside CentenarianOS (`app/api/coach/route.ts`) that requires a
 * live Supabase session, the signed-in user's own health rows, and a
 * service-role key. None of that is replayable here, and none of it matters for
 * this dataset: all 21 cases are general knowledge questions ("high-protein
 * breakfast ideas", "is creatine safe"), so the personal-data half of v2's
 * prompt is empty for every one of them.
 *
 * What IS replayable, and what the README claim is actually about, is v2's
 * SHAPE: one model call, one system prompt, and no retrieval of any kind. The
 * v2 route assembles context from a fixed set of structured Supabase queries
 * and pastes uploaded documents in as plain text. It never computes an
 * embedding and never calls a match_* function. That is the architecture this
 * arm reproduces.
 *
 * WHY THE SAME MODEL ON BOTH ARMS. The shipped v2 ran Gemini 2.5 Flash; the
 * shipped v3 runs Claude by default. Comparing them as shipped moves two
 * variables at once and makes "which one caused the difference" unanswerable.
 * This adapter takes the provider from the runner like every other adapter, so
 * the A/B runs both arms on one provider and architecture is the only thing
 * that differs.
 *
 * WHAT MAY BE REPORTED FROM THIS ARM. Judge-scored criteria that mean something
 * for any answer: answer quality, safety escalation, faithfulness. NOT
 * `citations_scoped`, `routing_correct`, or anything reading
 * `consulted_agents`. v2 has no specialists and no citation objects, so those
 * assertions would score 0 for reasons of category rather than quality, and a
 * 0 that means "the concept does not exist here" published next to a 100 that
 * means "this worked" is a lie by arithmetic. See `assertion_subset.json`.
 *
 * The BASE_DIRECTIVE below is copied verbatim from the v2 route so the tone
 * instruction is identical. Re-read the source before trusting it; it is a
 * copy, and copies drift.
 */
import type { AdapterOutput, AgentAdapter, Provider } from "./base.js";
import type { EvalCase } from "../models.js";

/**
 * Copied verbatim from `gemini/centenarian-os/app/api/coach/route.ts`
 * (BASE_DIRECTIVE, read 2026-08-10). If that file changes, this drifts silently
 * and the arm stops representing v2. The check below is the only guard.
 */
const V2_BASE_DIRECTIVE = `CORE DIRECTIVES — these override everything else:
- You are a critical partner, not a cheerleader. Challenge assumptions. Point out flaws. Push back when the data contradicts what the user wants to hear.
- No praise-padding. Skip "great question" / "that's a wonderful idea" / "I love that" filler. Get to the point.
- Honest assessment over encouragement. If the numbers are bad, say so directly. If an idea has holes, call them out before offering solutions.
- Disagree when warranted. A yes-man is useless. The value is in surfacing what the user isn't seeing.
- Be direct, concise, and substantive. Every sentence should carry information or provoke thought.`;

/**
 * The v2 route appends a per-gem `personaData.system_prompt` from the database.
 * That row is not reachable from here, so this arm uses the coaching-gem role
 * statement that the v3 supervisor also starts from. It is deliberately plain:
 * the point of the arm is the ABSENCE of retrieval and specialists, not a
 * cleverer prompt. Making this prompt better than v2's would flatter v2 and
 * making it worse would flatter v3, so it stays minimal and is disclosed.
 */
const V2_PERSONA_PROMPT = `You are a fitness and longevity coach. Answer the user's question about training, nutrition, recovery, or corrective exercise. You are not a doctor and this is not medical advice.`;

const V2_SYSTEM_PROMPT = `${V2_BASE_DIRECTIVE}\n\n${V2_PERSONA_PROMPT}`;

/**
 * v2 sent no data and no knowledge-base block for a general question: both
 * `dataContext` and `kbContext` are conditional in the route and both are empty
 * when the user has no matching rows and no uploaded documents. This constant
 * records that on purpose, so a later reader does not "fix" the arm by adding
 * retrieval and quietly destroy the experiment.
 */
export const V2_HAS_RETRIEVAL = false;

export interface ChatCaller {
  (args: {
    system: string;
    user: string;
    provider: Provider;
  }): Promise<{ text: string; toolCalls?: number }>;
}

/**
 * Pure: a raw completion string becomes the harness's normalized output.
 *
 * `citations` is an empty array rather than undefined, and that is a factual
 * statement about v2 rather than a missing value: the architecture produced no
 * citation objects at all. `routing` and `consulted_agents` are null and empty
 * for the same reason. Checks that read those fields must be excluded from this
 * arm by the assertion subset, not silently tolerated here.
 */
export function normalizeV2Output(
  text: string,
): Pick<AdapterOutput, "output"> {
  return {
    output: {
      answer: text,
      citations: [],
      findings: {},
      routing: null,
      consulted_agents: [],
      architecture: "v2-single-call-no-retrieval",
    },
  };
}

export function makeCoachV2ArchAdapter(callChat: ChatCaller): AgentAdapter {
  return {
    name: "coach_v2_arch",
    async run(
      input: EvalCase["input"],
      provider: Provider,
    ): Promise<AdapterOutput> {
      const userQuery = (input as { userQuery?: string }).userQuery;
      if (!userQuery) {
        throw new Error(
          "coach_v2_arch: case input has no userQuery. The v2 arm takes the " +
            "same case shape as coach_multiagent and nothing else.",
        );
      }

      const started = Date.now();
      const { text, toolCalls } = await callChat({
        system: V2_SYSTEM_PROMPT,
        user: userQuery,
        provider,
      });
      const latency_ms = Date.now() - started;

      return {
        ...normalizeV2Output(text),
        trace_ref: null,
        telemetry: {
          // Zero by construction: v2 had no tools. If this is ever non-zero the
          // arm has stopped representing v2 and the run is invalid.
          tool_calls: toolCalls ?? 0,
          latency_ms,
          invoked_specialists: [],
        },
      };
    },
  };
}

/**
 * Guard against silent drift. The arm only represents v2 while this string
 * still matches the route. Call it from the run script before spending money on
 * a comparison, so a prompt edit in CentenarianOS fails the run loudly instead
 * of producing a number about a system that no longer exists.
 */
export function assertDirectiveMatchesSource(sourceFileText: string): void {
  if (!sourceFileText.includes(V2_BASE_DIRECTIVE)) {
    throw new Error(
      "coach_v2_arch: BASE_DIRECTIVE no longer matches " +
        "centenarian-os/app/api/coach/route.ts. This arm is a copy of v2's " +
        "prompt; if the source changed, re-copy it and note the change in the " +
        "run report, or the comparison is measuring a prompt nobody shipped.",
    );
  }
}
