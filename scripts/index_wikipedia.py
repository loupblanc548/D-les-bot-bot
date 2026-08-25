#!/usr/bin/env python3
"""
index_wikipedia.py — Indexe le dump Wikipedia FR dans une DB SQLite
pour recherche rapide de résumés offline.

Usage:
  python3 index_wikipedia.py /opt/wikipedia/frwiki.xml.bz2 /opt/wikipedia/wikipedia.db
"""

import bz2
import re
import sqlite3
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

def clean_wikitext(text: str) -> str:
    """Extract first paragraphs from Wikipedia article wikitext."""
    # Remove HTML
    text = re.sub(r'<[^>]+>', '', text)
    # Remove refs
    text = re.sub(r'<ref[^>]*>.*?</ref>', '', text, flags=re.DOTALL)
    # Remove templates {{...}} (nested-aware, 3 levels)
    for _ in range(3):
        text = re.sub(r'\{\{[^{}]*\}\}', '', text)
    # Wiki links [[a|b]] -> b, [[a]] -> a
    text = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', text)
    text = re.sub(r'\[\[([^\]]+)\]\]', r'\1', text)
    # Bold/italic
    text = re.sub(r"'''?", '', text)
    text = re.sub(r"''", '', text)
    # Remove section headers (lines starting with =)
    # Extract first meaningful paragraphs
    paragraphs = []
    for line in text.split('\n'):
        line = line.strip()
        if line.startswith('='):
            break  # Stop at first section header
        if line.startswith('{') or line.startswith('|') or line.startswith('}'):
            continue
        if line.startswith('[[File:') or line.startswith('[[Image:'):
            continue
        if len(line) > 50 and not line.startswith('#'):
            # Clean remaining markup
            clean = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', line)
            clean = re.sub(r'\[\[([^\]]+)\]\]', r'\1', clean)
            clean = re.sub(r"'''?", '', clean)
            clean = re.sub(r"''", '', clean)
            clean = clean.strip()
            if clean and len(clean) > 50:
                paragraphs.append(clean)
        if len(paragraphs) >= 3:
            break
    return '\n\n'.join(paragraphs)

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 index_wikipedia.py <input.xml.bz2> <output.db>")
        sys.exit(1)

    input_file = sys.argv[1]
    output_db = sys.argv[2]
    Path(output_db).unlink(missing_ok=True)

    conn = sqlite3.connect(output_db)
    c = conn.cursor()
    c.execute('CREATE TABLE articles (title TEXT PRIMARY KEY, extract TEXT, lang TEXT)')
    c.execute('CREATE INDEX idx_title ON articles(title)')

    count = 0
    batch = []
    print(f"Indexing {input_file} -> {output_db}")

    context = ET.iterparse(bz2.open(input_file, 'rb'), events=('end',))
    current_title = None
    current_text = None

    for event, elem in context:
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        if tag == 'title':
            current_title = elem.text
        elif tag == 'text':
            current_text = elem.text or ''
        elif tag == 'page':
            if current_title and current_text:
                # Skip redirects and disambiguation pages
                if '#REDIRECT' in current_text or '{{Homonymie' in current_text:
                    current_title = None
                    current_text = None
                    elem.clear()
                    continue
                extract = clean_wikitext(current_text)
                if extract and len(extract) > 100:
                    batch.append((current_title, extract, 'fr'))
                    count += 1
                    if len(batch) >= 2000:
                        c.executemany('INSERT OR REPLACE INTO articles VALUES (?,?,?)', batch)
                        conn.commit()
                        batch = []
                        if count % 50000 == 0:
                            print(f"  Indexed {count} articles...")
            current_title = None
            current_text = None
            elem.clear()

    if batch:
        c.executemany('INSERT OR REPLACE INTO articles VALUES (?,?,?)', batch)
        conn.commit()

    conn.close()
    print(f"Done! Indexed {count} French articles to {output_db}")
    print(f"DB size: {Path(output_db).stat().st_size / 1024 / 1024:.1f} MB")

if __name__ == '__main__':
    main()
