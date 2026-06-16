
import sys
sys.stdout.reconfigure(encoding='utf-8')

# Generate the complete messages.ts file
lines = []

lines.append('import logger from "../utils/logger";')
lines.append('import {')
lines.append('  MessageFlags,')
lines.append('  Client,')
lines.append('  Message,')
lines.append('  PartialMessage,')
lines.append('  OmitPartialGroupDMChannel,')
lines.append('  GuildMember,')
lines.append('  TextChannel,')
lines.append('  EmbedBuilder,')
lines.append('} from "discord.js";')
lines.append('import { createLog } from "../services/logs";')
lines.append('import { recordSecurityEvent } from "../services/risk-engine";')
lines.append('import { isAntiPhishingActive, checkSuspiciousLinksDetailed } from "../commands/security";')
lines.append('import { isAiChatEnabled, chatWithHistory } from "../services/aichat";')
lines.append('import { analyzeToxicity } from "../services/ai-moderation";')
lines.append('import prisma from "../prisma";')
lines.append('import { withCache } from "../utils/redis-enhance";')
lines.append('import { translateAutoToFrench } from "../utils/translator";')
lines.append('import { addMessageToConversation, getConversationHistory, clearConversation } from "../services/aiMemory";')
lines.append('import { getCachedResponse, cacheResponse } from "../services/aiCache";')
lines.append('import { checkRateLimit } from "../services/rateLimiter";')
lines.append('')
lines.append('const aichatCooldown = new Map<string, number>();')
lines.append('const AICHAT_COOLDOWN_MS = 5_000;')
lines.append('const SPAM_THRESHOLD = 5;')
lines.append('const SPAM_WINDOW_MS = 3_000;')
lines.append('const SPAM_MUTE_MS = 5 * 60 * 1000;')
lines.append('')
lines.append('const JOHN_HELLDIVER_SYSTEM_PROMPT = ' + repr('Tu es John Helldiver, soldat d'élite de la Super-Terre, bot Discord de service.

PERSONNALITÉ :
- Patriote convaincu de la Super-Terre, tu défends la liberté intergalactique avec ferveur.
- Un peu bourrin mais ultra-serviable — tu adores aider tes camarades soldats.
- Passionné de tech, gaming et démocratie gérée.
- Tu parles français avec un ton militaire décontracté.
- Tu glisses parfois des références à Helldivers, à la Super-Terre ou à la lutte contre les Automatons.

RÈGLES STRICTES :
1. Réponds de manière concise et directe.
2. Utilise le Markdown Discord pour la lisibilité.
3. Reste dans le personnage MAIS priorise l'utilité.
4. Si tu ne connais pas la réponse, admets-le avec humour.
5. Pour les questions techniques/gaming, sois précis et expert.
6. Ne mentionne JAMAIS que tu es une IA — tu es John Helldiver.') + ';')

print('Test OK, generated', len(lines), 'lines')
