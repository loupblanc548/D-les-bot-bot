/**
 * gameReleaseCountdownWeb.ts — Sert une page web temps réel avec compte à rebours
 * pour les sorties de jeux, optimisée pour le partage d'écran en salon vocal.
 *
 * Endpoint: GET /releases → Page HTML full-screen avec countdown live
 * Endpoint: GET /releases/data → JSON des sorties suivies
 */

import http from "http";
import logger from "../utils/logger.js";
import { getTrackedReleases } from "./gameReleaseCountdown.js";

interface ReleaseData {
  gameName: string;
  releaseDate: string;
  coverUrl: string | null;
  summary: string;
  platforms: string[];
  genres: string[];
}

function getReleasesData(): ReleaseData[] {
  return getTrackedReleases().map((r) => ({
    gameName: r.gameName,
    releaseDate: r.releaseDate.toISOString(),
    coverUrl: r.coverUrl,
    summary: r.summary,
    platforms: r.platforms,
    genres: r.genres,
  }));
}

function buildReleasesPage(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🎮 Game Release Countdown</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0a1a;
    color: #fff;
    font-family: 'Segoe UI', system-ui, sans-serif;
    overflow: hidden;
    height: 100vh;
    width: 100vw;
  }
  #app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }
  .header {
    text-align: center;
    padding: 12px 20px;
    background: linear-gradient(135deg, #5865f2, #eb459e);
    font-size: 1.4em;
    font-weight: 700;
    letter-spacing: 1px;
    flex-shrink: 0;
    box-shadow: 0 4px 20px rgba(88,101,242,0.4);
  }
  .games-container {
    flex: 1;
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    gap: 16px;
    padding: 20px;
    align-items: stretch;
  }
  .game-card {
    flex: 0 0 380px;
    border-radius: 16px;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
    background: #141428;
    border: 2px solid #2a2a4a;
    transition: border-color 0.3s, transform 0.3s;
  }
  .game-card.next-up {
    border-color: #5865f2;
    box-shadow: 0 0 30px rgba(88,101,242,0.3);
    flex: 0 0 460px;
  }
  .game-card.released {
    border-color: #00d26a;
    opacity: 0.7;
  }
  .cover-bg {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-size: cover;
    background-position: center;
    opacity: 0.25;
    filter: blur(2px);
  }
  .cover-overlay {
    position: relative;
    background: linear-gradient(180deg, rgba(10,10,26,0.3) 0%, rgba(10,10,26,0.95) 70%);
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px;
  }
  .game-cover {
    width: 100%;
    max-height: 200px;
    object-fit: contain;
    border-radius: 10px;
    margin-bottom: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  }
  .game-title {
    font-size: 1.3em;
    font-weight: 700;
    margin-bottom: 6px;
    text-shadow: 0 2px 8px rgba(0,0,0,0.8);
    line-height: 1.2;
  }
  .game-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }
  .badge {
    background: rgba(88,101,242,0.3);
    border: 1px solid rgba(88,101,242,0.5);
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 0.75em;
    color: #c9d1ff;
  }
  .badge.genre {
    background: rgba(235,69,158,0.2);
    border-color: rgba(235,69,158,0.4);
    color: #ffb3d9;
  }
  .release-date {
    font-size: 0.95em;
    color: #8b8ba7;
    margin-bottom: 8px;
  }
  .countdown {
    font-size: 2.2em;
    font-weight: 800;
    text-align: center;
    padding: 10px;
    border-radius: 10px;
    background: rgba(0,0,0,0.4);
    margin-bottom: 10px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 1px;
  }
  .countdown.released {
    color: #00d26a;
    font-size: 1.6em;
  }
  .countdown.urgent {
    color: #ff4444;
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  .progress-bar {
    width: 100%;
    height: 8px;
    background: rgba(255,255,255,0.1);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #5865f2, #eb459e);
    border-radius: 4px;
    transition: width 0.5s;
  }
  .summary {
    font-size: 0.82em;
    color: #b0b0c8;
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    flex: 1;
  }
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 1.5em;
    color: #555;
  }
  .footer {
    text-align: center;
    padding: 6px;
    font-size: 0.7em;
    color: #444;
    flex-shrink: 0;
  }
</style>
</head>
<body>
<div id="app">
  <div class="header">🎮 GAME RELEASE COUNTDOWN — PARTAGE D'ÉCRAN</div>
  <div class="games-container" id="games"></div>
  <div class="footer">Mise à jour automatique • Données IGDB • Actualisation toutes les 60 secondes</div>
</div>
<script>
  let releases = [];

  async function fetchData() {
    try {
      const res = await fetch('/releases/data');
      releases = await res.json();
      render();
    } catch (e) {
      console.error('Fetch error:', e);
    }
  }

  function formatCountdown(target) {
    const diff = new Date(target).getTime() - Date.now();
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (d > 0) return d + 'j ' + h + 'h ' + m + 'm ' + s + 's';
    if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
    return m + 'm ' + s + 's';
  }

  function buildProgressBar(target) {
    const now = Date.now();
    const total = 90 * 86400000;
    const diff = new Date(target).getTime() - now;
    const elapsed = total - diff;
    const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
    return Math.round(pct);
  }

  function render() {
    const container = document.getElementById('games');
    if (!releases || releases.length === 0) {
      container.innerHTML = '<div class="empty-state">⏳ En attente des sorties à venir...</div>';
      return;
    }
    container.innerHTML = releases.map((g, i) => {
      const cd = formatCountdown(g.releaseDate);
      const released = cd === null;
      const urgent = cd && !cd.includes('j') && !cd.includes('h');
      const pct = buildProgressBar(g.releaseDate);
      const cover = g.coverUrl
        ? '<img class="game-cover" src="' + g.coverUrl + '" alt="cover" onerror="this.style.display=\\'none\\'">'
        : '';
      const bg = g.coverUrl
        ? '<div class="cover-bg" style="background-image:url(\\'' + g.coverUrl + '\\')"></div>'
        : '';
      const platforms = (g.platforms || []).slice(0, 4).map(p => '<span class="badge">' + p + '</span>').join('');
      const genres = (g.genres || []).slice(0, 3).map(g2 => '<span class="badge genre">' + g2 + '</span>').join('');
      const dateStr = new Date(g.releaseDate).toLocaleDateString('fr-FR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      const cdClass = released ? 'countdown released' : (urgent ? 'countdown urgent' : 'countdown');
      const cdText = released ? '🎉 SORTI !' : '⏰ ' + cd;
      const cardClass = released ? 'game-card released' : (i === 0 ? 'game-card next-up' : 'game-card');
      return '<div class="' + cardClass + '">' +
        bg +
        '<div class="cover-overlay">' +
          cover +
          '<div class="game-title">' + g.gameName + '</div>' +
          '<div class="game-meta">' + platforms + genres + '</div>' +
          '<div class="release-date">📅 ' + dateStr + '</div>' +
          '<div class="' + cdClass + '">' + cdText + '</div>' +
          '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="summary">' + (g.summary || 'Aucun synopsis disponible.') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // Update countdown every second
  function tick() {
    if (releases.length > 0) render();
  }

  // Fetch data every 60s
  fetchData();
  setInterval(fetchData, 60000);
  setInterval(tick, 1000);
</script>
</body>
</html>`;
}

export function attachReleasesEndpoint(server: http.Server): void {
  server.on("request", (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === "/releases") {
      const html = buildReleasesPage();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (path === "/releases/data") {
      const data = getReleasesData();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(data));
      return;
    }
  });

  logger.info("[GameReleaseCountdownWeb] Endpoint /releases disponible pour partage d'écran");
}
