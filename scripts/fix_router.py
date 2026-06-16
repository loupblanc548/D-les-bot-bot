import re

with open('src/managers/ChannelRouter.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove any broken Fortnite entry from previous attempts
content = re.sub(
    r'\s*\{\s*\n\s*name: "Fortnite",.*?\n  \},',
    '',
    content,
    flags=re.DOTALL
)

# Build the Fortnite entry without f-strings (to avoid brace issues)
line1 = '\n  {\n    name: "Fortnite",'
line2 = '    keywords: [/\\u0062fortnite\\u0062/i, /\\u0062fn\\u0062/i, /\\u0062hypex\\u0062/i, /\\u0062shiina\\u0062/i],'
line3 = '    envChannelKey: "FORTNITE_CHANNEL_ID",'
line4 = '    color: 0x9147ff,     // Violet Fortnite'
line5 = '    icon: "https://static-assets-prod.epicgames.com/fortnite/favicon.ico",'
line6 = '  },'
fortnite_block = '\n'.join([line1, line2, line3, line4, line5, line6])

# Insert before the closing ]; of PLATFORM_CONFIGS
idx = content.rfind('NINTENDO_CHANNEL_ID')
end_idx = content.find('];', idx)

if end_idx == -1:
    print('ERROR')
else:
    new_content = content[:end_idx] + fortnite_block + content[end_idx:]
    with open('src/managers/ChannelRouter.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('OK')
