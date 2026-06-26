"""Inject a Fortnite entry into PLATFORM_CONFIGS in src/managers/ChannelRouter.ts.

The script strips any broken Fortnite entry (greedy DOTALL regex) and re-inserts
a clean one before the closing ]; of PLATFORM_CONFIGS, anchored after the last
NINTENDO_CHANNEL_ID reference.

The final disk-write goes through scripts/_safe_write so the operator sees the
unified diff before the change lands, the swap is atomic, and .bak is taken on
real deltas. Running the script twice is a no-op on a clean ChannelRouter.ts.

Usage
    python scripts/add_fortnite.py                # rewrite, with backup
    python scripts/add_fortnite.py --dry-run      # show diff, write nothing
    python scripts/add_fortnite.py --no-backup    # rewrite, skip .bak

Design notes (carried over from the original):
    * The strip regex `r'\s*\{\s*\n\s*name: "Fortnite",.*?\n  \},'` (DOTALL) is
      intentionally greedy-fragile: if a future entry ever contains
      `name: "Fortnite"` mid-array, it will swallow past the next `},`
      boundary. Wrap rather than re-engineer was the explicit scope.
    * The script depends on `NINTENDO_CHANNEL_ID` appearing in
      ChannelRouter.ts; the lookup is performed by rfind so trailing
      comments do not move the insertion point, but any layout refactor of
      that array will silently break insertion.
"""

import argparse
import os
import re
import sys

# Ensure the helper module is importable when this script is invoked directly
# (e.g. `python scripts/add_fortnite.py` from the repo root).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _safe_write import safe_write  # noqa: E402

TARGET = "src/managers/ChannelRouter.ts"

# Matches any Fortnite entry block (greedy-DOTALL on `.*?\n  },`) so a broken
# one is wiped before re-insertion.
_FORTNITE_STRIP_RE = re.compile(
    r'\s*\{\s*\n\s*name: "Fortnite",.*?\n  \},', flags=re.DOTALL
)


def build_new_content(original: str) -> str | None:
    """Return the rewritten content, or None on detected layout errors.

    Errors are printed to stdout (not stderr) for compatibility with the
    original script's caller-visible behaviour.
    """
    content = _FORTNITE_STRIP_RE.sub("", original)

    idx = content.rfind("NINTENDO_CHANNEL_ID")
    if idx == -1:
        print("ERROR: Nintendo not found")
        return None
    end_idx = content.find("];", idx)
    if end_idx == -1:
        print("ERROR: Closing ]; not found")
        return None

    B = "\\b"
    entry = (
        f'\n  {{\n'
        f'    name: "Fortnite",\n'
        f"    keywords: [/{B}fortnite{B}/i, /{B}fn{B}/i, /{B}hypex{B}/i, /{B}shiina{B}/i, /{B}battle royale{B}/i],\n"
        f'    envChannelKey: "FORTNITE_CHANNEL_ID",\n'
        f"    color: 0x9147ff,     // Violet Fortnite\n"
        f'    icon: "https://static-assets-prod.epicgames.com/fortnite/favicon.ico",\n'
        f"  }},"
    )
    return content[:end_idx] + entry + content[end_idx:]


def main(*, dry_run: bool = False, no_backup: bool = False) -> int:
    try:
        original = open(TARGET, "r", encoding="utf-8").read()
    except FileNotFoundError:
        print(f"ERROR: target file not found: {TARGET}")
        return 2
    except UnicodeDecodeError:
        print(f"ERROR: target file is not valid UTF-8: {TARGET}")
        return 2

    new_content = build_new_content(original)
    if new_content is None:
        return 1

    safe_write(TARGET, new_content, dry_run=dry_run, no_backup=no_backup)
    if not dry_run:
        print("DONE")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Inject Fortnite entry into PLATFORM_CONFIGS."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print unified diff but do not modify the file.",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Skip the .bak snapshot before writing.",
    )
    args = parser.parse_args()
    raise SystemExit(main(dry_run=args.dry_run, no_backup=args.no_backup))
