/**
 * Spawn the generic graph runner against an agent repo.
 *
 * Why a subprocess (plan 05): both agents use the `@/` tsconfig alias, so
 * two repos cannot share one importing process. Running tsx with cwd inside
 * the agent repo makes its own tsconfig + node_modules authoritative —
 * exactly how the coach repo's own eval runner invokes its graph.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface GraphRunSpec {
  /** Absolute path to the agent repo (cwd for the subprocess). */
  repoDir: string;
  /** Absolute path to the module exporting the graph. */
  modulePath: string;
  exportName: string;
  /** true when the export is a build function rather than a compiled graph. */
  isFactory: boolean;
  invokeInput: Record<string, unknown>;
  runName: string;
  /** Extra env for the child (merged over process.env). */
  extraEnv?: Record<string, string>;
  /** Extra NODE_OPTIONS flags (e.g. --conditions=react-server). */
  extraNodeOptions?: string;
  timeoutMs: number;
}

export interface GraphRunResult {
  state: Record<string, unknown>;
  latency_ms: number;
}

/** How adapters invoke a graph — injectable so unit tests skip the spawn. */
export type GraphInvoker = (spec: GraphRunSpec) => Promise<GraphRunResult>;

const HARNESS_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TSX_BIN = join(HARNESS_ROOT, "node_modules", ".bin", "tsx");
const RUNNER = fileURLToPath(new URL("./runners/graph_runner.ts", import.meta.url));

/** Run one graph invocation in a tsx subprocess. Throws with stderr context. */
export const runGraphInSubprocess: GraphInvoker = (spec) => {
  if (!existsSync(spec.repoDir)) {
    throw new Error(
      `Agent repo not found at ${spec.repoDir} — set the repo path in .env (see .env.example)`,
    );
  }
  if (!existsSync(TSX_BIN)) {
    throw new Error(`tsx binary not found at ${TSX_BIN} — run pnpm install`);
  }

  const workDir = mkdtempSync(join(tmpdir(), "witus-agent-evals-"));
  const specFile = join(workDir, "spec.json");
  const outFile = join(workDir, "result.json");
  writeFileSync(
    specFile,
    JSON.stringify({
      modulePath: spec.modulePath,
      exportName: spec.exportName,
      isFactory: spec.isFactory,
      invokeInput: spec.invokeInput,
      runName: spec.runName,
      outFile,
    }),
  );

  const nodeOptions = [process.env.NODE_OPTIONS, spec.extraNodeOptions]
    .filter(Boolean)
    .join(" ");

  return new Promise<GraphRunResult>((resolve, reject) => {
    const child = spawn(TSX_BIN, [RUNNER, specFile], {
      cwd: spec.repoDir,
      env: {
        ...process.env,
        ...spec.extraEnv,
        ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrTail = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    });
    child.stdout.resume(); // drain agent log noise

    const killTimer = setTimeout(() => {
      child.kill("SIGKILL");
    }, spec.timeoutMs);

    child.on("error", (error) => {
      clearTimeout(killTimer);
      rmSync(workDir, { recursive: true, force: true });
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(killTimer);
      try {
        if (signal === "SIGKILL") {
          throw new Error(
            `Agent run "${spec.runName}" timed out after ${spec.timeoutMs}ms`,
          );
        }
        if (!existsSync(outFile)) {
          throw new Error(
            `Agent run "${spec.runName}" produced no result (exit ${code}). stderr: ${stderrTail}`,
          );
        }
        const result = JSON.parse(readFileSync(outFile, "utf8")) as
          | { ok: true; latency_ms: number; state: Record<string, unknown> }
          | { ok: false; latency_ms: number; error: string };
        if (!result.ok) {
          throw new Error(`Agent run "${spec.runName}" failed: ${result.error}`);
        }
        resolve({ state: result.state, latency_ms: result.latency_ms });
      } catch (error) {
        reject(error);
      } finally {
        rmSync(workDir, { recursive: true, force: true });
      }
    });
  });
};
