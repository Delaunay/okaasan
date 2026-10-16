"""Build the sound packs of a language pack.

A language lives in website/uploads/language/<name>/: pack.json describes it,
data/*.json holds the content, audio/ the sound packs. Every string found under
one of pack.json's "audioFields" keys in the data files is a text to voice.
Each sound pack is a folder of MP3s, one per text, named by its code points
(가 -> ac00.mp3, 나무 -> b098-bb34.mp3; see clipName in language/engine/audio.ts).
audio/packs.json lists the packs the page offers.

Packs come from two places:
  - "tts" in pack.json: generated with edge-tts (voice and rate per pack);
  - "downloads" in pack.json: audio/<id>.sources.json maps texts to clip URLs.
    Downloaded folders are git-ignored, for content we do not own.

    uvx --from edge-tts python scripts/language_audio.py korean               # every pack
    uvx --from edge-tts python scripts/language_audio.py korean sunhi         # one pack
    python scripts/language_audio.py korean 90daykorean                       # a download
    python scripts/language_audio.py korean --list                            # texts and file names

<name> can also be a path to the language folder.
"""
import asyncio
import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
# ui -> okaasan -> recipes -> website
LANGUAGES = HERE.parents[2] / "uploads/language"


def clip_name(text):
    return "-".join(f"{ord(c):x}" for c in text) + ".mp3"


def collect(node, fields, out):
    if isinstance(node, dict):
        for k, v in node.items():
            if k in fields:
                for s in v if isinstance(v, list) else [v]:
                    if isinstance(s, str) and s.strip():
                        out.append(s)
            else:
                collect(v, fields, out)
    elif isinstance(node, list):
        for v in node:
            collect(v, fields, out)


def texts(root, pack):
    out = []
    for path in pack["data"].values():
        collect(json.loads((root / path).read_text()), set(pack["audioFields"]), out)
    return list(dict.fromkeys(out))


async def generate(root, pack, spec):
    import edge_tts

    folder = root / pack["audio"]["dir"] / spec["id"]
    folder.mkdir(parents=True, exist_ok=True)
    todo = [t for t in texts(root, pack) if not (folder / clip_name(t)).exists()]
    for t in todo:
        await edge_tts.Communicate(t, spec["voice"], rate=spec.get("rate", "+0%")).save(str(folder / clip_name(t)))
    print(f"{spec['id']}: {len(todo)} generated")


def download(root, pack, pid):
    audio = root / pack["audio"]["dir"]
    sources = json.loads((audio / f"{pid}.sources.json").read_text())
    folder = audio / pid
    folder.mkdir(parents=True, exist_ok=True)
    (folder / ".gitignore").write_text("*\n")
    for text, url in sources["clips"].items():
        dest = folder / clip_name(text)
        if not dest.exists():
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            dest.write_bytes(urllib.request.urlopen(req).read())
    print(f"{pid}: {len(list(folder.glob('*.mp3')))} clips")


# The first pack is the page's default and missing clips fall back down the
# list: real recordings first, then the generated voices, and last the packs
# whose letter clips say the letter's name (only right when chosen).
def write_manifest(root, pack):
    audio = root / pack["audio"]["dir"]
    recorded, names = [], []
    for pid in pack.get("downloads", []):
        if (audio / pid).is_dir():
            src = json.loads((audio / f"{pid}.sources.json").read_text())
            if src.get("names"):
                names.append({"id": pid, "label": src["label"], "names": True})
            else:
                recorded.append({"id": pid, "label": src["label"]})
    tts = [{"id": s["id"], "label": s["label"]} for s in pack.get("tts", []) if (audio / s["id"]).is_dir()]
    (audio / "packs.json").write_text(json.dumps(recorded + tts + names, indent=2, ensure_ascii=False) + "\n")


async def main(args):
    if not args:
        sys.exit(__doc__)
    root = Path(args[0]) if "/" in args[0] else LANGUAGES / args[0]
    pack = json.loads((root / "pack.json").read_text())
    rest = args[1:]
    if "--list" in rest:
        for t in texts(root, pack):
            print(t, clip_name(t))
        return
    tts = {s["id"]: s for s in pack.get("tts", [])}
    for pid in rest or [*tts, *pack.get("downloads", [])]:
        if pid in tts:
            await generate(root, pack, tts[pid])
        else:
            download(root, pack, pid)
    write_manifest(root, pack)


asyncio.run(main(sys.argv[1:]))
