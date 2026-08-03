/**
 * Generic subprocess graph runner.
 *
 * Spawned by src/adapters/subprocess.ts with cwd = the AGENT repo, so tsx
 * resolves that repo's tsconfig (`@/` alias) and the graph's bare imports
 * resolve from the agent's own node_modules. This file's imports must stay
 * node-builtins only — it executes far from the harness's module graph.
 *
 * Protocol: argv[2] is a JSON spec file
 *   { modulePath, exportName, isFactory, invokeInput, runName, outFile }
 * The result is WRITTEN TO outFile (never stdout — agent code logs freely):
 *   { ok: true,  latency_ms, state } | { ok: false, latency_ms, error }
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

interface RunnerSpec {
  modulePath: string;
  exportName: string;
  isFactory: boolean;
  invokeInput: Record<string, unknown>;
  runName: string;
  outFile: string;
}

const specFile = process.argv[2];
if (!specFile) {
  process.stderr.write("graph_runner: missing spec-file argument\n");
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specFile, "utf8")) as RunnerSpec;

const started = Date.now();
try {
  const mod = (await import(pathToFileURL(spec.modulePath).href)) as Record<
    string,
    unknown
  >;
  let graph = mod[spec.exportName];
  if (spec.isFactory) {
    graph = (graph as () => unknown)();
  }
  const invokable = graph as {
    invoke(input: unknown, config?: unknown): Promise<unknown>;
  };
  const state = await invokable.invoke(spec.invokeInput, {
    runName: spec.runName,
  });
  writeFileSync(
    spec.outFile,
    JSON.stringify({ ok: true, latency_ms: Date.now() - started, state }),
  );
} catch (error) {
  writeFileSync(
    spec.outFile,
    JSON.stringify({
      ok: false,
      latency_ms: Date.now() - started,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    }),
  );
}
