import http from "http";

export function validateBody<T>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  validator: (parsed: unknown) => T | null
): Promise<T | null> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const result = validator(parsed);
        if (!result) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Corps de requête invalide" }));
          resolve(null);
          return;
        }
        resolve(result);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "JSON malformé" }));
        resolve(null);
      }
    });
  });
}

export function sanitize(str: string): string {
  return str.replace(/[<>&"']/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;"
  }[c] || c));
}
