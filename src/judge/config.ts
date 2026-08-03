/**
 * Pure judge-provider configuration — zero imports on purpose, mirroring
 * wanderlearn-field-reporter/src/agent/llm-config.ts. Both settings.ts (env
 * schema) and providers.ts (model factory) import from here, so neither
 * depends on the other.
 */

/** Same seven providers the agents support; free tiers listed first. */
export const JUDGE_PROVIDERS = [
  "ollama",
  "cerebras",
  "openrouter",
  "mistral",
  "together",
  "anthropic",
  "google",
] as const;
export type JudgeProvider = (typeof JUDGE_PROVIDERS)[number];

/**
 * Per-provider default judge models. Free-provider defaults mirror the agent
 * repo's working DEFAULT_MODELS (authoritative: they run on BAM's keys
 * today). anthropic defaults to claude-opus-5 — the brief §5 recommendation
 * is "the strongest available" — and google to the agents' gemini-2.5-flash
 * (their code notes Pro 429s on the free tier). Override via JUDGE_MODEL.
 */
export const DEFAULT_JUDGE_MODELS: Record<JudgeProvider, string> = {
  ollama: "llama3.1:8b",
  cerebras: "llama-3.3-70b",
  openrouter: "deepseek/deepseek-chat:free",
  mistral: "mistral-small-latest",
  together: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
  anthropic: "claude-opus-5",
  google: "gemini-2.5-flash",
};

/** Free judge by default — BAM's 2026-07-31 ask: minimize eval-run cost. */
export const DEFAULT_JUDGE_PROVIDER: JudgeProvider = "cerebras";
