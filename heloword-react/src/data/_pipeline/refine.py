"""
refine.py — quality-refinement loop for EXISTING sentences.

Walks the EN/JP datasets in cursor-tracked batches so the model can rewrite the
ones that read awkwardly — making the Traditional Chinese sound like natural,
colloquial young-Taiwanese Mandarin, and fixing stiff/unnatural EN or JP.
Never regenerates or reorders; only edits existing records in place.

State: refine-state.json  ·  Log: refine-log.md

Commands (run from _pipeline/):
  python3 refine.py status                 progress + which dataset is behind
  python3 refine.py pick                    prints 'en' or 'jp' (lower % reviewed)
  python3 refine.py next <en|jp> <N>        print next N unreviewed records (JSON)
  python3 refine.py apply <en|jp> <file>    apply edits [{id, <changed fields>}...]
                                            advances cursor past the whole batch
  python3 refine.py set <en|jp> <idx>       manually move a cursor
"""
import json, os, re, sys, datetime, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.dirname(HERE)
EN_PATH = os.path.join(DATA, "scramble-en.json")
JP_PATH = os.path.join(DATA, "scramble-jp.json")
STATE = os.path.join(HERE, "refine-state.json")
RUNLOG = os.path.join(HERE, "refine-log.md")
INDENT = {EN_PATH: 4, JP_PATH: 2}          # keep each file's native indent → tiny diffs

# fields the model is allowed to edit per dataset (guards against schema drift)
EDITABLE = {
    "en": {"translate_ch", "sentence"},
    "jp": {"translation", "japanese", "chunks", "english"},
}


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def dump(p, o):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(o, f, ensure_ascii=False, indent=INDENT.get(p, 2))
        f.write("\n")


def norm_jp(s):
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"\s+", "", re.sub(r"[、。．，,.!?！？「」『』（）()　]", "", s))


def path(lang):
    if lang not in ("en", "jp"):
        sys.exit("lang must be 'en' or 'jp'")
    return EN_PATH if lang == "en" else JP_PATH


def get_state():
    if os.path.exists(STATE):
        return load(STATE)
    return {"en": {"idx": 0, "pending": 0}, "jp": {"idx": 0, "pending": 0}}


def pct(idx, total):
    return 100 * idx // max(1, total)


def cmd_status(_):
    st = get_state()
    for lang in ("en", "jp"):
        data = load(path(lang)); s = st[lang]
        print(f"{lang}: reviewed {s['idx']}/{len(data)} ({pct(s['idx'], len(data))}%)"
              f", pending batch {s['pending']}")


def cmd_pick(_):
    st = get_state()
    ps = {}
    for lang in ("en", "jp"):
        total = len(load(path(lang)))
        ps[lang] = (st[lang]["idx"] / max(1, total), st[lang]["idx"] >= total)
    # skip finished datasets; otherwise the one with lower fraction reviewed
    live = [l for l in ("en", "jp") if not ps[l][1]]
    if not live:
        print("done"); return
    print(min(live, key=lambda l: ps[l][0]))


def cmd_next(args):
    lang, n = args[0], int(args[1])
    st = get_state(); data = load(path(lang)); idx = st[lang]["idx"]
    batch = data[idx:idx + n]
    st[lang]["pending"] = len(batch); dump(STATE, st)
    print(json.dumps(batch, ensure_ascii=False, indent=2))


def cmd_apply(args):
    lang, fpath = args[0], args[1]
    edits = load(fpath)
    data = load(path(lang))
    by = {str(r["id"]): r for r in data}
    errs = []; changed = 0
    for e in edits:
        rid = str(e.get("id"))
        if rid not in by:
            errs.append(f"unknown id {rid}"); continue
        bad = [k for k in e if k != "id" and k not in EDITABLE[lang]]
        if bad:
            errs.append(f"id {rid}: non-editable field(s) {bad}"); continue
        r = by[rid]
        for k, v in e.items():
            if k == "id":
                continue
            r[k] = v
        if lang == "jp" and norm_jp(r.get("japanese", "")) != norm_jp("".join(r.get("chunks", []))):
            errs.append(f"id {rid}: chunks must concatenate to japanese (edit both together)")
        changed += 1
    if errs:
        print("APPLY FAILED — no changes written:", *errs, sep="\n  ", file=sys.stderr)
        sys.exit(1)
    dump(path(lang), data)
    st = get_state()
    advanced = st[lang]["pending"]
    st[lang]["idx"] += advanced
    st[lang]["pending"] = 0
    dump(STATE, st)
    ts = datetime.date.today().isoformat()
    with open(RUNLOG, "a", encoding="utf-8") as fh:
        fh.write(f"- **{ts}** {lang}: refined {changed}/{advanced} in batch → cursor {st[lang]['idx']}\n")
    print(f"applied {changed} edit(s) across a batch of {advanced}; {lang} cursor → {st[lang]['idx']}")


def cmd_set(args):
    lang, idx = args[0], int(args[1])
    st = get_state(); st[lang]["idx"] = idx; st[lang]["pending"] = 0; dump(STATE, st)
    print(f"{lang} cursor set to {idx}")


CMDS = {"status": cmd_status, "pick": cmd_pick, "next": cmd_next,
        "apply": cmd_apply, "set": cmd_set}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in CMDS:
        print(__doc__); sys.exit(1)
    CMDS[sys.argv[1]](sys.argv[2:])
