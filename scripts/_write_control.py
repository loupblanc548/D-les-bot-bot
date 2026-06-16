with open("src/control-server.ts", "w", encoding="utf-8") as f:
    f.write("""import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import logger from "./utils/logger";
import { config } from "./config";
import { dedupCache } from "./utils/deduplicationCache";
""")
print("part1 ok")
