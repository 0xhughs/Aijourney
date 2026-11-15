#!/usr/bin/env python3
"""
Synthesizes all 196 offline Arabic voice clips using open-source Piper Neural TTS
(ar_JO-kareem-medium ONNX VITS model from rhasspy/piper-voices) and encodes to AAC .m4a,
then writes js/course-data.js and js/audio-manifest.js.
"""
import concurrent.futures
import hashlib
import json
import os
import re
import subprocess
import tempfile
import urllib.request
import wave
from pathlib import Path

from piper import PiperVoice

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "content"
AUDIO_DIR = ROOT / "assets" / "audio"
MODEL_DIR = Path(tempfile.gettempdir()) / "piper-ar"
ONNX_PATH = MODEL_DIR / "ar_JO-kareem-medium.onnx"
JSON_PATH = MODEL_DIR / "ar_JO-kareem-medium.onnx.json"

BASE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium"


def ensure_model():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if not ONNX_PATH.exists() or ONNX_PATH.stat().st_size < 1_000_000:
        urllib.request.urlretrieve(f"{BASE_URL}/ar_JO-kareem-medium.onnx", ONNX_PATH)
    if not JSON_PATH.exists():
        urllib.request.urlretrieve(f"{BASE_URL}/ar_JO-kareem-medium.onnx.json", JSON_PATH)


def sha1_short(text: str) -> str:
    return hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:12]


def fnv1a_js_key(text: str) -> str:
    s = text.strip()
    # Match JS UTF-16 code-unit loop in js/audio.js
    u16 = s.encode("utf-16-le")
    code_units = [u16[i] | (u16[i + 1] << 8) for i in range(0, len(u16), 2)]
    h = 0x811C9DC5
    for cu in code_units:
        h ^= cu
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}_{len(code_units)}"


def clean_for_tts(text: str) -> str:
    t = re.sub(r'[«»"“”]', " ", text)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def encode_m4a(args):
    wav_path, m4a_path = args
    try:
        subprocess.run(
            [
                "/opt/homebrew/bin/ffmpeg",
                "-y",
                "-loglevel",
                "error",
                "-i",
                str(wav_path),
                "-ac",
                "1",
                "-ar",
                "22050",
                "-c:a",
                "aac",
                "-b:a",
                "48k",
                str(m4a_path),
            ],
            check=True,
        )
    finally:
        try:
            os.unlink(wav_path)
        except OSError:
            pass


def main():
    ensure_model()
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    units = []
    clips = {}  # fnv_key -> (sha_name, raw_text)

    for i in range(1, 11):
        uid = f"U{i:02d}"
        u = json.loads((CONTENT_DIR / f"{uid}.json").read_text(encoding="utf-8"))
        units.append(u)
        for st in u["stages"]:
            if st.get("audioIntro"):
                txt = st["audioIntro"].strip()
                clips[fnv1a_js_key(txt)] = (sha1_short(txt), txt)
            for step in st["steps"]:
                if step.get("listen") and step.get("context"):
                    txt = step["context"].strip()
                    clips[fnv1a_js_key(txt)] = (sha1_short(txt), txt)

    # Write js/course-data.js
    bundle = (
        "/* Auto-generated from content/U01.json..U10.json — do not hand-edit */\n"
        "window.COURSE_DATA = "
        + json.dumps({"units": units}, ensure_ascii=False)
        + ";\n"
    )
    (ROOT / "js" / "course-data.js").write_text(bundle, encoding="utf-8")
    print(f"Wrote js/course-data.js across {len(units)} units.")

    print(f"Loading Piper neural Arabic voice ({ONNX_PATH.name})...")
    voice = PiperVoice.load(str(ONNX_PATH), config_path=str(JSON_PATH))

    encode_jobs = []
    manifest = {}
    unique_sha = {}
    for fnv_key, (sha, txt) in clips.items():
        manifest[fnv_key] = f"assets/audio/{sha}.m4a"
        unique_sha[sha] = txt

    print(f"Synthesizing {len(unique_sha)} neural Arabic clips...")
    tmp_dir = Path(tempfile.mkdtemp(prefix="rihla_piper_"))
    for idx, (sha, txt) in enumerate(unique_sha.items(), 1):
        wav_path = tmp_dir / f"{sha}.wav"
        m4a_path = AUDIO_DIR / f"{sha}.m4a"
        with wave.open(str(wav_path), "wb") as wf:
            voice.synthesize_wav(clean_for_tts(txt), wf)
        encode_jobs.append((wav_path, m4a_path))
        if idx % 50 == 0 or idx == len(unique_sha):
            print(f"  Synthesized {idx}/{len(unique_sha)} WAVs")

    print("Encoding WAVs to AAC .m4a in parallel...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(encode_m4a, encode_jobs))

    try:
        os.rmdir(tmp_dir)
    except OSError:
        pass

    manifest_js = (
        "/* Pre-rendered offline neural Arabic audio clips (Piper ar_JO-kareem-medium) */\n"
        "window.AUDIO_MANIFEST = "
        + json.dumps(manifest, ensure_ascii=False)
        + ";\n"
    )
    (ROOT / "js" / "audio-manifest.js").write_text(manifest_js, encoding="utf-8")
    print(f"Done! {len(manifest)} neural Arabic audio entries mapped.")


if __name__ == "__main__":
    main()
