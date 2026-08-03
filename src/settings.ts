/**
 * Typed env loader (brief §1.6: no secrets in code, keys via env only).
 *
 * All keys are optional at load time because Milestones 1–2 run entirely
 * offline; anything model-touching calls `requireKey` at the point of use and
 * fails loudly with a pointer to the operator task that provisions the key.
 */
import "dotenv/config";
import { z } from "zod";

const SettingsSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GOOGLE_API_KEY: z.string().min(1).optional(),
  LANGSMITH_API_KEY: z.string().min(1).optional(),
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
  if (!value) {
    throw new Error(
      `Missing ${key}. Copy .env.example to .env and fill it in — see plans/user-tasks/01-provide-api-keys.md`,
    );
  }
  return value;
}
