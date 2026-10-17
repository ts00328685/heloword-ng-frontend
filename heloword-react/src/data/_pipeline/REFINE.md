# Refinement loop — per-iteration instructions

Goal: raise the **quality & naturalness** of the *existing* sentences in
`src/data/scramble-en.json` and `src/data/scramble-jp.json`. This loop does NOT
generate or delete anything — it walks the datasets in cursor-tracked batches and
rewrites only the records that read awkwardly.

North star: everything should sound like a **natural, colloquial, young
Taiwanese** person — not textbook, not stiff, not machine-translated.

Working dir for all commands: `src/data/_pipeline/`.

## Each iteration
1. `python3 refine.py pick` → tells you which dataset (`en`/`jp`) is furthest behind. (Or choose one explicitly.)
2. `python3 refine.py next <lang> 20` → prints the next 20 unreviewed records.
3. Read all 20. For each, decide: **is it already natural? leave it.** Only edit
   the ones that are awkward/unnatural/wrong. Aim to change roughly the ones that
   genuinely need it (often 5–15 of 20), not to churn good sentences.
4. Write only the changed records to `_tmp_refine.json` as `[{id, <changed fields>}]`.
5. `python3 refine.py apply <lang> _tmp_refine.json` (advances the cursor past the
   whole batch, validates JP chunks, logs).
6. `rm -f _tmp_refine.json`, then commit (see bottom).

## What to fix

### Traditional Chinese (`translate_ch` in EN, `translation` in JP) — the main lever
- Must read as **colloquial young-Taiwanese Mandarin**. Prefer 其實 / 根本 / 就 /
  才 / 而已 / 反而 / 超 / 蠻 / 到底 / 直接 / 幹嘛, and direct 你.
- Kill textbook/translationese: drop 之／者／予以／乃／其 over-formality, stiff
  「使得」「令」「進行…」, over-literal word-for-word renderings, and
  mainland-flavoured phrasing (e.g. 視頻→影片, 質量→品質, 信息→資訊, 軟件→軟體,
  屏幕→螢幕, 網絡→網路, 土豆→馬鈴薯, 熊貓→貓熊, 公車 not 公交, 計程車 not 出租車).
- Keep it faithful to the sentence's meaning — improve fluency, don't change facts.

### English (`sentence`) — fix only if clearly awkward
- Should be natural, idiomatic English a real person would say/write. Fix
  clunky/ungrammatical/translated-sounding ones. Leave good sentences alone.

### Japanese (`japanese` + `english`) — fix only if clearly awkward
- `japanese` should sound natural to a native (not stiff/textbook, not MT).
- **If you change `japanese`, you MUST also update `chunks`** so that
  `"".join(chunks) == japanese` exactly (≥5 chunks; split particles は/を/が/に/で/
  へ/と/も/から/まで/の… into their own chunks; keep verb+okurigana and the final
  。 attached; 、 attaches to the preceding chunk). If you only fix the Chinese
  `translation`, leave `japanese`/`chunks` untouched.
- `english` (the gloss) should be natural too; fix if awkward.

## Rules
- Edit in place only — never add, remove, reorder, or renumber records.
- Only send changed records in `_tmp_refine.json`; unchanged ones are skipped and
  the cursor still advances (they count as reviewed).
- Preserve `id`, `difficulty`, `tags`.
- `apply` refuses the batch if any JP record's chunks no longer concatenate, or if
  you touch a non-editable field — fix and re-run.

## Commit (from repo root, on branch `data/quality-pipeline`)
```
python3 refine.py status   # optional: see progress
git add src/data/scramble-en.json src/data/scramble-jp.json src/data/_pipeline
git commit -m "data(refine): naturalize <N> <lang> sentences (batch → cursor X)"
```
