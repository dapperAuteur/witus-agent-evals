/**
 * Register both built-in adapters (PRD §5.1: adding a third agent later is
 * an adapter + dataset pack + rubric pack, no core changes).
 */
import { registerAdapter } from "../registry.js";
import type { Settings } from "../settings.js";
import { createCoachAdapter } from "./coach_multiagent.js";
import { createFieldReporterAdapter } from "./field_reporter.js";

export function registerBuiltinAdapters(settings: Settings): void {
  registerAdapter(createFieldReporterAdapter(settings));
  registerAdapter(createCoachAdapter(settings));
}
