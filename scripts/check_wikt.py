import sqlite3
c = sqlite3.connect('/opt/wiktionary/wiktionary.db')
count = c.execute('SELECT COUNT(*) FROM entries').fetchone()[0]
print(f'Count: {count}')
for r in c.execute('SELECT word, substr(definitions,1,80) FROM entries LIMIT 5'):
    print(r)
