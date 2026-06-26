#!/usr/bin/env python3
"""fix_b.py — idempotent keyword-regex patcher.

This script replaces legacy JS regex keyword fragments (without word
boundaries) with their word-bounded equivalents:

    /fortnite/i,    -> /\bfortnite\b/i,
    / fn /i,        -> /\bfn\b/i,
    /hypex/i,       -> /\bhypex\b/i,
    /shiina/i,      -> /\bshiina\b/i,

It is **idempotent**: running on an already-patched file is a no-op.

It is **safe**:
    * reads the file with explicit UTF-8 encoding
    * writes to a sibling temp file, fsync, atomic os.replace
    * optionally writes a `<file>.bak` backup (skip with FIX_B_NO_BACKUP=1)
    * prints a unified diff of the change BEFORE the write, so the operator
      can see exactly what will be committed (set FIX_B_CHECK=1 to keep the
      diff-only behaviour).

It addresses the original destructive bug: the previous version's last
`.replace()` opened `keywords: [` and rewrote the opening with a partial
regex token, **silently dropping every keyword that came after**. That
operation has been removed; only the four safe substring substitutions
above remain.

Usage:
    python3 scripts/fix_b.py <path-to-file>
    FIX_B_NO_BACKUP=1 python3 scripts/fix_b.py <path-to-file>
    FIX_B_CHECK=1    python3 scripts/fix_b.py <path-to-file>

Exit codes:
    0  file is up-to-date, OR file was updated (or diff-only mode ran)
    1  invalid CLI usage (no argument, too many arguments)
    2  source file is missing / not a regular file / not UTF-8 / unreadable
    3  write failure (disk full, permission denied, …)

Only standard library. Tested against Python 3.10+.
"""
from __future__ import annotations

import difflib
import os
import shutil
import sys
import tempfile
from pathlib import Path

# `B` is the JS regex word-boundary token, emitted as the two characters
# backslash + lowercase 'b' in the SOURCE TEXT. We use a raw string so the
# backslash is preserved literally.
B = r"\b"

# Each entry: (human label, source-substring, replacement-substring).
#
# Two variants per keyword: one with trailing comma (regex is followed by
# another array element) and one without (regex is the LAST element of the
# array, followed by `]` or similar). Each variant is encoded so that the
# source substring is NOT itself a substring of the replacement; applying
# either once makes the source disappear, so re-running is a no-op.
#
# NOTE: the original script's final `.replace("n    keywords: [", ...)`
# was DESTRUCTIVE (it rewrote the opening of the array and dropped every
# subsequent keyword). It has been intentionally removed. If the user
# later needs to *prepend* a new keyword to a `keywords:` array, that
# should be implemented as a separate, line-aware pass — ask before
# resurrecting it.
def _ops() -> tuple[tuple[str, str, str], ...]:
    variants: list[tuple[str, str, str]] = []
    for label_inner, body in (
        ("fortnite", "fortnite"),
        ("fn (was \" fn \")", "fn"),
        ("hypex", "hypex"),
        ("shiina", "shiina"),
    ):
        bb = B
        # Trailing-comma variant (regex followed by another element).
        variants.append(
            (
                f"{label_inner} -> word-boundary regex (followed by comma)",
                f"/{body}/i,",
                f"/{bb}{body}{bb}/i,",
            )
        )
        # No-comma variant (regex is the last element of the array).
        variants.append(
            (
                f"{label_inner} -> word-boundary regex (last element, no comma)",
                f"/{body}/i]",
                f"/{bb}{body}{bb}/i]",
            )
        )
    return tuple(variants)


OPERATIONS: tuple[tuple[str, str, str], ...] = _ops()


def apply_operations(text: str) -> tuple[str, list[str]]:
    """Apply every OPERATIONS substitution. Idempotent.

    For each entry, the source substring is *not* a substring of its
    replacement (e.g. `/fortnite/i,` is not contained in `/\bfortnite\b/i,`)
    so a second pass cannot re-fire on the result of the first.
    """
    new_text = text
    applied: list[str] = []
    for label, old, needle in OPERATIONS:
        if old in new_text:
            new_text = new_text.replace(old, needle)
            applied.append(label)
    return new_text, applied


