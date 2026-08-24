#!/usr/bin/env python3
"""
index_wiktionary.py — Indexe le dump Wiktionnaire FR dans une DB SQLite
Version robuste avec parsing XML streaming (iterparse).
"""

import bz2
import re
import sqlite3
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

def clean_wikitext(text: str) -> str:
    """Extract definition lines from wikitext."""
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'<ref[^>]*>.*?</ref>', '', text, flags=re.DOTALL)
    for _ in range(3):
        text = re.sub(r'\{\{[^{}]*\}\}', '', text)
    text = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', text)
    text = re.sub(r'\[\[([^\]]+)\]\]', r'\1', text)
    text = re.sub(r"'''?", '', text)
    text = re.sub(r"''", '', text)
    defs = []
    for line in text.split('\n'):
        line = line.strip()
        if line.startswith('#'):
            clean = line.lstrip('#').strip()
            clean = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', clean)
            clean = re.sub(r'\[\[([^\]]+)\]\]', r'\1', clean)
            clean = re.sub(r"'''?", '', clean)
            clean = re.sub(r"''", '', clean)
            clean = clean.strip()
            if clean and len(clean) > 2 and not clean.startswith('{'):
                defs.append(clean)
    return '\n'.join(defs[:5])

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 index_wiktionary.py <input.xml.bz2> <output.db>")
        sys.exit(1)

    input_file = sys.argv[1]
    output_db = sys.argv[2]
    Path(output_db).unlink(missing_ok=True)

    conn = sqlite3.connect(output_db)
    c = conn.cursor()
    c.execute('CREATE TABLE entries (word TEXT PRIMARY KEY, definitions TEXT, lang TEXT)')
    c.execute('CREATE INDEX idx_word ON entries(word)')

    count = 0
    batch = []
    print(f"Indexing {input_file} -> {output_db}")

    context = ET.iterparse(bz2.open(input_file, 'rb'), events=('end',))
    current_title = None
    current_text = None

    for event, elem in context:
        # Strip namespace from tag (MediaWiki dumps use {http://www.mediawiki.org/xml/export-0.11/}page etc.)
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        if tag == 'title':
            current_title = elem.text
        elif tag == 'text':
            current_text = elem.text or ''
        elif tag == 'page':
            if current_title and current_text:
                if '{{langue|fr}}' in current_text or '== {{langue|fr}} ==' in current_text:
                    defs = clean_wikitext(current_text)
                    if defs and len(defs) > 10:
                        batch.append((current_title, defs, 'fr'))
                        count += 1
                        if len(batch) >= 2000:
                            c.executemany('INSERT OR REPLACE INTO entries VALUES (?,?,?)', batch)
                            conn.commit()
                            batch = []
                            if count % 20000 == 0:
                                print(f"  Indexed {count} entries...")
            current_title = None
            current_text = None
            elem.clear()

    if batch:
        c.executemany('INSERT OR REPLACE INTO entries VALUES (?,?,?)', batch)
        conn.commit()

    conn.close()
    print(f"Done! Indexed {count} French entries to {output_db}")
    print(f"DB size: {Path(output_db).stat().st_size / 1024 / 1024:.1f} MB")

if __name__ == '__main__':
    main()
