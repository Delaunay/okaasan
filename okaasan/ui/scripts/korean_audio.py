"""Generate the sound packs used by the Hangul scratch page.

A pack is a folder of MP3s under website/uploads/language/korean/<pack>/, one
per spoken text, named by the text's code points (가 -> ac00.mp3, 나무 ->
b098-bb34.mp3), matching `clipName` in language/engine/audio.ts. packs.json in
that folder lists the packs the page offers. Set KOREAN_AUDIO_OUT to write
somewhere else.

Any folder with those file names works as a pack (e.g. your own recordings):
drop it next to the others and add it to packs.json, or to PACKS below.

    uvx --from edge-tts python scripts/korean_audio.py            # every pack
    uvx --from edge-tts python scripts/korean_audio.py sunhi      # one pack
    uvx --from edge-tts python scripts/korean_audio.py --list     # file names only
    python scripts/korean_audio.py 90daykorean                    # download that pack

The 90daykorean pack is downloaded from the clips on
https://www.90daykorean.com/how-to-learn-the-korean-alphabet/ and
https://www.90daykorean.com/korean-words/ for personal use only: it is
git-ignored, do not commit it. Their consonant clips are the letter names
(ㄱ = 기역), and some words have no clip, so the page falls back to another
pack for those.
"""
import asyncio
import json
import re
import sys
from pathlib import Path

import os

HERE = Path(__file__).resolve().parent.parent
PACK = HERE / "src/components/scratch/language/korean"
# ui -> okaasan -> recipes -> website
OUT = Path(os.environ.get("KOREAN_AUDIO_OUT", HERE.parents[2] / "uploads/language/korean"))

# id -> (label, edge-tts voice, rate)
PACKS = {
    "sunhi": ("SunHi (female)", "ko-KR-SunHiNeural", "-15%"),
    "injoon": ("InJoon (male)", "ko-KR-InJoonNeural", "-15%"),
    "sunhi-slow": ("SunHi, slow", "ko-KR-SunHiNeural", "-45%"),
}

VOCAB_PAGE = "https://www.90daykorean.com/korean-words/"

# Downloaded packs: id -> (label, {jamo: url})
S3 = "https://90daykoreanaudiobytes.s3-us-west-1.amazonaws.com/audio-"
DOWNLOADS = {
    "90daykorean": ("90 Day Korean (letter names)", {
        **{c: f"{S3}{n}.mp3" for c, n in zip(
            "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅉㅊㅋㅌㅍㅎ",
            ["giyeok", "ssanggiyeok-new", "nieun-new", "digeut", "ssangdigeut", "rieul", "mieum", "bieup",
             "ssangbieup", "siot", "ssangsiot", "ieung", "ssangjieut", "chieut", "kieuk", "tieut-new",
             "pieup-new", "hieut"])},
        "ㅈ": "https://members.90daykorean.com/wp-content/uploads/2017/01/%E3%85%88.mp3",
        **{v: f"{S3}{n}.mp3" for v, n in zip(
            "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ",
            ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo",
             "we", "wi", "yu", "eu", "ui", "i"])},
    }),
}

LEADS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"


def pack_source():
    return "\n".join(p.read_text() for p in sorted(PACK.glob("*.ts*")))


def compose(lead, vowel):
    return chr(0xAC00 + (LEADS.index(lead) * 21 + VOWELS.index(vowel)) * 28)


def name(text):
    return "-".join(f"{ord(c):x}" for c in text) + ".mp3"


def sound_text(jamo, src):
    """The text the page plays for a letter (soundOf in the page)."""
    say = re.search(rf"ch: '{jamo}'[^\n]*say: '([^']+)'", src)
    if say:
        return say.group(1)
    return compose(jamo, "ㅏ") if jamo in LEADS else compose("ㅇ", jamo)


def texts():
    src = pack_source()
    out = [compose(c, "ㅏ") for c in LEADS] + [compose("ㅇ", v) for v in VOWELS]
    out += re.findall(r"say: '([^']+)'", src)
    out += re.findall(r"\{ ko: '([^']+)'", src)
    out += re.findall(r"polite: '([^']+)'", src)
    return list(dict.fromkeys(out))


def fetch(url):
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req).read()


def vocab_clips():
    """{korean text: clip url} for the words and example sentences on the vocabulary page."""
    import html

    page = fetch(VOCAB_PAGE).decode()
    clips = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, flags=re.S):
        for cell in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, flags=re.S):
            mp3 = re.search(r"https?://[^\"' )]+\.mp3", cell)
            text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", cell))).strip()
            ko = re.match(r"^(.*?)\s*\(", text)
            if mp3 and ko:
                clips.setdefault(ko.group(1).strip(), mp3.group(0))
    return clips


def download(pack):
    folder = OUT / pack
    folder.mkdir(parents=True, exist_ok=True)
    src = pack_source()
    wanted = {name(sound_text(jamo, src)): url for jamo, url in DOWNLOADS[pack][1].items()}
    if pack == "90daykorean":
        needed = set(texts())
        wanted.update({name(t): url for t, url in vocab_clips().items() if t in needed})
    for file, url in wanted.items():
        dest = folder / file
        if not dest.exists():
            dest.write_bytes(fetch(url))
    (folder / ".gitignore").write_text("*\n")
    print(f"{pack}: {len(list(folder.glob('*.mp3')))} clips")


async def generate(pack):
    import edge_tts

    _, voice, rate = PACKS[pack]
    folder = OUT / pack
    folder.mkdir(parents=True, exist_ok=True)
    todo = [t for t in texts() if not (folder / name(t)).exists()]
    for t in todo:
        await edge_tts.Communicate(t, voice, rate=rate).save(str(folder / name(t)))
    print(f"{pack}: {len(todo)} generated, {len(texts())} total")


def write_manifest():
    # Keep packs added by hand, refresh the generated ones.
    path = OUT / "packs.json"
    packs = json.loads(path.read_text()) if path.exists() else []
    packs = [p for p in packs if p["id"] not in PACKS and p["id"] not in DOWNLOADS]
    packs = [{"id": k, "label": v[0]} for k, v in PACKS.items() if (OUT / k).is_dir()] + packs
    packs += [{"id": k, "label": v[0], "names": True} for k, v in DOWNLOADS.items() if (OUT / k).is_dir()]
    path.write_text(json.dumps(packs, indent=2, ensure_ascii=False) + "\n")


async def main(args):
    if "--list" in args:
        for t in texts():
            print(t, name(t))
        return
    for pack in args or list(PACKS):
        if pack in DOWNLOADS:
            download(pack)
        else:
            await generate(pack)
    write_manifest()


asyncio.run(main(sys.argv[1:]))
