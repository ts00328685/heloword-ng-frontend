# Data-quality pipeline — per-iteration instructions

You are improving two datasets used for translation / speaking practice:
`src/data/scramble-en.json` (English) and `src/data/scramble-jp.json` (Japanese).
All mechanical work is done by `src/data/_pipeline/tools.py`; you spend effort
only on the **linguistic** work. Run one iteration per turn, then stop.

Working dir for all commands: `src/data/_pipeline/`.

## Knobs (tune to control how much you consume per iteration)
- `CLEAN_BATCH = 100`   English sentences to de-name
- `GEN_EN = 8`, `GEN_JP = 8`   new sentences to generate
- `TOPICS = 3`   topics to pull from the rotation wheel

## Each iteration

### 0. (first run only) `python3 tools.py setup`

### 1. Repair broken JP records (do until none remain)
```
python3 tools.py jp-errors
```
If it returns items, fix each so `chunks` concatenated == `japanese` exactly,
keeping meaning aligned with `translation`/`english`. Write `_tmp_jpfix.json`
as `[{id, japanese, chunks}]` and apply:
```
python3 tools.py apply-jp-fix _tmp_jpfix.json
```

### 2. De-name English (`CLEAN_BATCH` items)
```
python3 tools.py worklist 25
```
For each item, rewrite `sentence` to remove **person names, company/institution
names, brands, sports clubs, and obscure place/event names**, while:
- **preserving the target vocabulary** (the rare/learning word — e.g. *abandon*,
  *maneuver*, *abnormal* — must stay) and the grammatical shape;
- replacing names with natural generic refs (*Ed Miliband*→*the party leader*,
  *Newcastle United*→*the football club*, *University of Chicago*→*the research
  team*, *Enola Gay*→*the lead bomber*);
- **keeping** well-known countries, nationalities, and languages if they read
  naturally (the flagger over-flags these — leave them);
- if a flagged token is just an abbreviation/acronym in parentheses (e.g.
  *(AV)*), drop the parenthetical and keep the sentence.
Then regenerate `translate_ch` (Traditional Chinese) to match the new sentence —
drop the romanization-in-parentheses style the originals used for names.
Write `_tmp_clean.json` as `[{id, sentence, translate_ch}]` and apply:
```
python3 tools.py apply-clean _tmp_clean.json
```

### 3. Generate new sentences (topic-rotated, deduped)
```
python3 tools.py next-topics 3
```
Spread `GEN_EN` English + `GEN_JP` Japanese sentences across the returned topics.
Rules:
- **No names/brands/institutions** — these are clean by construction.
- Vary structure, length, and register across the batch; mix difficulties
  (aim roughly easy/medium/hard ≈ 1/2/1).
- Make them genuinely useful for translation & speaking practice (everyday,
  concrete, natural).
- Do **not** restate the topic literally every time; let it inspire variety.

English → `_tmp_en.json` as `[{sentence, translate_ch, tags}]`
(`tags` = the topic(s) used, lowercase; brings EN toward JP parity).
Japanese → `_tmp_jp.json` as
`[{japanese, chunks, translation, english, difficulty, tags}]` where:
- `chunks` concatenated == `japanese` **exactly** (segment at natural phrase
  boundaries — particle/clause units, like the existing data);
- `translation` = Traditional Chinese, `english` = natural English;
- `difficulty` ∈ {easy, medium, hard}; `tags` include a JLPT level (N5–N1) + topics.
```
python3 tools.py append-en _tmp_en.json
python3 tools.py append-jp _tmp_jp.json
```
`append-*` silently skips exact duplicates and reports them on stderr. If many
were skipped, generate replacements with more variation.

### 4. Validate, log, clean up, commit
```
python3 tools.py validate
rm -f _tmp_*.json
python3 tools.py log "iter: repaired N jp, de-named N en, +N en +N jp (topics...)"
```
Then from the repo root commit to the pipeline branch (create it once):
```
git add src/data/scramble-en.json src/data/scramble-jp.json src/data/_pipeline
git commit -m "data: de-name EN, repair/extend EN+JP (pipeline run)"
```

## When the de-naming worklist is exhausted
`status` shows `clean_pending: 0`. Stop step 2 and shift those tokens into
step 3 (raise `GEN_EN`/`GEN_JP`) so the loop keeps generating fresh,
topic-varied data indefinitely without duplicates.
