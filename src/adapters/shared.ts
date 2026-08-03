/**
 * Bits both adapters share: provider mapping, repo resolution, trace refs.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Provider } from "./base.js";

const HARNESS_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * NODE_PATH value exposing the harness's vendor stubs (currently just
 * `server-only`, which only exists inside a Next.js build) to agent
 * subprocesses. The agent's own node_modules always win over NODE_PATH.
 */
export const VENDOR_NODE_PATH = [
  resolve(HARNESS_ROOT, "vendor"),
  process.env.NODE_PATH,
]
  .filter(Boolean)
  .join(":");

/** Harness provider names → the agents' LlmProvider names. */
export const AGENT_PROVIDER: Record<Provider, "anthropic" | "google"> = {
  claude: "anthropic",
  gemini: "google",
};

/**
 * Resolve an agent repo path: explicit setting wins, else the known sibling
 * layout on BAM's machine (fallback — labeled per the authoritative-values
 * rule; set the env var if the checkout lives elsewhere).
 */
export function resolveRepo(
  configured: string | undefined,
  siblingDefault: string,
): string {
  const dir = resolve(HARNESS_ROOT, configured ?? siblingDefault);
  if (!existsSync(dir)) {
    throw new Error(
      `Agent repo not found at ${dir}. Set the repo path in .env — see .env.example`,
    );
  }
  return dir;
}

/**
 * A LangSmith locator, not a URL: enough to find the run (project + run
 * name) without querying the LangSmith API. Null when tracing is off.
 */
export function traceRef(runName: string): string | null {
  const tracing = process.env.LANGSMITH_TRACING === "true" || process.env.LANGCHAIN_TRACING_V2 === "true";
  if (!tracing || !process.env.LANGSMITH_API_KEY) return null;
  const project = process.env.LANGSMITH_PROJECT ?? "default";
  return `langsmith:${project}#${runName}`;
}

/** Unique-enough run name: case id + provider + timestamp. */
export function makeRunName(agent: string, provider: Provider): string {
  return `evals-${agent}-${provider}-${Date.now()}`;
}
