/**
 * CLI entrypoint (`pnpm evals ...`), PRD §9.
 *
 * Milestone 1 ships the command surface only; each command tells you which
 * milestone implements it and exits non-zero so nothing downstream can
 * mistake a stub for a result.
 */
const USAGE = `witus-agent-evals — eval harness for WitUS LangGraph agents

Usage:
  pnpm evals run --agent <field_reporter|coach_multiagent> --provider <claude|gemini|all> [--baseline <run_id>] [--limit N]
  pnpm evals report --run <run_id>
  pnpm evals compare --run-a <run_id> --run-b <run_id>
`;

const NOT_YET: Record<string, string> = {
  run: "Milestone 5 (runner) — adapters land in Milestone 4",
  report: "Milestone 7 (report generator)",
  compare: "Milestone 7 (provider comparison)",
};

function main(argv: string[]): number {
  const command = argv[0];
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }
  const milestone = NOT_YET[command];
  if (!milestone) {
    process.stderr.write(`Unknown command "${command}".\n\n${USAGE}`);
    return 1;
  }
  process.stderr.write(`"${command}" is not implemented yet — coming in ${milestone}.\n`);
  return 1;
}

process.exit(main(process.argv.slice(2)));
