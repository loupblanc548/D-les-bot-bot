#!/usr/bin/env python3
"""Token-aware migration: positional .setAuthor(...) / .setFooter(...) -> discord.js v14 object form."""

import os
import glob
import sys


def split_args(arg_str):
    """Split a source arg list by commas at top-level depth (string/comment/bracket aware)."""
    args, cur = [], []
    depth_p = depth_b = depth_a = 0
    in_str = False
    str_char = ""
    in_line = False
    in_block = False
    i, n = 0, len(arg_str)
    while i < n:
        c = arg_str[i]
        nxt = arg_str[i + 1] if i + 1 < n else ""

        if in_line:
            if c == "\n":
                in_line = False
            cur.append(c); i += 1; continue
        if in_block:
            if c == "*" and nxt == "/":
                cur.append(c); cur.append(nxt); i += 2; in_block = False; continue
            cur.append(c); i += 1; continue

        if in_str:
            if c == "\\":
                j = i
                while j < n and arg_str[j] == "\\":
                    j += 1
                run = j - i
                cur.append("\\" * run)
                if run % 2 == 1 and j < n:
                    cur.append(arg_str[j]); i = j + 1; continue
                i = j; continue
            if c == str_char:
                cur.append(c); in_str = False; str_char = ""; i += 1; continue
            cur.append(c); i += 1; continue

        if c == "/" and nxt == "/":
            in_line = True; cur.append(c); cur.append(nxt); i += 2; continue
        if c == "/" and nxt == "*":
            in_block = True; cur.append(c); cur.append(nxt); i += 2; continue

        if c in ("'", '"', "`"):
            in_str = True; str_char = c; cur.append(c); i += 1; continue

        if c == "(": depth_p += 1; cur.append(c); i += 1; continue
        if c == ")": depth_p -= 1; cur.append(c); i += 1; continue
        if c == "{": depth_b += 1; cur.append(c); i += 1; continue
        if c == "}": depth_b -= 1; cur.append(c); i += 1; continue
        if c == "[": depth_a += 1; cur.append(c); i += 1; continue
        if c == "]": depth_a -= 1; cur.append(c); i += 1; continue

        if c == "," and depth_p == 0 and depth_b == 0 and depth_a == 0:
            args.append("".join(cur).strip()); cur = []; i += 1; continue

        cur.append(c); i += 1

    if cur:
        rest = "".join(cur).strip()
        if rest: args.append(rest)
    return [a for a in args if a]


def rewrite_call(content, method, keys):
    target = f".{method}("
    out = []
    cursor = 0
    rewritten = 0

    while True:
        idx = content.find(target, cursor)
        if idx == -1:
            out.append(content[cursor:])
            break

        start_args = idx + len(target)

        # Find matching close paren (string/comment/bracket aware)
        depth = 1
        in_str = False; str_char = ""
        in_line = False; in_block = False
        end_args = -1
        i, n = start_args, len(content)
        while i < n:
            c = content[i]
            nxt = content[i + 1] if i + 1 < n else ""

            if in_line:
                if c == "\n": in_line = False
                i += 1; continue
            if in_block:
                if c == "*" and nxt == "/":
                    i += 2; in_block = False; continue
                i += 1; continue

            if in_str:
                if c == "\\":
                    j = i
                    while j < n and content[j] == "\\":
                        j += 1
                    run = j - i
                    if run % 2 == 1 and j < n:
                        i = j + 1; continue
                    i = j; continue
                if c == str_char:
                    in_str = False; str_char = ""; i += 1; continue
                i += 1; continue

            if c == "/" and nxt == "/":
                in_line = True; i += 2; continue
            if c == "/" and nxt == "*":
                in_block = True; i += 2; continue
            if c in ("'", '"', "`"):
                in_str = True; str_char = c; i += 1; continue
            if c == "(": depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    end_args = i
                    break
            i += 1

        out.append(content[cursor:start_args])
        if end_args == -1:
            out.append(content[start_args:])
            break

        arg_str = content[start_args:end_args]
        stripped = arg_str.lstrip()

        if stripped.startswith("{"):
            out.append(content[start_args:end_args]); cursor = end_args; continue

        args = split_args(arg_str)
        if len(args) <= 1:
            out.append(content[start_args:end_args]); cursor = end_args; continue

        pairs = []
        for j, val in enumerate(args):
            if j < len(keys):
                pairs.append(f"{keys[j]}: {val}")
            else:
                pairs.append(f"extras: [{val}]")
                # Append remaining args as part of the same extras array
                rem = ", ".join(args[len(keys):])
                pairs[-1] = f"extras: [{val}, {rem}]" if rem else f"extras: [{val}]"
                break
        replacement = "{ " + ", ".join(pairs) + " }"
        out.append(replacement)
        rewritten += 1
        cursor = end_args

    return "".join(out), rewritten


METHODS = {
    "setAuthor": ["name", "iconURL", "url"],
    "setFooter": ["text", "iconURL"],
}


def process_file(fp):
    with open(fp, "r", encoding="utf-8") as fh:
        original = fh.read()
    if not any(f".{m}(" in original for m in METHODS):
        return False, {"setAuthor": 0, "setFooter": 0}
    new_content = original
    stats = {}
    for method, keys in METHODS.items():
        if f".{method}(" not in new_content:
            stats[method] = 0; continue
        new_content, n = rewrite_call(new_content, method, keys)
        stats[method] = n
    if new_content != original:
        with open(fp, "w", encoding="utf-8") as fh:
            fh.write(new_content)
        return True, stats
    return False, {"setAuthor": 0, "setFooter": 0}


def main(root):
    files = glob.glob(os.path.join(root, "src", "**", "*.ts"), recursive=True)
    changed = 0
    total = {"setAuthor": 0, "setFooter": 0}
    for fp in files:
        c, s = process_file(fp)
        if c:
            changed += 1
            for k, v in s.items():
                total[k] += v
    print(f"Files modified: {changed}")
    print(f"setAuthor: {total['setAuthor']} positional multi-arg calls converted")
    print(f"setFooter: {total['setFooter']} positional multi-arg calls converted")


if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    main(root)
