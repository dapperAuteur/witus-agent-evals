# Datasets

One pack per agent (PRD §8.3): `cases.jsonl` (one `EvalCase` per line) plus fixtures.
21 cases each: 8 easy / 7 known-hard / 6 adversarial. Every hard and adversarial case
names the assertion it is trying to break in `metadata.targets` (self-documenting) and
its band in `metadata.difficulty`. Fixtures only; no real user data.

## `$fixture` references

Any value may be `{"$fixture": "relative/path"}`, resolved by `src/datasets.ts` against
the agent's dataset dir before validation. `.json` fixtures parse as JSON; anything else
inlines as text. Used for:

- `assertions` → the shared `assertion_pack.json` (edit once, applies to every case)
- long transcripts → `field_reporter/source_material/*.md`
- `metadata.namespaces` → `coach_multiagent/kb_fixtures/namespaces.json`

## Coach namespace scoping: two layers

`cx.citations_scoped` accepts a citation when its source label matches either layer:

1. **Exact**: `kb_fixtures/namespaces.json`, the raw academic citation strings from the
   coach repo's `kb-fixtures/*_kb.json` (regen below).
2. **Prefix**: `kb_fixtures/namespace_prefixes.json`. The coach's LIVE pgvector KB also
   holds formatted corpora labeled `<Family> · <title> · p. N`; verified against the live
   DB on 2026-08-03: nutrition = `NASM CNC`, workout = `NASM CPT` + `Training`,
   recovery = `Recovery`, corrective = `NASM CES`. Re-verify with
   `SELECT namespace, split_part(source, ' · ', 1), COUNT(*) FROM coach_kb GROUP BY 1,2`
   against the coach's `STORAGE_DATABASE_URL` when its corpus changes.

## Regenerating the coach namespace map

`kb_fixtures/namespaces.json` maps each specialist to the exact `source` labels its
retrieval emits, generated from the coach repo's own KB fixtures. Re-run when the coach
KB changes:

```sh
python3 -c "
import json
out = {}
for ns in ['nutrition','workout','recovery','corrective']:
    docs = json.load(open(f'../lang-chain/centenarian-coach-multiagent/kb-fixtures/{ns}_kb.json'))
    out[ns] = sorted({d['source'] for d in docs})
json.dump(out, open('datasets/coach_multiagent/kb_fixtures/namespaces.json','w'), indent=1, ensure_ascii=False)
"
```

## Authoritative budget values

- `fr.budget_ok` `max_tool_calls: 5` mirrors `MAX_WEB_SEARCHES_PER_RUN` in the field-reporter repo
- `fr.revisions_ok` `max_revisions: 3` mirrors `MAX_REVISIONS` in its graph
- `fr.citations_present` `min: 3` mirrors its own `has_three_citations` rubric criterion

Re-check those constants in the agent repos when bumping this dataset.
