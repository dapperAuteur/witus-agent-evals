/**
 * The approved witus-inbox regression alert (CLAUDE.md §Integrations,
 * 2026-07-31): when a run finishes with regressions or errored cases, fire
 * ONE signed, fire-and-forget submission into BAM's triage queue.
 *
 * Gates, in order:
 *   1. Env-gated — all three INBOX_* vars must be set (task 03 provisions
 *      them); otherwise the alert is inert and says so only in debug logs.
 *   2. Signal-gated — only regressions or errors fire; a clean run is quiet.
 *   3. Fire-and-forget — a failed send logs source/form_type/status ONLY
 *      (inbox rule 3) and never fails the eval run.
 *
 * sender.ts is witus-inbox/examples/sender.ts copied VERBATIM — the HMAC
 * contract is shared by every publisher; forking it breaks verification.
 */
import type { RunSummary } from "../models.js";
import type { Settings } from "../settings.js";
import { sendToInbox } from "./sender.js";

export const FORM_TYPE = "eval-regression";

export interface AlertContext {
  summary: RunSummary;
  erroredCases: number;
  /** Where the artifacts landed, so the triage entry links back. */
  runDir: string;
}

/** True when this run should page BAM at all. */
export function shouldAlert(ctx: AlertContext): boolean {
  return ctx.summary.regressions.length > 0 || ctx.erroredCases > 0;
}

/**
 * Fire the alert if provisioned and warranted. Returns what happened for
 * the runner's log line; never throws.
 */
export async function sendRegressionAlert(
  settings: Settings,
  ctx: AlertContext,
  send: typeof sendToInbox = sendToInbox,
): Promise<"sent" | "skipped_clean" | "skipped_unprovisioned" | "failed"> {
  if (!shouldAlert(ctx)) return "skipped_clean";
  if (
    !settings.INBOX_INGEST_URL ||
    !settings.INBOX_SOURCE_SLUG ||
    !settings.INBOX_INGEST_SECRET
  ) {
    return "skipped_unprovisioned";
  }

  const { summary } = ctx;
  try {
    const result = await send({
      inboxUrl: settings.INBOX_INGEST_URL,
      sourceSlug: settings.INBOX_SOURCE_SLUG,
      hmacSecret: settings.INBOX_INGEST_SECRET,
      submission: {
        form_type: FORM_TYPE,
        priority: "high",
        payload: {
          run_id: summary.run_id,
          agent: summary.agent,
          provider: summary.provider,
          n_cases: summary.n_cases,
          pass_rate: summary.pass_rate,
          regressions: summary.regressions,
          baseline_run_id: summary.baseline_run_id,
          errored_cases: ctx.erroredCases,
          run_dir: ctx.runDir,
        },
      },
    });
    if (!result.ok) {
      console.error("[inbox-alert] failed", {
        source: settings.INBOX_SOURCE_SLUG,
        form_type: FORM_TYPE,
        http_status: result.status,
      });
      return "failed";
    }
    return "sent";
  } catch {
    console.error("[inbox-alert] failed", {
      source: settings.INBOX_SOURCE_SLUG,
      form_type: FORM_TYPE,
      http_status: 0,
    });
    return "failed";
  }
}
