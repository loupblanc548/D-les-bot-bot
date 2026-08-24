#!/usr/bin/env python3
"""Test script to verify wiktionary dump parsing."""
import bz2
import xml.etree.ElementTree as ET

input_file = "/opt/wiktionary/frwiktionary.xml.bz2"
print(f"Opening {input_file}...")

f = bz2.open(input_file, 'rb')
print("File opened, testing iterparse...")

context = ET.iterparse(f, events=('end',))
count = 0
pages = 0
fr_pages = 0

for event, elem in context:
    count += 1
    if elem.tag == 'page':
        pages += 1
        if pages <= 3:
            print(f"  Page {pages}: tag={elem.tag}")
        elem.clear()
    if count > 100000:
        break

print(f"Parsed {count} elements, {pages} pages in first 100k elements")
f.close()
