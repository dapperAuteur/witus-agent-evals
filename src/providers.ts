/**
 * Judge-model provider selection (PRD §7 + brief §2).
 *
 * Mirrors the agents' own chat-model factory
 * (wanderlearn-field-reporter/src/agent/llm.ts): the same seven providers,
 * the same LangChain classes, the same env-key names — reused, not
 * reinvented. The harness evaluates agents on Claude and Gemini only, but
 * the JUDGE may run on any provider, including the free tiers (Cerebras /
 * OpenRouter / Mistral / Together / local Ollama) to keep eval runs cheap.
 *
 * The one hard rule (PRD §7): the judge is never the provider under test in
 * that case. Free third-party judges trivially satisfy it; if BAM configures
 * an anthropic/google judge, `resolveJudgeProvider` swaps to the opposite
 * paid provider for the conflicting cases.
 */
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Provider } from "./adapters/base.js";
import {
  DEFAULT_JUDGE_MODELS,
  DEFAULT_JUDGE_PROVIDER,
  type JudgeProvider,
} from "./judge/config.js";
import { requireKey, type Settings } from "./settings.js";

export {
  DEFAULT_JUDGE_MODELS,
  DEFAULT_JUDGE_PROVIDER,
  JUDGE_PROVIDERS,
  type JudgeProvider,
} from "./judge/config.js";

const OPENAI_COMPATIBLE_BASE_URLS: Record<
  "cerebras" | "openrouter" | "together",
  string
> = {
  cerebras: "https://api.cerebras.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
};

/** Which provider-under-test a judge provider would be self-grading for. */
function underTestEquivalent(judge: JudgeProvider): Provider | null {
  if (judge === "anthropic") return "claude";
  if (judge === "google") return "gemini";
  return null;
}

/**
 * Pick the judge provider for a case, enforcing the anti-self-grading rule:
 * the configured judge is used unless it IS the provider under test, in
 * which case the opposite paid provider judges that case.
 */
export function resolveJudgeProvider(
  settings: Settings,
  providerUnderTest: Provider,
): JudgeProvider {
  const configured = settings.JUDGE_PROVIDER ?? DEFAULT_JUDGE_PROVIDER;
  if (underTestEquivalent(configured) === providerUnderTest) {
    return providerUnderTest === "claude" ? "google" : "anthropic";
  }
  return configured;
}

/** Minimal surface the judge needs; tests inject fakes, prod wraps LangChain. */
export interface JudgeModel {
  readonly provider: JudgeProvider;
  readonly modelId: string;
  invoke(prompt: string): Promise<string>;
}

/** LangChain message content is string | typed blocks; the judge wants text. */
function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block: unknown) => {
        if (
          typeof block === "object" &&
          block !== null &&
          (block as { type?: unknown }).type === "text"
        ) {
          return String((block as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

/** PRD §11: low temperature keeps the judge as deterministic as it gets. */
const JUDGE_TEMPERATURE = 0;
const JUDGE_MAX_TOKENS = 4096;

function buildChatModel(
  provider: JudgeProvider,
  model: string,
  settings: Settings,
): BaseChatModel {
  switch (provider) {
    case "anthropic":
      // No temperature: sampling params are removed on Opus 5+ (400 if sent).
      // Generous maxTokens because adaptive thinking shares the output cap.
      return new ChatAnthropic({
        model,
        maxTokens: 16000,
        maxRetries: 2,
        apiKey: requireKey(settings, "ANTHROPIC_API_KEY"),
      });
    case "google":
      return new ChatGoogleGenerativeAI({
        model,
        temperature: JUDGE_TEMPERATURE,
        maxOutputTokens: JUDGE_MAX_TOKENS,
        maxRetries: 2,
        apiKey:
          settings.GOOGLE_API_KEY ?? requireKey(settings, "GEMINI_API_KEY"),
      });
    case "ollama":
      return new ChatOllama({
        model,
        temperature: JUDGE_TEMPERATURE,
        numPredict: JUDGE_MAX_TOKENS,
        baseUrl: settings.OLLAMA_BASE_URL ?? "http://localhost:11434",
      });
    case "mistral":
      return new ChatMistralAI({
        model,
        temperature: JUDGE_TEMPERATURE,
        maxTokens: JUDGE_MAX_TOKENS,
        maxRetries: 2,
        apiKey: requireKey(settings, "MISTRAL_API_KEY"),
      });
    case "cerebras":
    case "openrouter":
    case "together": {
      const keyName =
        provider === "cerebras"
          ? "CEREBRAS_API_KEY"
          : provider === "openrouter"
            ? "OPENROUTER_API_KEY"
            : "TOGETHER_API_KEY";
      return new ChatOpenAI({
        model,
        temperature: JUDGE_TEMPERATURE,
        maxTokens: JUDGE_MAX_TOKENS,
        maxRetries: 2,
        apiKey: requireKey(settings, keyName),
        configuration: { baseURL: OPENAI_COMPATIBLE_BASE_URLS[provider] },
      });
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unhandled judge provider: ${String(_exhaustive)}`);
    }
  }
}

/** Build the real judge model for a case's provider-under-test. */
export function createJudgeModel(
  settings: Settings,
  providerUnderTest: Provider,
): JudgeModel {
  const provider = resolveJudgeProvider(settings, providerUnderTest);
  const modelId =
    settings.JUDGE_MODEL && settings.JUDGE_PROVIDER === provider
      ? settings.JUDGE_MODEL
      : DEFAULT_JUDGE_MODELS[provider];
  const chat = buildChatModel(provider, modelId, settings);
  return {
    provider,
    modelId,
    async invoke(prompt: string): Promise<string> {
      const response = await chat.invoke(prompt);
      return contentToText(response.content);
    },
  };
}
