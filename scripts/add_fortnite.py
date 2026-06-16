import re

with open('src/managers/ChannelRouter.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove any broken Fortnite entry
content = re.sub(r'\s*\{\s*\n\s*name: "Fortnite",.*?\n  \},', '', content, flags=re.DOTALL)

# Add Fortnite before the closing ]; of PLATFORM_CONFIGS
# Find last occurrence of NINTENDO_CHANNEL_ID
idx = content.rfind('NINTENDO_CHANNEL_ID')
if idx == -1:
    print('ERROR: Nintendo not found')
else:
    # Find the closing after Nintendo
    end_idx = content.find('];', idx)
    if end_idx == -1:
        print('ERROR: Closing ]; not found')
    else:
        B = '\\b'
        entry = f'''\n  {{\n    name: "Fortnite",\n    keywords: [/{B}fortnite{B}/i, /{B}fn{B}/i, /{B}hypex{B}/i, /{B}shiina{B}/i, /{B}battle royale{B}/i],\n    envChannelKey: "FORTNITE_CHANNEL_ID",\n    color: 0x9147ff,     // Violet Fortnite\n    icon: "https://static-assets-prod.epicgames.com/fortnite/favicon.ico",\n  },'''
        
        new_content = content[:end_idx] + entry + content[end_idx:]
        
        with open('src/managers/ChannelRouter.ts', 'w', encoding='utf-8') as f:
            f.write(new_content)
        print('DONE')
