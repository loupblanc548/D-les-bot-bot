"""Start (or reuse) the Discord tester Gateway so the bot shows Online."""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PID_FILE = Path(os.environ.get("TEMP", "/tmp")) / "discord-tester-online.pid"
LOG_FILE = Path(os.environ.get("TEMP", "/tmp")) / "discord-tester-online.log"
TOKEN_FILE = Path(os.environ.get("TEMP", "/tmp")) / "discord-tester.env"


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _load_token() -> str:
    token = os.environ.get("DISCORD_TESTER_TOKEN", "").strip()
    if token:
        return token
    if TOKEN_FILE.is_file():
        for line in TOKEN_FILE.read_text(encoding="utf-8").splitlines():
            if line.startswith("DISCORD_TESTER_TOKEN="):
                return line.split("=", 1)[1].strip()
    return ""


def ensure_tester_online(wait_s: float = 4.0) -> bool:
    if PID_FILE.is_file():
        try:
            pid = int(PID_FILE.read_text(encoding="utf-8").strip())
        except ValueError:
            pid = 0
        if pid and _pid_alive(pid):
            return True

    token = _load_token()
    if not token:
        print("ensure-tester-online: missing DISCORD_TESTER_TOKEN", file=sys.stderr)
        return False

    env = os.environ.copy()
    env["DISCORD_TESTER_TOKEN"] = token
    env["TESTER_ONLINE_PID_FILE"] = str(PID_FILE)
    log = LOG_FILE.open("ab")
    kwargs: dict = {
        "cwd": str(REPO),
        "env": env,
        "stdout": log,
        "stderr": subprocess.STDOUT,
        "stdin": subprocess.DEVNULL,
    }
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | getattr(
            subprocess, "CREATE_NO_WINDOW", 0
        )
    else:
        kwargs["start_new_session"] = True

    tsx_cli = REPO / "node_modules" / "tsx" / "dist" / "cli.mjs"
    node = "node"
    cmd = (
        [node, str(tsx_cli), "scripts/discord-tester-online.ts"]
        if tsx_cli.is_file()
        else [node, "--import", "tsx", "scripts/discord-tester-online.ts"]
    )
    proc = subprocess.Popen(cmd, **kwargs)
    PID_FILE.write_text(str(proc.pid), encoding="utf-8")
    deadline = time.time() + max(wait_s, 8.0)
    while time.time() < deadline:
        if LOG_FILE.is_file() and "[tester] online" in LOG_FILE.read_text(
            encoding="utf-8", errors="ignore"
        ):
            return True
        if proc.poll() is not None:
            return False
        time.sleep(0.4)
    return _pid_alive(proc.pid)


if __name__ == "__main__":
    ok = ensure_tester_online()
    print("online" if ok else "failed")
    sys.exit(0 if ok else 1)