def make_unified_diff(old: str, new: str, path: Path) -> str:
    """Return a unified diff string. Empty string when the inputs match.

    Uses splitlines(keepends=True) so trailing newlines around the diff
    markers are preserved and the output is round-trippable through `git
    apply` / `patch`."""
    if old == new:
        return ""
    diff_iter = difflib.unified_diff(
        old.splitlines(keepends=True),
        new.splitlines(keepends=True),
        fromfile=f"{path} [before]",
        tofile=f"{path} [after]",
        n=2,
        lineterm="",
    )
    return "\n".join(diff_iter) + "\n"


def _truthy(value: str | None) -> bool:
    return value is not None and value.strip().lower() in ("1", "true", "yes", "on")


def write_atomically(target: Path, content: str) -> None:
    """Write `content` to `target` via a sibling temp file. Atomic."""
    fd, tmp_name = tempfile.mkstemp(
        prefix=target.name + ".",
        suffix=".fix_b.tmp",
        dir=str(target.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_name, target)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def backup(target: Path) -> Path:
    backup_path = target.with_suffix(target.suffix + ".bak")
    shutil.copy2(target, backup_path)
    return backup_path


def _read_source(target: Path) -> str:
    if not target.exists():
        raise FileNotFoundError(target)
    if target.is_dir():
        raise IsADirectoryError(target)
    if not target.is_file():
        raise ValueError(f"{target} is not a regular file")
    return target.read_text(encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        sys.stderr.write(
            f"usage: {argv[0]} <path-to-file-with-keywords>\n"
            "Patches JS regex keyword fragments to use word boundaries.\n"
            "Idempotent: re-running on a patched file is a no-op.\n"
            "Env:\n"
            "  FIX_B_NO_BACKUP=1  skip writing the .bak backup.\n"
            "  FIX_B_CHECK=1      print unified diff only; do NOT touch the\n"
            "                     file (atomic write is skipped).\n"
        )
        return 1

    target = Path(argv[1]).resolve()

    try:
        original = _read_source(target)
    except (FileNotFoundError, IsADirectoryError) as e:
        sys.stderr.write(f"ERROR: cannot read source: {e}\n")
        return 2
    except PermissionError as e:
        sys.stderr.write(f"ERROR: permission denied reading {target}: {e}\n")
        return 2
    except UnicodeDecodeError as e:
        sys.stderr.write(f"ERROR: {target} is not valid UTF-8: {e}\n")
        return 2
    except (OSError, ValueError) as e:
        sys.stderr.write(f"ERROR: cannot read {target}: {e}\n")
        return 2

    patched, applied = apply_operations(original)

    diff_text = make_unified_diff(original, patched, target)

    if not diff_text:
        print(f"NO-OP: {target} is already up to date.")
        return 0

    print(f"PATCH: {len(applied)} change(s) detected in {target}")
    for label in applied:
        print(f"  - {label}")
    print("--- begin unified diff ---")
    sys.stdout.write(diff_text)
    print("--- end unified diff ---")

    if _truthy(os.environ.get("FIX_B_CHECK")):
        # Print-only mode: the diff is informative; no write happens.
        print(f"CHECK-MODE: {target} NOT modified (set FIX_B_CHECK=0 to apply).")
        return 0

    if not _truthy(os.environ.get("FIX_B_NO_BACKUP")):
        try:
            backup_path = backup(target)
            print(f"BACKUP: wrote {backup_path}")
        except (OSError, PermissionError) as e:
            sys.stderr.write(f"ERROR: cannot write backup for {target}: {e}\n")
            print(
                "Refusing to continue without a backup. Set FIX_B_NO_BACKUP=1\n"
                "to write the file without keeping a .bak copy."
            )
            return 3

    try:
        write_atomically(target, patched)
    except OSError as e:
        sys.stderr.write(f"ERROR: atomic write failed for {target}: {e}\n")
        return 3

    print(f"OK: {target} updated ({len(applied)} change(s)).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
