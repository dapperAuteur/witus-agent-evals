/**
 * Typed env loader (brief §1.6: no secrets in code, keys via env only).
 *
 * Loads `.env.local` first, then `.env` (earlier file wins — BAM keeps real
 * keys in .env.local; both are gitignored). All keys are optional at load
 * time because Milestones 1–2 run entirely offline; anything model-touching
 * calls `requireKey` at the point of use and fails loudly with a pointer to
 * the operator task that provisions the key.
 */
import { config } from "dotenv";
import { z } from "zod";
import { JUDGE_PROVIDERS } from "./judge/config.js";

config({ path: [".env.local", ".env"], quiet: true });

const SettingsSchema = z.object({
  // Paid providers (agents under test + optional paid judge)
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GOOGLE_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(), // agent repos' name for the same key
  LANGSMITH_API_KEY: z.string().min(1).optional(),
  // Free judge providers (mirrors the agents' provider set)
  CEREBRAS_API_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  MISTRAL_API_KEY: z.string().min(1).optional(),
  TOGETHER_API_KEY: z.string().min(1).optional(),
  OLLAMA_BASE_URL: z.string().min(1).optional(),
  // Judge selection (PRD §7); defaults live in providers.ts
  JUDGE_PROVIDER: z.enum(JUDGE_PROVIDERS).optional(),
  JUDGE_MODEL: z.string().min(1).optional(),
  // witus-inbox regression alert (Milestone 5; provisioned via plans/user-tasks/03)
  INBOX_INGEST_URL: z.url().optional(),
  INBOX_SOURCE_SLUG: z.string().min(1).optional(),
  INBOX_INGEST_SECRET: z.string().min(1).optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;

/** Parse from an env map; injectable for tests, defaults to process.env. */
export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  return SettingsSchema.parse(env);
}

/** Fetch a key that this code path cannot run without. */
export function requireKey(settings: Settings, key: keyof Settings): string {
  const value = settings[key];
  if (!value || typeof value !== "string") {
    throw new Error(
      `Missing ${key}. Copy .env.example to .env (or .env.local) and fill it in — see plans/user-tasks/01-provide-api-keys.md`,
    );
  }
  return value;
}
