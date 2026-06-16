import http from "http";
import { config } from "../../config";

export function authenticate(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (!config.controlToken) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "CONTROL_TOKEN non configuré" }));
    return false;
  }
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== config.controlToken) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Non autorisé" }));
    return false;
  }
  return true;
}
