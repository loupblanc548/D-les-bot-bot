import http from "http";
import { timingSafeEqual } from "crypto";
import { config } from "../../config.js";

export function authenticate(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (!config.controlToken) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "CONTROL_TOKEN non configuré" }));
    return false;
  }
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Non autorisé" }));
    return false;
  }
  const token = auth.slice(7);
  const expected = config.controlToken;
  // Constant-time comparison to prevent timing attacks
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);
  if (tokenBuf.length !== expectedBuf.length || !timingSafeEqual(tokenBuf, expectedBuf)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Non autorisé" }));
    return false;
  }
  return true;
}
