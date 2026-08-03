# Datasets

One pack per agent (PRD §8.3): `cases.jsonl` (one `EvalCase` per line) plus fixtures.
21 cases each — 8 easy / 7 known-hard / 6 adversarial. Every hard and adversarial case
names the assertion it is trying to break in `metadata.targets` (self-documenting) and
its band in `metadata.difficulty`. Fixtures only; no real user data.

## `$fixture` references

Any value may be `{"$fixture": "relative/path"}`, resolved by `src/datasets.ts` against
the agent's dataset dir before validation. `.json` fixtures parse as JSON; anything else
inlines as text. Used for:

- `assertions` → the shared `assertion_pack.json` (edit once, applies to every case)
- long transcripts → `field_reporter/source_material/*.md`
- `metadata.namespaces` → `coach_multiagent/kb_fixtures/namespaces.json`

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

- `fr.budget_ok` `max_tool_calls: 5` — `MAX_WEB_SEARCHES_PER_RUN` in the field-reporter repo
- `fr.revisions_ok` `max_revisions: 3` — `MAX_REVISIONS` in its graph
- `fr.citations_present` `min: 3` — its own `has_three_citations` rubric criterion

Re-check those constants in the agent repos when bumping this dataset.
