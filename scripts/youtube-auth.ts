import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { writeFileSync, readFileSync } from "fs";

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000/callback";

const SCOPES = "https://www.googleapis.com/auth/youtube.force-ssl";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ YOUTUBE_CLIENT_ID et YOUTUBE_CLIENT_SECRET doivent être dans .env");
  process.exit(1);
}

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log("\n🔗 Ouvre ce lien dans ton navigateur pour autoriser le bot :\n");
console.log(authUrl);
console.log("\n⏳ En attente de l'autorisation sur http://localhost:3000/callback ...\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "", "http://localhost:3000");

  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    // Validate against known OAuth error codes — don't reflect arbitrary user input
    const KNOWN_ERRORS = ["access_denied", "invalid_request", "invalid_scope", "server_error", "temporarily_unavailable"];
    const isValidError = KNOWN_ERRORS.includes(String(error));
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h1>❌ Erreur d'authentification</h1>`);
    console.error(`❌ Erreur OAuth: ${isValidError ? String(error) : "unknown_error"}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end("Pas de code");
    return;
  }

  try {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h1>❌ Erreur token: ${errText}</h1>`);
      console.error(`❌ Erreur token: ${errText}`);
      server.close();
      process.exit(1);
    }

    const tokenData = await tokenRes.json() as { refresh_token?: string; access_token: string };

    if (!tokenData.refresh_token) {
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>❌ Pas de refresh token. Supprime l'accès dans ton compte Google et réessaie.</h1>");
      console.error("❌ Pas de refresh token reçu");
      server.close();
      process.exit(1);
    }

    // Met à jour .env avec le refresh token
    const envPath = ".env";
    let envContent = readFileSync(envPath, "utf-8");
    if (envContent.includes("YOUTUBE_REFRESH_TOKEN=")) {
      envContent = envContent.replace(
        /YOUTUBE_REFRESH_TOKEN=.*/,
        `YOUTUBE_REFRESH_TOKEN=${String(tokenData.refresh_token).replace(/[\r\n]/g, "")}`,
      );
    } else {
      envContent += `\nYOUTUBE_REFRESH_TOKEN=${String(tokenData.refresh_token).replace(/[\r\n]/g, "")}\n`;
    }
    writeFileSync(envPath, envContent, "utf-8");

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>✅ Refresh token sauvegardé dans .env ! Tu peux fermer cette page.</h1>");
    console.log("✅ Refresh token sauvegardé dans .env !");
    console.log("✅ Tu peux maintenant lancer le bot — le YouTube Live Chat démarrera automatiquement.");

    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500);
    res.end("Erreur interne");
    console.error("❌ Erreur:", err);
    server.close();
    process.exit(1);
  }
});

server.listen(3000, () => {
  console.log("📡 Serveur d'authentification en écoute sur http://localhost:3000");
});
