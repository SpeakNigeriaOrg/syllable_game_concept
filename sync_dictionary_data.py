"""
sync_dictionary_data.py

This game no longer generates its own dictionary data - vocab.json,
syllables.json, and sessions.json are built by the separate
yoruba-student-dict repo (Kaikki cross-checking, syllable derivation, R2
deployment-readiness). This just vendors its latest public/ output into
this game's public/phonics/ folder as a deliberately simple, manual hand-off:
no live sync, no API, just re-run this after regenerating the dictionary
repo's outputs and commit the refreshed copies here.

Assumes yoruba-student-dict is checked out as a sibling directory
(../yoruba-student-dict relative to this repo).
"""

import shutil
import sys
from pathlib import Path

FILES = ["vocab.json", "syllables.json", "sessions.json"]


def main():
    source_dir = Path(__file__).parent.parent / "yoruba-student-dict" / "public"
    dest_dir = Path(__file__).parent / "public" / "phonics"

    if not source_dir.is_dir():
        sys.exit(f"Expected to find {source_dir} - is yoruba-student-dict "
                  f"checked out as a sibling directory?")

    for name in FILES:
        src = source_dir / name
        if not src.exists():
            print(f"[skip] {src} does not exist")
            continue
        shutil.copy2(src, dest_dir / name)
        print(f"Copied {src} -> {dest_dir / name}")


if __name__ == "__main__":
    main()
