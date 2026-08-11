/**
 * Register both built-in adapters (PRD §5.1: adding a third agent later is
 * an adapter + dataset pack + rubric pack, no core changes).
 */
import { registerAdapter } from "../registry.js";
import type { Settings } from "../settings.js";
import { createCoachAdapter } from "./coach_multiagent.js";
import { makeCoachV2ArchAdapter } from "./coach_v2_arch.js";
import { makeV2ChatCaller } from "./v2_chat.js";
import { createFieldReporterAdapter } from "./field_reporter.js";

export function registerBuiltinAdapters(settings: Settings): void {
  registerAdapter(createFieldReporterAdapter(settings));
  registerAdapter(createCoachAdapter(settings));
  // Arm A of the architecture A/B. Runs the same model as the coach's
  // synthesizer role, so the only difference between arms is architecture.
  registerAdapter(makeCoachV2ArchAdapter(makeV2ChatCaller(settings)));
}
