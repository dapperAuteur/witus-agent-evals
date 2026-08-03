/**
 * The brief's `test_runner_smoke` (M4 acceptance): each adapter runs ONE
 * trivial case against the real graph end-to-end and returns a populated
 * AdapterOutput. Real subprocesses, real model calls, real money (small).
 *
 * Opt-in: `pnpm test:smoke`. Skipped in the default `pnpm test` run and
 * whenever keys are absent.
 */
import { describe, expect, it } from "vitest";
import { createFieldReporterAdapter } from "../../src/adapters/field_reporter.js";
import { createCoachAdapter } from "../../src/adapters/coach_multiagent.js";
import { loadSettings } from "../../src/settings.js";

const settings = loadSettings();
const enabled = process.env.RUN_SMOKE === "1" && Boolean(settings.ANTHROPIC_API_KEY);

describe.skipIf(!enabled)("adapter smoke (real graphs, provider=claude)", () => {
  it("field_reporter returns a populated AdapterOutput", { timeout: 600_000 }, async () => {
    const adapter = createFieldReporterAdapter(settings);
    const result = await adapter.run(
      {
        location: {
          name: "Eiffel Tower, Paris",
          gps: { lat: 48.8584, lng: 2.2945 },
          capturedAt: "2026-07-31T10:00:00.000Z",
        },
        rawInput: {
          transcript:
            "Standing under the Eiffel Tower. Built for the 1889 World's Fair by Gustave Eiffel's company. It is about 330 meters tall today with antennas. Locals initially protested it as an eyesore.",
          imageRefs: [],
          operatorNotes: "Smoke-test capture; keep it short.",
        },
        targetAudience: "general",
      },
      "claude",
    );
    expect(String(result.output["body"] ?? "")).not.toHaveLength(0);
    expect(result.telemetry.latency_ms).toBeGreaterThan(0);
    expect(result.telemetry.revisions).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.output["sources"])).toBe(true);
  });

  it("coach_multiagent returns a populated AdapterOutput with specialists", { timeout: 600_000 }, async () => {
    const adapter = createCoachAdapter(settings);
    const result = await adapter.run(
      { userQuery: "What should I eat after a light workout?" },
      "claude",
    );
    expect(String(result.output["answer"] ?? "")).not.toHaveLength(0);
    expect(result.telemetry.invoked_specialists?.length ?? 0).toBeGreaterThan(0);
    expect(result.telemetry.latency_ms).toBeGreaterThan(0);
  });
});
