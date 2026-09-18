"""Resize and compress oversized client videos for the public site."""
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "assets" / "clients"
ORIGINALS = ROOT / "_originals"

# Already web-sized; leave them alone.
SKIP_NAMES = {
    "Showroom_V1.mp4",
    "Kumba VR - Experience Start.mp4",
    "UnityShadersProtoEV.mp4",
}

# Long or very large sources get a slightly stronger compress.
HARD_CRF = {
    "com.oculus.xrstreamingclient-20240514-232848.mp4": 28,
    "HuguenotTunnel_FinalWithMusicTextAtTop.mp4": 28,
}


def encode(src: Path, dest: Path, crf: int) -> None:
    vf = (
        "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,"
        "scale=trunc(iw/2)*2:trunc(ih/2)*2"
    )
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-stats",
        "-i", str(src),
        "-vf", vf,
        "-map", "0:v:0", "-map", "0:a?",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "fast", "-crf", str(crf),
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart",
        str(dest),
    ]
    subprocess.run(cmd, check=True)


def main() -> None:
    videos = sorted(p for p in ROOT.rglob("*.mp4") if "_originals" not in p.parts)
    for src in videos:
        if src.name in SKIP_NAMES:
            print("skip  %s" % src.relative_to(ROOT))
            continue
        slug = src.parent.name
        backup = ORIGINALS / slug / src.name
        tmp = src.with_name(src.stem + ".web.tmp.mp4")
        crf = HARD_CRF.get(src.name, 26)
        print("encode crf=%s  %s" % (crf, src.relative_to(ROOT)))
        if not backup.exists():
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(backup))
            source = backup
        else:
            source = src if src.exists() else backup
        try:
            encode(source, tmp, crf)
        except subprocess.CalledProcessError:
            if not src.exists() and backup.exists():
                shutil.copy2(backup, src)
            if tmp.exists():
                tmp.unlink()
            print("FAIL  %s" % src.relative_to(ROOT))
            continue
        before = source.stat().st_size
        after = tmp.stat().st_size
        if after >= before * 0.95:
            tmp.unlink()
            if not src.exists():
                shutil.copy2(backup, src)
            print("keep  %s (already small)" % src.relative_to(ROOT))
            continue
        if src.exists():
            src.unlink()
        tmp.replace(src)
        print("done  %s  %.1f MB -> %.1f MB" % (
            src.relative_to(ROOT), before / 1e6, after / 1e6
        ))


if __name__ == "__main__":
    main()
