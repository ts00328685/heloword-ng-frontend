#!/usr/bin/env python3
"""
Data-quality pipeline toolkit for scramble-en.json / scramble-jp.json.

All the cheap, deterministic mechanics live here so the /loop iterations spend
Claude tokens only on the linguistic work (rewriting, tagging, generating).

Subcommands:
  setup                     Build seen.json, topics.json, worklist.json, manifest.json (idempotent).
  status                    Print progress stats.
  worklist [N]              Emit the next N pending flagged EN items to clean (JSON to stdout).
  apply-clean <file>        Apply model-cleaned EN items [{id,sentence,translate_ch}] in place.
  next-topics [K]           Emit the next K topics from the rotation wheel and advance the pointer.
  append-en <file>          Dedup-check & append new EN items [{sentence,translate_ch,tags}].
  append-jp <file>          Dedup-check & append new JP items (full schema).
  validate                  Parse + schema + duplicate-id checks on both datasets.

Files written under this _pipeline/ dir:
  manifest.json  worklist.json  seen.json  topics.json  runlog.md
"""
import json, os, re, sys, hashlib, datetime, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.dirname(HERE)
EN_PATH = os.path.join(DATA, "scramble-en.json")
JP_PATH = os.path.join(DATA, "scramble-jp.json")
GROUPS_PATH = os.path.join(DATA, "jp-tag-groups.json")
MANIFEST = os.path.join(HERE, "manifest.json")
WORKLIST = os.path.join(HERE, "worklist.json")
SEEN = os.path.join(HERE, "seen.json")
TOPICS = os.path.join(HERE, "topics.json")
RUNLOG = os.path.join(HERE, "runlog.md")

# Capitalized words that are fine to keep (nationalities, languages, calendar, etc.)
SAFE = set(w.lower() for w in """
English Japanese Chinese American British French German Russian European African
Asian Indian Spanish Italian Korean Canadian Australian Mexican Brazilian Dutch
Swedish Greek Turkish Arabic Latin Western Eastern Northern Southern
Monday Tuesday Wednesday Thursday Friday Saturday Sunday
January February March April May June July August September October November December
God Internet Earth Mars Moon Sun
""".split())

WORD_RE = re.compile(r"[A-Za-z][A-Za-z'.-]*")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# Preserve each dataset's native indentation so diffs stay minimal/reviewable.
INDENT = {EN_PATH: 4, JP_PATH: 2}


def dump(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=INDENT.get(path, 2))
        f.write("\n")


def norm_en(s):
    s = unicodedata.normalize("NFKC", s).lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def norm_jp(s):
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"\s+", "", re.sub(r"[、。．，,.!?！？「」『』（）()　]", "", s))


def h(s):
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:16]


def suspects(sentence):
    """Capitalized mid-sub-sentence tokens that look like names/brands/institutions."""
    out = []
    for sub in re.split(r"(?<=[.!?])\s+|[\"“”]", sentence):
        toks = WORD_RE.findall(sub)
        for i, tok in enumerate(toks):
            if i == 0:
                continue  # legitimate sentence-initial capital
            base = tok.strip(".'-")
            if not base or base == "I":
                continue
            if base[0].isupper() and base.lower() not in SAFE:
                out.append(base)
    # de-dup, keep order
    seen, res = set(), []
    for w in out:
        if w not in seen:
            seen.add(w); res.append(w)
    return res


# ─────────────────────────────────────────────────────────────────────────────
def cmd_setup(_args):
    en = load(EN_PATH)
    jp = load(JP_PATH)

    # seen index (exact-normalized dedup for generation)
    if not os.path.exists(SEEN):
        seen = {"en": {}, "jp": {}}
        for r in en:
            seen["en"][h(norm_en(r["sentence"]))] = r["id"]
        for r in jp:
            seen["jp"][h(norm_jp(r["japanese"]))] = r["id"]
        dump(SEEN, seen)
        print(f"seen.json: {len(seen['en'])} en + {len(seen['jp'])} jp")

    # worklist of flagged EN sentences needing de-naming
    if not os.path.exists(WORKLIST):
        wl = []
        for r in en:
            sus = suspects(r["sentence"])
            if sus:
                wl.append({"id": r["id"], "suspects": sus})
        dump(WORKLIST, wl)
        print(f"worklist.json: {len(wl)} of {len(en)} EN flagged for review")

    # topic rotation wheel (interleave groups so each day varies)
    if not os.path.exists(TOPICS):
        groups = load(GROUPS_PATH)
        # drop pure JLPT/grammar-noise tags; keep real topics
        skip = {"grammar", "conditional", "comparison", "contrast", "counting"}
        lists = []
        for g in groups:
            lists.append([(t, g["label"]) for t in g["tags"] if t not in skip])
        wheel = []
        for i in range(max(len(x) for x in lists)):
            for lst in lists:
                if i < len(lst):
                    wheel.append({"topic": lst[i][0], "group": lst[i][1]})
        dump(TOPICS, {"pointer": 0, "wheel": wheel})
        print(f"topics.json: {len(wheel)} topics in rotation")

    # manifest (state)
    if not os.path.exists(MANIFEST):
        en_ids = [int(r["id"]) for r in en]
        jp_ids = [int(r["id"]) for r in jp]
        dump(MANIFEST, {
            "en_next_id": max(en_ids) + 1,
            "jp_next_id": max(jp_ids) + 1,
            "worklist_pointer": 0,
            "cleaned_ids": [],
            "generated_en": 0,
            "generated_jp": 0,
            "runs": 0,
        })
        print("manifest.json initialized")

    if not os.path.exists(RUNLOG):
        with open(RUNLOG, "w", encoding="utf-8") as f:
            f.write("# Data pipeline run log\n\n")
    print("setup complete.")


