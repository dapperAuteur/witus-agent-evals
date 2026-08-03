/**
 * Registries wiring names in cases.jsonl to code (PRD §5.2 registry.py).
 *
 * Why explicit registries instead of imports at call sites: a case names its
 * check ("citation_present") and agent ("field_reporter") as data. The runner
 * resolves those names here, so datasets stay declarative and adding a check
 * or agent never touches the runner. Duplicate registration and unknown
 * lookups throw — errors are loud (brief §1.7), a typo'd check name must fail
 * the run, not skip the assertion.
 */
import type { Assertion, AssertionResult, EvalCase } from "./models.js";
import type { AdapterOutput, AgentAdapter, Telemetry } from "./adapters/base.js";

/**
 * A deterministic check is a pure function (brief M2): same inputs, same
 * verdict, no I/O. `assertion.params` carries per-case tuning (e.g. budget).
 */
export type DeterministicCheck = (
  output: AdapterOutput["output"],
  evalCase: EvalCase,
  telemetry: Telemetry,
  assertion: Assertion,
) => AssertionResult;

const checks = new Map<string, DeterministicCheck>();
const adapters = new Map<string, AgentAdapter>();

export function registerCheck(name: string, fn: DeterministicCheck): void {
  if (checks.has(name)) {
    throw new Error(`Check "${name}" is already registered`);
  }
  checks.set(name, fn);
}

export function getCheck(name: string): DeterministicCheck {
  const fn = checks.get(name);
  if (!fn) {
    throw new Error(
      `Unknown check "${name}". Registered: ${[...checks.keys()].join(", ") || "(none)"}`,
    );
  }
  return fn;
}

export function registerAdapter(adapter: AgentAdapter): void {
  if (adapters.has(adapter.name)) {
    throw new Error(`Adapter "${adapter.name}" is already registered`);
  }
  adapters.set(adapter.name, adapter);
}

export function getAdapter(name: string): AgentAdapter {
  const adapter = adapters.get(name);
  if (!adapter) {
    throw new Error(
      `Unknown adapter "${name}". Registered: ${[...adapters.keys()].join(", ") || "(none)"}`,
    );
  }
  return adapter;
}

/** Test-only: registries are module-level state; tests must not leak into each other. */
export function clearRegistries(): void {
  checks.clear();
  adapters.clear();
}
