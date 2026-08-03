/**
 * Adapter for the Centenarian Coach Multi-Agent (plan 05).
 *
 * Invokes the compiled `coachGraph` from the agent repo's src/graph.ts in a
 * tsx subprocess — the same entry the repo's own evals/run-langsmith.ts
 * uses. Case input shape (dataset pack, M6): `{ userQuery, sessionId? }`.
 *
 * Normalization fulfils the M2 `citations_scoped` contract:
 * `output.citations` is `[{specialist, source_id}]`, taken from each
 * specialist finding's own citations (specialist-level provenance — the
 * supervisor's synthesized citation list can't reveal contamination).
 */
import { join } from "node:path";
import type { AdapterOutput, AgentAdapter, Provider } from "./base.js";
import type { GraphInvoker } from "./subprocess.js";
import { runGraphInSubprocess } from "./subprocess.js";
import { AGENT_PROVIDER, makeRunName, resolveRepo, traceRef } from "./shared.js";
import type { Settings } from "../settings.js";

type CoachAgent = "nutrition" | "workout" | "recovery" | "corrective";

/** The slices of the coach's final state the harness reads (see its state.ts). */
interface CoachFinalState {
  routing?: { agents: CoachAgent[]; primaryAgent: CoachAgent; rationale: string };
  findings?: Partial<
    Record<
      CoachAgent,
      {
        agent: CoachAgent;
        text: string;
        citations: Array<{ source: string; snippet: string; agent: CoachAgent }>;
        toolCalls: Array<{ name: string }>;
      }
    >
  >;
  finalAnswer?: {
    text: string;
    citations: Array<{ source: string; snippet: string; agent: CoachAgent }>;
    consultedAgents: CoachAgent[];
  };
}

/** Pure: coach final state → the harness's normalized output + telemetry. */
export function normalizeCoachState(
  state: CoachFinalState,
): Pick<AdapterOutput, "output" | "telemetry"> {
  const findings = Object.values(state.findings ?? {});
  const citations = findings.flatMap((finding) =>
    finding.citations.map((c) => ({ specialist: c.agent, source_id: c.source })),
  );
  const invoked =
    state.routing?.agents ??
    (Object.keys(state.findings ?? {}) as CoachAgent[]);
  return {
    output: {
      answer: state.finalAnswer?.text ?? "",
      citations,
      findings: state.findings ?? {},
      routing: state.routing ?? null,
      consulted_agents: state.finalAnswer?.consultedAgents ?? invoked,
    },
    telemetry: {
      tool_calls: findings.reduce((sum, f) => sum + (f.toolCalls?.length ?? 0), 0),
      latency_ms: 0, // overwritten with the measured subprocess latency
      invoked_specialists: invoked,
    },
  };
}

export function createCoachAdapter(
  settings: Settings,
  invoke: GraphInvoker = runGraphInSubprocess,
): AgentAdapter {
  const repoDir = resolveRepo(
    settings.COACH_REPO,
    "../lang-chain/centenarian-coach-multiagent",
  );
  return {
    name: "coach_multiagent",
    async run(input, provider: Provider): Promise<AdapterOutput> {
      const userQuery = input["userQuery"] ?? input["question"];
      if (typeof userQuery !== "string" || userQuery.length === 0) {
        throw new Error(
          "coach_multiagent case input needs a string userQuery (or question) — fix the case in the dataset",
        );
      }
      const runName = makeRunName("coach", provider);
      const { state, latency_ms } = await invoke({
        repoDir,
        modulePath: join(repoDir, "src/graph.ts"),
        exportName: "coachGraph",
        isFactory: false,
        invokeInput: {
          sessionId: String(input["sessionId"] ?? runName),
          userQuery,
        },
        runName,
        // The coach selects its models via its own env; pin the provider
        // under test the same way its deployment does.
        extraEnv: {
          COACH_LLM_PROVIDER: AGENT_PROVIDER[provider],
          ...(settings.GOOGLE_API_KEY
            ? { GEMINI_API_KEY: settings.GEMINI_API_KEY ?? settings.GOOGLE_API_KEY }
            : {}),
        },
        timeoutMs: settings.EVAL_AGENT_TIMEOUT_MS,
      });
      const normalized = normalizeCoachState(state as CoachFinalState);
      return {
        output: normalized.output,
        trace_ref: traceRef(runName),
        telemetry: { ...normalized.telemetry, latency_ms },
      };
    },
  };
}