def cmd_status(_args):
    m = load(MANIFEST); wl = load(WORKLIST)
    pending = len(wl) - m["worklist_pointer"]
    print(json.dumps({
        "en_total": len(load(EN_PATH)),
        "jp_total": len(load(JP_PATH)),
        "flagged_total": len(wl),
        "cleaned": len(m["cleaned_ids"]),
        "clean_pending": pending,
        "generated_en": m["generated_en"],
        "generated_jp": m["generated_jp"],
        "runs": m["runs"],
        "en_next_id": m["en_next_id"],
        "jp_next_id": m["jp_next_id"],
    }, indent=2))


def cmd_worklist(args):
    n = int(args[0]) if args else 25
    m = load(MANIFEST); wl = load(WORKLIST); en = load(EN_PATH)
    by_id = {r["id"]: r for r in en}
    batch, p = [], m["worklist_pointer"]
    while p < len(wl) and len(batch) < n:
        item = wl[p]; r = by_id.get(item["id"]); p += 1
        if r and item["id"] not in set(m["cleaned_ids"]):
            batch.append({"id": r["id"], "suspects": item["suspects"],
                          "sentence": r["sentence"], "translate_ch": r["translate_ch"]})
    print(json.dumps(batch, ensure_ascii=False, indent=2))


def cmd_apply_clean(args):
    items = load(args[0])
    en = load(EN_PATH); seen = load(SEEN); m = load(MANIFEST)
    by_id = {r["id"]: r for r in en}
    n = 0
    for it in items:
        r = by_id.get(it["id"])
        if not r:
            print(f"  ! id {it['id']} not found", file=sys.stderr); continue
        old = norm_en(r["sentence"])
        r["sentence"] = it["sentence"].strip()
        r["translate_ch"] = it["translate_ch"].strip()
        seen["en"].pop(h(old), None)
        seen["en"][h(norm_en(r["sentence"]))] = r["id"]
        if r["id"] not in m["cleaned_ids"]:
            m["cleaned_ids"].append(r["id"])
        n += 1
    # advance pointer past the batch range we served
    served = {it["id"] for it in items}
    wl = load(WORKLIST); p = m["worklist_pointer"]
    while p < len(wl) and (wl[p]["id"] in served or wl[p]["id"] in set(m["cleaned_ids"])):
        p += 1
    m["worklist_pointer"] = p
    dump(EN_PATH, en); dump(SEEN, seen); dump(MANIFEST, m)
    print(f"applied {n} cleaned EN sentences; worklist pointer -> {p}")


def cmd_next_topics(args):
    k = int(args[0]) if args else 3
    t = load(TOPICS); jp = load(JP_PATH)
    tagcount = {}
    for r in jp:
        for tag in r.get("tags", []):
            tagcount[tag] = tagcount.get(tag, 0) + 1
    out, p = [], t["pointer"]
    for _ in range(k):
        w = t["wheel"][p % len(t["wheel"])]
        out.append({**w, "existing_jp_count": tagcount.get(w["topic"], 0)})
        p += 1
    t["pointer"] = p % len(t["wheel"])
    dump(TOPICS, t)
    print(json.dumps(out, ensure_ascii=False, indent=2))


def _append(path, items, normfn, keyfield, build, lang):
    data = load(path); seen = load(SEEN); m = load(MANIFEST)
    added, dups = [], []
    idkey = "en_next_id" if lang == "en" else "jp_next_id"
    for it in items:
        key = h(normfn(it[keyfield]))
        if key in seen[lang]:
            dups.append(it[keyfield]); continue
        rec = build(it, m[idkey]); m[idkey] += 1
        data.append(rec); seen[lang][key] = rec["id"]; added.append(rec["id"])
    m["generated_" + lang] += len(added)
    dump(path, data); dump(SEEN, seen); dump(MANIFEST, m)
    print(f"added {len(added)} {lang} (ids {added[:3]}{'...' if len(added)>3 else ''}); "
          f"skipped {len(dups)} duplicates")
    for d in dups:
        print(f"  dup: {d[:60]}", file=sys.stderr)


def cmd_append_en(args):
    def build(it, i):
        return {"id": i, "translate_ch": it["translate_ch"].strip(),
                "sentence": it["sentence"].strip()}
    _append(EN_PATH, load(args[0]), norm_en, "sentence", build, "en")


