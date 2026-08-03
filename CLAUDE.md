# witus-agent-evals — repo identity (hand-owned)

This repo — **witus-agent-evals** — is the **agent eval harness** for the WitUS ecosystem's
LangGraph agents. It is ecosystem **infrastructure/tooling**, not a user-facing product: an
offline, CLI-triggered harness that runs curated eval cases against two agents that live in
their own repos, and writes JSONL results + a markdown report.

**Agents under test (do not confuse with this repo):**
- `claude/lang-chain/wanderlearn-field-reporter` — Wanderlearn Field Reporter (single agent,
  research → outline → write → critique loop).
- `claude/lang-chain/centenarian-coach-multiagent` — Centenarian Coach Multi-Agent
  (supervisor + 4 specialist subgraphs). Note: it carries its own `evals/` dir
  (dataset.json, rubric.ts, run-langsmith.ts) — this harness is the *independent*,
  cross-agent evaluator; don't merge the two or edit that repo's evals from here.

**Spec docs (read before building):** `eval-harness-PRD.md` (what/why) and
`eval-harness-BUILD-BRIEF.md` (how/in what order). When they conflict with each other or with
ecosystem rules, ask BAM.

## Stack decision (resolved 2026-07-31): TypeScript

The PRD/brief specify Python, but brief §2 says "use what the agents already use" and both
agents are TypeScript LangGraph repos. **BAM decided: TypeScript.** Transpose the PRD 1:1:
pydantic → **zod v4**, pytest/pytest-cov → **Vitest + coverage**, `mypy --strict` → **strict
tsc**, `pyproject.toml`/uv → **pnpm**, `python -m evals` → **`pnpm evals`**. PRD §5.2's file
tree and §6's models keep their names/shapes in TS form. Agents import as workspace/path deps.

## Integrations (status)

- **WitUS SSO ("Sign in with WitUS"):** NOT applicable. Per `gemini/witus/plans/20-ecosystem-sso-idp.md`,
  agents/infra are explicitly out of interactive SSO scope (service creds / API-key pattern
  only). This harness has no UI and no users. If a results dashboard is ever built (a v1
  non-goal), it joins as an OIDC client then.
- **witus-inbox:** APPROVED (2026-07-31) — when a run finishes with regressions or errors
  out, fire one signed fire-and-forget submission (`form_type: "eval-regression"`, priority
  high) to the inbox triage queue. Env-gated, inert until BAM provisions the slug
  (`plans/user-tasks/03-inbox-slug-and-env.md`). Copy `witus-inbox/examples/sender.ts`
  verbatim; never fork it.
- **witus-outbox:** trigger APPROVED in principle (2026-07-31) — draft a social post when a
  run surfaces a notable finding. Spec lives in `plans/future/outbox-notable-finding-trigger.md`
  and must be fleshed out with BAM before wiring (what counts as "notable", caption template,
  slug provisioning). Not part of Milestones 1–7.
- **Better Stack error monitoring:** PARKED (2026-07-31) — revisit when eval runs become
  scheduled/unattended. Task kept at `plans/user-tasks/04-betterstack-dsn.md` with status
  Parked; do not wire a DSN path until then.

Secrets: never in code. All keys via env; ship `.env.example` only.

<!-- BEGIN:witus-shared-rules v1 -->
<!-- MANAGED BLOCK — do not edit by hand. Source: gemini/witus/docs/shared-rules.md.
     Update the source, then run `node scripts/sync-claude-rules.mjs` in the witus repo. -->

## ⚠️ Ecosystem identity (shared note — don't confuse repos)

Full ecosystem identity + the canonical product index live in `gemini/witus/CLAUDE.md` and
`gemini/witus/lib/products.ts`. Each repo states *which* product it is in its own hand-owned line
above this managed block; don't infer another app's URLs, routes, IDs, env names, or DB schema —
confirm against that app's own code.

