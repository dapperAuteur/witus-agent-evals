/**
 * Adapter for the Wanderlearn Field Reporter (plan 05).
 *
 * Invokes the real graph — `buildFieldReportGraph()` from the agent repo's
 * src/agent/graph.ts — in a tsx subprocess with cwd inside that repo.
 * `--conditions=react-server` neutralizes the repo's `server-only` imports;
 * its DB-backed settings fall back to built-in defaults when unreachable.
 *
 * Case input shape (dataset pack, M6): the agent's own capture fields —
 * `{ location, rawInput, targetAudience, reportId? }`. The adapter stamps
 * the provider under test and normalizes the final state for the checks.
 */
import { join } from "node:path";
import type { AdapterOutput, AgentAdapter, Provider } from "./base.js";
import type { GraphInvoker } from "./subprocess.js";
import { runGraphInSubprocess } from "./subprocess.js";
import { AGENT_PROVIDER, makeRunName, resolveRepo, traceRef, VENDOR_NODE_PATH } from "./shared.js";
import type { Settings } from "../settings.js";

/** The slices of the agent's final state the harness reads (see its state.ts). */
interface FieldReportFinalState {
  finalMarkdown?: string;
  draft?: { revisionNumber: number; markdown: string; citations?: Array<{ claim: string; source: string }> };
  critique?: { revisionNumber: number; passed: boolean; feedback: string };
  revisionHistory?: Array<{ revisionNumber: number; markdown: string; passed: boolean; feedback: string }>;
  imagePrompts?: string[];
  flaggedForHumanReview?: boolean;
  webSearchCallCount?: number;
}

/** First markdown heading, for the `valid_schema` title field. */
function titleOf(markdown: string): string {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match?.[1]?.trim() ?? "";
}

/** Pure: agent final state → the harness's normalized output + telemetry. */
export function normalizeFieldReporterState(
  state: FieldReportFinalState,
): Pick<AdapterOutput, "output" | "telemetry"> {
  const body = state.finalMarkdown ?? state.draft?.markdown ?? "";
  const sources = [
    ...new Set((state.draft?.citations ?? []).map((c) => c.source).filter(Boolean)),
  ];
  const rev0 = state.revisionHistory?.[0];
  return {
    output: {
      title: titleOf(body),
      body,
      sources,
      image_prompts: state.imagePrompts ?? [],
      flagged_for_human_review: state.flaggedForHumanReview ?? false,
      critique: state.critique ?? null,
    },
    telemetry: {
      tool_calls: state.webSearchCallCount ?? 0,
      latency_ms: 0, // overwritten with the measured subprocess latency
      revisions: state.critique?.revisionNumber ?? state.draft?.revisionNumber ?? 0,
      ...(rev0 ? { rev0_draft: { markdown: rev0.markdown, passed: rev0.passed, feedback: rev0.feedback } } : {}),
    },
  };
}

export function createFieldReporterAdapter(
  settings: Settings,
  invoke: GraphInvoker = runGraphInSubprocess,
): AgentAdapter {
  const repoDir = resolveRepo(
    settings.FIELD_REPORTER_REPO,
    "../lang-chain/wanderlearn-field-reporter",
  );
  return {
    name: "field_reporter",
    async run(input, provider: Provider): Promise<AdapterOutput> {
      const runName = makeRunName("field-reporter", provider);
      const { state, latency_ms } = await invoke({
        repoDir,
        modulePath: join(repoDir, "src/agent/graph.ts"),
        exportName: "buildFieldReportGraph",
        isFactory: true,
        invokeInput: {
          reportId: String(input["reportId"] ?? runName),
          ...input,
          llmProvider: AGENT_PROVIDER[provider],
        },
        runName,
        extraEnv: {
          // 'server-only' stub — the package only exists inside a Next build.
          NODE_PATH: VENDOR_NODE_PATH,
          // The agent reads the Gemini key under its own name.
          ...(settings.GOOGLE_API_KEY
            ? { GEMINI_API_KEY: settings.GEMINI_API_KEY ?? settings.GOOGLE_API_KEY }
            : {}),
        },
        extraNodeOptions: "--conditions=react-server",
        timeoutMs: settings.EVAL_AGENT_TIMEOUT_MS,
      });
      const normalized = normalizeFieldReporterState(state as FieldReportFinalState);
      return {
        output: normalized.output,
        trace_ref: traceRef(runName),
        telemetry: { ...normalized.telemetry, latency_ms },
      };
    },
  };
}