def cmd_append_jp(args):
    req = ("japanese", "chunks", "translation", "english", "difficulty", "tags")
    items = load(args[0])
    for it in items:
        miss = [k for k in req if k not in it]
        if miss:
            sys.exit(f"jp item missing fields {miss}: {it.get('japanese','?')[:30]}")
        if "".join(it["chunks"]) != it["japanese"]:
            sys.exit(f"chunks must concatenate to japanese exactly: {it['japanese'][:30]}")
    def build(it, i):
        return {"id": str(i), "japanese": it["japanese"].strip(), "chunks": it["chunks"],
                "translation": it["translation"].strip(), "english": it["english"].strip(),
                "difficulty": it["difficulty"], "tags": it["tags"]}
    _append(JP_PATH, items, norm_jp, "japanese", build, "jp")


def cmd_fix_jp_spaces(_args):
    """Deterministically strip spurious spaces from `japanese` where chunks agree."""
    jp = load(JP_PATH); seen = load(SEEN); n = 0
    for r in jp:
        concat = "".join(r["chunks"])
        if r["japanese"] != concat and norm_jp(r["japanese"]) == norm_jp(concat):
            old = h(norm_jp(r["japanese"]))
            r["japanese"] = concat
            seen["jp"].pop(old, None)
            seen["jp"][h(norm_jp(concat))] = r["id"]
            n += 1
    dump(JP_PATH, jp); dump(SEEN, seen)
    print(f"fixed spurious spaces in {n} JP `japanese` fields")


def cmd_jp_errors(_args):
    """Emit JP records where `japanese` and `chunks` truly diverge (need repair)."""
    jp = load(JP_PATH); out = []
    for r in jp:
        if norm_jp(r["japanese"]) != norm_jp("".join(r["chunks"])):
            out.append({"id": r["id"], "japanese": r["japanese"],
                        "chunks": r["chunks"], "translation": r["translation"],
                        "english": r["english"]})
    print(json.dumps(out, ensure_ascii=False, indent=2))


def cmd_apply_jp_fix(args):
    """Apply model-repaired JP records [{id,japanese,chunks,translation,english}]."""
    items = load(args[0]); jp = load(JP_PATH); seen = load(SEEN)
    by_id = {r["id"]: r for r in jp}; n = 0
    for it in items:
        r = by_id.get(str(it["id"]))
        if not r:
            print(f"  ! jp id {it['id']} not found", file=sys.stderr); continue
        if norm_jp(it["japanese"]) != norm_jp("".join(it["chunks"])):
            sys.exit(f"repair for id {it['id']}: chunks must concatenate to japanese")
        old = h(norm_jp(r["japanese"]))
        r["japanese"] = it["japanese"].strip(); r["chunks"] = it["chunks"]
        r["translation"] = it.get("translation", r["translation"]).strip()
        r["english"] = it.get("english", r["english"]).strip()
        seen["jp"].pop(old, None); seen["jp"][h(norm_jp(r["japanese"]))] = r["id"]; n += 1
    dump(JP_PATH, jp); dump(SEEN, seen)
    print(f"repaired {n} JP records")


def cmd_validate(_args):
    ok = True
    en = load(EN_PATH); jp = load(JP_PATH)
    for name, data in (("en", en), ("jp", jp)):
        ids = [str(r["id"]) for r in data]
        if len(ids) != len(set(ids)):
            print(f"  ! {name}: duplicate ids", file=sys.stderr); ok = False
    for r in en:
        if not r.get("sentence") or not r.get("translate_ch"):
            print(f"  ! en id {r.get('id')}: empty field", file=sys.stderr); ok = False
    bad = 0
    for r in jp:
        # whitespace-tolerant: the scramble game joins chunks; stray spaces are harmless
        if norm_jp(r.get("japanese", "")) != norm_jp("".join(r.get("chunks", []))):
            bad += 1
            if bad <= 10:
                print(f"  ! jp id {r.get('id')}: chunks/japanese diverge", file=sys.stderr)
            ok = False
    if bad:
        print(f"  ({bad} JP divergences — run `tools.py jp-errors` to list, repair via loop)",
              file=sys.stderr)
    print("validate: OK" if ok else "validate: FAILED")
    sys.exit(0 if ok else 1)


def log_run(summary):
    m = load(MANIFEST); m["runs"] += 1; dump(MANIFEST, m)
    ts = datetime.date.today().isoformat()
    with open(RUNLOG, "a", encoding="utf-8") as f:
        f.write(f"- **{ts}** (run #{m['runs']}): {summary}\n")
    print(f"logged run #{m['runs']}")


def cmd_log(args):
    log_run(" ".join(args) if args else "(no summary)")


CMDS = {"setup": cmd_setup, "status": cmd_status, "worklist": cmd_worklist,
        "apply-clean": cmd_apply_clean, "next-topics": cmd_next_topics,
        "append-en": cmd_append_en, "append-jp": cmd_append_jp,
        "fix-jp-spaces": cmd_fix_jp_spaces, "jp-errors": cmd_jp_errors,
        "apply-jp-fix": cmd_apply_jp_fix,
        "validate": cmd_validate, "log": cmd_log}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in CMDS:
        print(__doc__); sys.exit(1)
    CMDS[sys.argv[1]](sys.argv[2:])
