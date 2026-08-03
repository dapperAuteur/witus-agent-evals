import { describe, expect, it, vi } from "vitest";
import { sendRegressionAlert, shouldAlert, FORM_TYPE } from "../src/inbox/alert.js";
import type { sendToInbox } from "../src/inbox/sender.js";
import type { RunSummary } from "../src/models.js";
import { loadSettings } from "../src/settings.js";

const summary: RunSummary = {
  run_id: "r-1",
  agent: "field_reporter",
  provider: "claude",
  started_at: new Date("2026-07-31T12:00:00Z"),
  finished_at: new Date("2026-07-31T12:05:00Z"),
  n_cases: 20,
  pass_rate: 0.8,
  per_assertion_pass_rate: { "fr.grounded": 0.8 },
  baseline_run_id: "r-0",
  regressions: ["fr.grounded"],
};

const provisioned = loadSettings({
  INBOX_INGEST_URL: "https://inbox.example.com/api/ingest",
  INBOX_SOURCE_SLUG: "agent-evals",
  INBOX_INGEST_SECRET: "s".repeat(64),
} as NodeJS.ProcessEnv);
const unprovisioned = loadSettings({} as NodeJS.ProcessEnv);

const cleanSummary: RunSummary = { ...summary, regressions: [] };

describe("shouldAlert", () => {
  it("fires on regressions or errored cases, stays quiet on clean runs", () => {
    expect(shouldAlert({ summary, erroredCases: 0, runDir: "runs/r-1" })).toBe(true);
    expect(shouldAlert({ summary: cleanSummary, erroredCases: 2, runDir: "runs/r-1" })).toBe(true);
    expect(shouldAlert({ summary: cleanSummary, erroredCases: 0, runDir: "runs/r-1" })).toBe(false);
  });
});

describe("sendRegressionAlert", () => {
  const ctx = { summary, erroredCases: 1, runDir: "runs/r-1" };

  it("skips silently when the inbox env is not provisioned (inert until task 03)", async () => {
    const send = vi.fn();
    const result = await sendRegressionAlert(unprovisioned, ctx, send as never);
    expect(result).toBe("skipped_unprovisioned");
    expect(send).not.toHaveBeenCalled();
  });

  it("skips clean runs even when provisioned", async () => {
    const send = vi.fn();
    const result = await sendRegressionAlert(
      provisioned,
      { summary: cleanSummary, erroredCases: 0, runDir: "runs/r-1" },
      send as never,
    );
    expect(result).toBe("skipped_clean");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends one high-priority eval-regression submission with run metadata", async () => {
    const send = vi.fn<typeof sendToInbox>(async () => ({ ok: true, status: 200, id: "uuid" }));
    const result = await sendRegressionAlert(provisioned, ctx, send);
    expect(result).toBe("sent");
    expect(send).toHaveBeenCalledOnce();
    const args = send.mock.calls[0]![0];
    expect(args.inboxUrl).toBe("https://inbox.example.com/api/ingest");
    expect(args.sourceSlug).toBe("agent-evals");
    expect(args.submission.form_type).toBe(FORM_TYPE);
    expect(args.submission.priority).toBe("high");
    expect(args.submission.payload).toMatchObject({
      run_id: "r-1",
      regressions: ["fr.grounded"],
      errored_cases: 1,
    });
  });

  it("never throws: a rejected send is logged as metadata and reported as failed", async () => {
    const send = vi.fn<typeof sendToInbox>(async () => {
      throw new Error("network down");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendRegressionAlert(provisioned, ctx, send);
    expect(result).toBe("failed");
    // Inbox rule 3: only source/form_type/status in the log line.
    expect(errorSpy).toHaveBeenCalledWith("[inbox-alert] failed", {
      source: "agent-evals",
      form_type: FORM_TYPE,
      http_status: 0,
    });
    errorSpy.mockRestore();
  });

  it("reports failed on a non-ok receiver response", async () => {
    const send = vi.fn<typeof sendToInbox>(async () => ({ ok: false, status: 401, detail: "bad sig" }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendRegressionAlert(provisioned, ctx, send);
    expect(result).toBe("failed");
    errorSpy.mockRestore();
  });
});
