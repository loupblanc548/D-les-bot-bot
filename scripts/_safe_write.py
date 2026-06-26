"""Atomic, diff-first, backed-up file writer for generator scripts.

Contract:
    safe_write(target_path, content, *, dry_run=False, no_backup=False) -> bool

Returns:
    True  -- the file was written with new content.
    False -- nothing was written because either:
             * target_path already equals content (no-op), or
             * dry_run=True (diff was printed, no write happened).

Pre-flight errors (exit 2):
    * parent directory is missing or not a directory
    * target exists but is not a regular file
    * target exists but is not valid UTF-8
    * read permission denied on existing target

Guarantees:
    * On any failure during the write phase the original target is left
      untouched: the tempfile is unlinked in an except-BaseException handler.
    * Atomicity is provided by tempfile.mkstemp(dir=target.parent) followed by
      os.replace, which is atomic on POSIX and on Windows (Python 3.3+
      uses MoveFileExW with MOVEFILE_REPLACE_EXISTING).
    * Line endings are preserved exactly: `newline=""` disables Python's
      text-mode translation of \n -> \r\n on Windows, so the bytes written
      equal the bytes passed in (caller controls line endings).
    * Backup is taken via shutil.copy2 (preserves mtime + perms) and only
      when there is real content delta, so re-running on an idempotent
      generator leaves .bak untouched.

Designed for one-time use by ad-hoc Python generators living next to the
TypeScript source tree. The helper is intentionally minimal: no argparse, no
logging config -- consumers wire that up themselves.
"""

import difflib
import os
import shutil
import sys
import tempfile
from pathlib import Path


# Best-effort: coerce stdout/stderr to UTF-8 so the unified diff (which can
# carry non-ASCII content lifted from any source file, especially comments
# in French/emoji/etc.) does not raise UnicodeEncodeError on Windows
# consoles that default to cp1252. `.reconfigure` is Python 3.7+; older
# interpreters and already-configured streams ignore us without raising.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except (AttributeError, ValueError):
    pass


def safe_write(
    target_path: str | Path,
    content: str,
    *,
    dry_run: bool = False,
    no_backup: bool = False,
) -> bool:
    """Atomically write `content` to `target_path`.

    See module docstring for the full contract.
    """
    target = Path(target_path).resolve()

    # --- pre-flight checks ---------------------------------------------------
    if not target.parent.is_dir():
        sys.stderr.write(
            f"ERROR: Parent directory does not exist or is not a directory: {target.parent}\n"
        )
        sys.exit(2)

    original = ""
    if target.exists():
        if not target.is_file():
            sys.stderr.write(
                f"ERROR: Target exists but is not a regular file: {target}\n"
            )
            sys.exit(2)
        try:
            original = target.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            sys.stderr.write(f"ERROR: Target is not valid UTF-8: {target}\n")
            sys.exit(2)
        except PermissionError as exc:
            sys.stderr.write(
                f"ERROR: Permission denied reading target {target}: {exc}\n"
            )
            sys.exit(2)

    # --- no-op short circuit -------------------------------------------------
    if original == content:
        return False

    # --- always show the diff BEFORE doing anything destructive -------------
    diff_text = "".join(
        difflib.unified_diff(
            original.splitlines(keepends=True),
            content.splitlines(keepends=True),
            fromfile=f"{target} [before]",
            tofile=f"{target} [after]",
            n=2,
        )
    )
    print(f"--- diff for {target} ---\n{diff_text}--- end diff ---")

    if dry_run:
        return False

    # --- backup --------------------------------------------------------------
    # Only snapshot when there is real existing content and the caller did
    # not opt out; this keeps re-running an idempotent generator churn-free.
    if original and not no_backup:
        backup_path = target.with_name(target.name + ".bak")
        shutil.copy2(target, backup_path)

    # --- atomic write --------------------------------------------------------
    fd, tmp_name = tempfile.mkstemp(
        prefix=target.name + ".", suffix=".tmp", dir=str(target.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, target)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise

    return True
