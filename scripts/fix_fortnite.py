import re

with open('src/managers/ChannelRouter.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove any broken Fortnite entry (from previous attempts)
content = re.sub(
    r'\s*\{\s*\n\s*name: "Fortnite",.*?\n  \},',
    '',
    content,
    flags=re.DOTALL
)

# Build the correct Fortnite entry with proper word boundaries
# In Python, \b writes \b to the file (which is word boundary in JS regex)
B = '\b'

entry = (
    '\n  {\n'
    '    name: "Fortnite",\n'
    f'    keywords: [/{B}fortnite{B}/i, /{B}fn{B}/i, /{B}fort{B}/i, /{B}hypex{B}/i, /{B}shiina{B}/i],\n'
    '    envChannelKey: "FORTNITE_CHANNEL_ID",\n'
    '    color: 0x9147ff,     // Violet Fortnite\n'
    '    icon: "https://static-assets-prod.epicgames.com/fortnite/favicon.ico",\n'
    '  },'
)

# Insert before the closing ]; of PLATFORM_CONFIGS
idx = content.rfind('NINTENDO_CHANNEL_ID')
end_idx = content.find('];', idx)

if end_idx == -1:
    print('ERROR: could not find injection point')
else:
    new_content = content[:end_idx] + entry + content[end_idx:]
    with open('src/managers/ChannelRouter.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('OK')
