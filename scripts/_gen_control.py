# Generate control-server.ts
import os

code = []
code.append("/**")
code.append(" * control-server.ts - Micro-serveur de controle pour l''application Desktop")
code.append(" *")
code.append(" * API REST + WebSocket pour piloter le bot depuis l''app Electron.")
code.append(" * Securite : token Bearer (CONTROL_TOKEN dans .env)")
code.append(" */")
code.append("")
code.append('import http from "http";')
code.append('import { WebSocketServer, WebSocket } from "ws";')
code.append('import logger from "./utils/logger";')
code.append('import { config } from "./config";')
code.append('import { dedupCache } from "./utils/deduplicationCache";')

with open("src/control-server.ts", "w", encoding="utf-8") as f:
    f.write("\n".join(code))
print(f"Wrote {len(code)} lines")