The site **brandanthonymcdonald.com** (BAM's personal portfolio) lives in `claude/bam-landing-page/`
— **NOT** `projects/bam-portfolio/` (the retired legacy static site). Target `bam-landing-page`.

## Operator-task rule — capture user actions in `./plans/user-tasks/`

When Claude proposes work that needs BAM to do something outside the editor (account signup, API
key, DNS change, vendor dashboard, env-var rotation, secret generation, PR review/merge, etc.),
Claude MUST create a `./plans/user-tasks/NN-slug.md` file in this repo. **No exceptions for "small"
steps.** Required sections: **Scope tag** · **What + why** (with explicit *what this blocks* detail
and any hard deadline) · **Steps** · **What Claude will use** · **How to mark done** · **Related**.
Keep `./plans/user-tasks/00-descriptions.md` updated with columns `# | Title | Scope | Blocks |
Status` — the `Blocks` column is the one BAM scans. Ecosystem-wide tasks (Keap, IRL events, retros,
cross-product decisions) live in the canonical witus queue at `gemini/witus/plans/user-tasks/`;
repo-local tasks live here. Read the witus queue at session start before dependent work. Full rule:
`gemini/witus/CLAUDE.md` §"Operator-task rule".

## Branch hygiene — BAM merges, between sessions by default

**Half 1.** Branch → commit → push → stop. Claude does not run `git checkout main && git merge`.
Never `--force` to shared branches. Before every commit run `git branch --show-current`; if it is
`main`/`master`, branch first (`feat/ fix/ chore/ docs/`). After push, hand back the branch name +
summary and stop.

**Half 2.** BAM merges pushed branches via the GitHub UI between sessions. Mid-session, after a
push, BAM may merge in a separate window and the local checkout silently fast-forwards to `main` —
so re-check `git branch --show-current` before **every** commit, not just at branch creation, or you
risk landing follow-up commits directly on `main`.

**Half 3.** Keep branches small (one concern each). When a session produces multiple branches,
consolidate them into one `bundle/<slug>-YYYY-MM-DD` via `git merge --no-ff` (preserves per-concern
history — no squash), resolve conflicts during bundling, run `tsc + lint + build` against the
bundle, push, and file ONE `./plans/user-tasks/NN-merge-bundle-<slug>.md`. BAM does one merge, not N.

**Commit often.** Commit at every working checkpoint — a passing build, a finished sub-step, a green
test — not just at the end. A usage-limit cutoff, a dropped connection, or a crashed session must
never lose more than the last few minutes of work. Small frequent commits on the feature branch keep
the branch un-merged (Half 1 still holds) and give BAM clean per-step history to drill into.

A checked-in `.githooks/pre-commit` guard refuses commits made directly on `main`/`master`. Activate
once per clone: `git config core.hooksPath .githooks`. Full rule: `gemini/witus/CLAUDE.md`
§"Branch-hygiene rule".

## Docs-sync rule — a change isn't done until its docs are current

When a change adds, alters, or removes a user-visible feature/route/scope, update the affected docs
**in the same branch**: README (feature list, env examples, scripts), in-app help/tutorial content,
`ROADMAP.md` **and** any public roadmap page, API/OpenAPI docs, and STYLE_GUIDE/CONTRIBUTING when a
convention changed. State which docs you touched in the handoff. Never leave an aspirational ✅ on a
roadmap — downgrade it with a one-line reason. If a doc update is genuinely out of scope, file it as
a `./plans/` task rather than skipping silently. A Stop hook in `.claude/settings.json` gates on
this: if the session diff changed feature/route files but touched no docs, it blocks once and asks
you to update-or-defer. Schema-only migrations, refactors, perf, and dev-tooling changes don't
trigger it.

## Plans convention

All implementation plans live in `./plans/` as `NN-description-of-plan.md` (two-digit prefix,
kebab-case, next available number, don't skip). Sub-queues: `./plans/user-tasks/NN-slug.md`
(operator tasks), `./plans/bugs/`, `./plans/future/`. (`plans/` is typically gitignored.)

## Citation rule

Anything publishable, teachable, or partner-facing (curriculum, teaching-oriented help articles,
white papers, grant/sponsor/partner writing) uses APA 7 in-line citations with a `## References`
section. Code docs, internal notes, and `plans/user-tasks/*` are out of scope. Full rule:
`gemini/witus/CLAUDE.md` §"Citation rule".

## Authoritative-values rule — never assert guessed external values

When a value is owned by an external system (DNS/registrar, a host like Vercel, a third-party API,
or another ecosystem app's URLs/routes/IDs/env/schema), read it from the authoritative source; don't
hardcode a guessed default and present it as correct. If you must ship a fallback, label it as a
fallback in both UI copy and a code comment. Verify by behavior (does the flow work?), not by
exact-match against a guess. When unsure, flag or ask — never assert. Full rule:
`gemini/witus/CLAUDE.md` §"Authoritative-values rule".

## Coding conventions

UI/UX/DX conventions (a11y, component patterns, TypeScript, microcopy, git-commit vocabulary, the
default Neon+Drizzle+pnpm+Vitest stack) are consolidated in `gemini/witus/docs/shared-ui-ux-dx.md`.
Read it before writing UI or API code. Two repos are grandfathered on Supabase+Jest and documented
there as exceptions.

<!-- END:witus-shared-rules v1 -->
