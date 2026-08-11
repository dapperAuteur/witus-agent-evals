/**
 * The chat caller behind the v2-architecture arm.
 *
 * MODEL PARITY IS THE WHOLE POINT. Arm B (the current coach) produces the
 * answer that gets judged from its *synthesizer* role. So arm A uses that same
 * model id, taken from the coach repo's own `DEFAULT_MODELS` matrix
 * (`src/lib/llm-config.ts`, read 2026-08-11):
 *
 *   anthropic  synthesizer  claude-sonnet-4-6
 *   google     synthesizer  gemini-2.5-flash
 *
 * If those defaults change in the coach repo, this drifts and the A/B stops
 * isolating architecture. That is why the ids are named here with their source
 * rather than resolved dynamically: a silent change should be visible in a diff.
 *
 * Not reusing the judge's `buildChatModel` on purpose either. The judge is
 * deliberately allowed to be a different provider from the agent under test
 * (that rule exists so a model never grades itself), and borrowing its factory
 * would make arm A quietly follow the judge's provider instead of the arm's.
 */
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Provider } from "./base.js";
import type { ChatCaller } from "./coach_v2_arch.js";
import { requireKey, type Settings } from "../settings.js";

/**
 * Mirrors the coach repo's synthesizer row. Keep in sync with
 * `centenarian-coach-multiagent/src/lib/llm-config.ts` DEFAULT_MODELS.
 */
export const ARM_MODELS: Record<Provider, string> = {
  claude: "claude-sonnet-4-6",
  gemini: "gemini-2.5-flash",
};

function buildArmModel(provider: Provider, settings: Settings): BaseChatModel {
  if (provider === "claude") {
    // No temperature: sampling params are rejected on current Anthropic models.
    return new ChatAnthropic({
      model: ARM_MODELS.claude,
      maxTokens: 4096,
      maxRetries: 2,
      apiKey: requireKey(settings, "ANTHROPIC_API_KEY"),
    });
  }
  return new ChatGoogleGenerativeAI({
    model: ARM_MODELS.gemini,
    maxOutputTokens: 4096,
    maxRetries: 2,
    apiKey: settings.GOOGLE_API_KEY ?? requireKey(settings, "GEMINI_API_KEY"),
  });
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof (part as { text?: unknown })?.text === "string"
            ? ((part as { text: string }).text)
            : "",
      )
      .join("");
  }
  return "";
}

/** One system prompt, one user message, one call. That is the v2 shape. */
export function makeV2ChatCaller(settings: Settings): ChatCaller {
  return async ({ system, user, provider }) => {
    const chat = buildArmModel(provider, settings);
    const response = await chat.invoke([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    return { text: contentToText(response.content), toolCalls: 0 };
  };
}
