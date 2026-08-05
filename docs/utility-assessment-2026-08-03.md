# Does witus-agent-evals have utility? (assessment, 2026-08-03)

> Context: BAM's question. Users can use witus-triage-agent, but not this tool. Is there
> utility? What are the options? Is it worth continuing to improve? This is the
> assessment from the build session, preserved for later use (e.g. the teardown post).

Short answer: yes, it has real utility, but its users were never meant to be end
users. Comparing it to witus-triage-agent is comparing a product to the test rig behind
the products. The PRD is explicit about this: its three users are *BAM* (before/after
changing an agent), *a hiring manager reading the repo* (the repo is the writing
sample), and *future-BAM post-handoff*; a web UI is a named v1 non-goal. Nobody
"uses" a test suite either, but it protects everything people do use.

And it already paid rent in its first week of existence:

- It caught a **production-grade bug in the field-reporter**: with the fallback env
  set (which it is), every node silently degrades and the agent ships
  `_Draft generation failed._` while reporting success. No user-facing symptom would
  have told you this cleanly.
- It measured the **coach's real weakness with receipts**: 57% failure on uncited
  specialist claims under a strong judge, one supervisor mis-route, while showing the
  things that work (zero namespace contamination, all contradiction traps handled).
- It produced **judge-disagreement data** (free judge vs claude-opus-5 disagreeing by
  47 percentage points on one criterion), exactly the kind of finding the PRD said
  would make the teardown post.

## Options, ranked by return on effort

1. **Harvest what it already found** (near-zero cost): finish task 07, regenerate the
   clean 4-run reference set (everything's cached), fix the field-reporter bug it
   filed, and write the PRD §12 teardown post. That post was the original point: the
   proof-of-craft artifact for the job narrative.
2. **Make it a gate, not a chore**: run it in CI or on a schedule for the two agent
   repos. Exit code 2 already blocks on regressions, the inbox alert is wired, and
   this is when the parked Better Stack task becomes relevant. This is how it stays
   valuable without anyone "using" it.
3. **Point it at witus-triage-agent**: the sharpest answer to the utility question.
   That's the agent users *do* touch, it's a LangGraph app like the others, and the
   PRD's plug-in design means covering it costs an adapter + dataset + rubric with
   zero core changes. Then the tool users can't use directly protects the tool they
   can.
4. **Productize with a dashboard**: possible (it would join WitUS SSO as an OIDC
   client per `gemini/witus/plans/20-ecosystem-sso-idp.md`), but advised against; the
   markdown reports already serve the real audience, and a UI adds maintenance without
   adding users who'd want it.

## Is it worth continuing to improve?

Modestly, and in a specific direction: improvement here means *using* it (option 1),
*automating* it (option 2), and *widening coverage* (option 3), not polishing it as an
app. If the agents ever go dormant, freeze it and just run it before changes; even
then it earns its keep as the thing that lets future-BAM trust the agents months after
handoff, which is user #3 in its own PRD.

## Related

- Follow-up plans placed in the agent repos (2026-08-03):
  - `wanderlearn-field-reporter/plans/02-eval-harness-findings-fallback-bug-and-blog.md`
  - `centenarian-coach-multiagent/plans/09-eval-harness-findings-citation-discipline-and-blog.md`
- Reference run: `runs/20260803T192213-coach_multiagent-gemini/report.md`
- PRD §3 (users), §12 (expected findings / teardown material)
