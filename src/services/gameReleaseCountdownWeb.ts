/**
 * gameReleaseCountdownWeb.ts — Sert une page web temps réel avec compte à rebours
 * pour les sorties de jeux, optimisée pour le partage d'écran en salon vocal.
 *
 * Endpoint: GET /releases → Page HTML full-screen avec countdown live
 * Endpoint: GET /releases/data → JSON des sorties suivies
 */

import { getTrackedReleases } from "./gameReleaseCountdown.js";

// ─── HTTP response cache (5 min TTL) ────────────────────────────────────────
let cachedHtml: string | null = null;
let cachedHtmlAt = 0;
const HTML_CACHE_TTL_MS = 5 * 60 * 1000;

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
  <div class="header">🎮 <span id="header-title">GAME RELEASE COUNTDOWN</span> — PARTAGE D'ÉCRAN</div>
  <div class="games-container" id="games"></div>
  <div class="footer">Mise à jour automatique • Données IGDB • Actualisation toutes les 60 secondes</div>
</div>
<script>
  let releases = [];
  const urlParams = new URLSearchParams(window.location.search);
  const platformFilter = (urlParams.get('platform') || 'all').toLowerCase();
  const platformTitle = platformFilter === 'all' ? 'GAME RELEASE COUNTDOWN' : platformFilter.toUpperCase() + ' — GAME RELEASE COUNTDOWN';

  async function fetchData() {
    try {
      const res = await fetch('/releases/data');
      let all = await res.json();
      if (platformFilter !== 'all') {
        all = all.filter(function(g) {
          return (g.platforms || []).some(function(p) {
            return p.toLowerCase().includes(platformFilter) || platformFilter.includes(p.toLowerCase());
          });
        });
      }
      releases = all;
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
  document.getElementById('header-title').textContent = platformTitle;
  fetchData();
  setInterval(fetchData, 60000);
  setInterval(tick, 1000);
</script>
</body>
</html>`;
}

export function getReleasesPage(): string {
  if (cachedHtml && Date.now() - cachedHtmlAt < HTML_CACHE_TTL_MS) {
    return cachedHtml;
  }
  cachedHtml = buildReleasesPage();
  cachedHtmlAt = Date.now();
  return cachedHtml;
}

export function getReleasesJson(): string {
  return JSON.stringify(getReleasesData());
}

export function getReleasesStatsPage(): string {
  const releases = getReleasesData();
  const total = releases.length;
  const byPlatform: Record<string, number> = {};
  const byGenre: Record<string, number> = {};
  const byMonth: Record<string, number> = {};

  for (const r of releases) {
    for (const p of r.platforms) {
      byPlatform[p] = (byPlatform[p] || 0) + 1;
    }
    for (const g of r.genres) {
      byGenre[g] = (byGenre[g] || 0) + 1;
    }
    const month = new Date(r.releaseDate).toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    byMonth[month] = (byMonth[month] || 0) + 1;
  }

  const platformBars = Object.entries(byPlatform)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([name, count]) =>
        `<div class="stat-row"><span>${name}</span><div class="bar"><div style="width:${(count / total) * 100}%"></div></div><span>${count}</span></div>`,
    )
    .join("");

  const genreBars = Object.entries(byGenre)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(
      ([name, count]) =>
        `<div class="stat-row"><span>${name}</span><div class="bar"><div style="width:${(count / total) * 100}%"></div></div><span>${count}</span></div>`,
    )
    .join("");

  const monthBars = Object.entries(byMonth)
    .map(
      ([name, count]) =>
        `<div class="stat-row"><span>${name}</span><div class="bar"><div style="width:${(count / total) * 100}%"></div></div><span>${count}</span></div>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>📊 Stats — Game Releases</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0a0a1a; color:#fff; font-family:'Segoe UI',system-ui,sans-serif; padding:20px; }
h1 { text-align:center; margin-bottom:20px; background:linear-gradient(135deg,#5865f2,#eb459e); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(350px,1fr)); gap:20px; max-width:1200px; margin:0 auto; }
.stat-card { background:#141428; border:2px solid #2a2a4a; border-radius:12px; padding:20px; }
.stat-card h2 { color:#5865f2; margin-bottom:15px; font-size:1.1em; }
.stat-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; font-size:0.9em; }
.stat-row span:first-child { flex:0 0 120px; text-align:right; color:#b0b0c8; }
.stat-row span:last-child { flex:0 0 30px; text-align:left; font-weight:bold; }
.bar { flex:1; height:20px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden; }
.bar div { height:100%; background:linear-gradient(90deg,#5865f2,#eb459e); border-radius:4px; }
.total { text-align:center; font-size:2em; font-weight:bold; color:#5865f2; margin-bottom:20px; }
</style>
</head>
<body>
<h1>📊 Statistiques des sorties</h1>
<div class="total">${total} jeu(x) suivi(s)</div>
<div class="stats-grid">
  <div class="stat-card"><h2>🎯 Plateformes</h2>${platformBars || "<p>Aucune donnée</p>"}</div>
  <div class="stat-card"><h2>🏷️ Genres</h2>${genreBars || "<p>Aucune donnée</p>"}</div>
  <div class="stat-card"><h2>📅 Par mois</h2>${monthBars || "<p>Aucune donnée</p>"}</div>
</div>
</body>
</html>`;
}

// ─── Game-specific preview page for screen share ────────────────────────────

export function getGamePreviewPage(gameName: string): string {
  const releases = getReleasesData();
  const game = releases.find(
    (r) =>
      r.gameName.toLowerCase().includes(gameName.toLowerCase()) ||
      gameName.toLowerCase().includes(r.gameName.toLowerCase()),
  );

  if (!game) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Aucun jeu</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a1a;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}
h1{font-size:2em;color:#666}</style></head><body><h1>Aucun jeu trouvé pour "${gameName}"</h1></body></html>`;
  }

  const releaseDate = new Date(game.releaseDate);
  const now = Date.now();
  const diff = releaseDate.getTime() - now;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const isReleased = diff <= 0;

  const total = 90 * 86400000;
  const elapsed = total - diff;
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));

  const cover = game.coverUrl || "";
  const dateStr = releaseDate.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Platform color mapping
  const platformColors: Record<string, string> = {
    steam: "#1b2838",
    epic: "#000000",
    playstation: "#003791",
    ps: "#003791",
    xbox: "#107c10",
    nintendo: "#e60012",
    switch: "#e60012",
  };
  const platformIcons: Record<string, string> = {
    steam: "🎮",
    epic: "🎮",
    playstation: "🎮",
    ps: "🎮",
    xbox: "🎮",
    nintendo: "🎮",
    switch: "🎮",
  };

  function getPlatformStyle(platformName: string): { color: string; icon: string; label: string } {
    const lower = platformName.toLowerCase();
    for (const [key, color] of Object.entries(platformColors)) {
      if (lower.includes(key))
        return { color, icon: platformIcons[key] || "🎮", label: platformName };
    }
    return { color: "#2a2a4a", icon: "🎮", label: platformName };
  }

  const platformCards = game.platforms
    .map((p, i) => {
      const style = getPlatformStyle(p);
      return `<div class="platform-card" style="--card-color:${style.color};--delay:${i * 3}s" data-platform="${p}">
      <div class="card-glow"></div>
      <div class="card-icon">${style.icon}</div>
      <div class="card-name">${p}</div>
    </div>`;
    })
    .join("");

  const genres = game.genres.join(", ") || "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${game.gameName} — Countdown</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  background: #0a0a1a;
  color: #fff;
  font-family: 'Segoe UI', system-ui, sans-serif;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.bg-cover {
  position: fixed; top:0; left:0; width:100%; height:100%;
  background-image: ${cover ? `url('${cover}')` : "none"};
  background-size: cover; background-position: center;
  filter: blur(20px) brightness(0.2);
  z-index: 0;
}
.content { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 30px; text-align: center; }
.game-cover { width: 240px; height: 320px; object-fit: cover; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); margin-bottom: 20px; }
.game-title { font-size: 3em; font-weight: 800; margin-bottom: 8px; background: linear-gradient(135deg, #5865f2, #eb459e); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-shadow: 0 4px 20px rgba(88,101,242,0.3); }
.game-genres { font-size: 1em; color: #8080a0; margin-bottom: 20px; }
.release-date { font-size: 1.3em; color: #fff; margin-bottom: 15px; }
.countdown {
  font-size: 4.5em; font-weight: 900; font-variant-numeric: tabular-nums;
  letter-spacing: 4px; margin-bottom: 15px;
  ${isReleased ? "color: #00d26a;" : "color: #5865f2; text-shadow: 0 0 30px rgba(88,101,242,0.5);"}
}
.countdown-label { font-size: 1em; color: #8080a0; text-transform: uppercase; letter-spacing: 6px; margin-bottom: 25px; }
.progress-container { width: 70%; max-width: 700px; margin-bottom: 25px; }
.progress-bar { width: 100%; height: 10px; background: rgba(255,255,255,0.1); border-radius: 5px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #5865f2, #eb459e); border-radius: 5px; transition: width 1s ease; width: ${pct}%; }
.progress-text { font-size: 0.8em; color: #666; margin-top: 6px; }

/* Platform cards */
.platforms-row {
  display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;
  perspective: 800px;
}
.platform-card {
  width: 160px; height: 100px;
  border-radius: 14px;
  background: var(--card-color);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
  opacity: 0; transform: translateY(60px) rotateX(40deg) scale(0.8);
  box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.08);
  animation: cardEnter 0.8s ease forwards;
  animation-delay: var(--delay);
}
.card-glow {
  position: absolute; top:0; left:0; width:100%; height:100%;
  background: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.12), transparent 70%);
}
.card-icon { font-size: 2em; margin-bottom: 6px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); }
.card-name { font-size: 0.85em; font-weight: 600; color: rgba(255,255,255,0.9); text-shadow: 0 1px 3px rgba(0,0,0,0.6); padding: 0 8px; text-align: center; }

@keyframes cardEnter {
  0% { opacity: 0; transform: translateY(60px) rotateX(40deg) scale(0.8); }
  60% { opacity: 1; transform: translateY(-8px) rotateX(-5deg) scale(1.05); }
  100% { opacity: 1; transform: translateY(0) rotateX(0) scale(1); }
}

/* Continuous floating animation after entry */
.platform-card {
  animation: cardEnter 0.8s ease forwards, cardFloat 3s ease-in-out infinite;
  animation-delay: var(--delay), calc(var(--delay) + 0.8s);
}
@keyframes cardFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.footer { position: fixed; bottom: 8px; left: 0; width: 100%; text-align: center; font-size: 0.65em; color: #444; }
</style>
</head>
<body>
<div class="bg-cover"></div>
<div class="content">
  ${cover ? `<img class="game-cover" src="${cover}" alt="${game.gameName}" />` : ""}
  <div class="game-title">${game.gameName}</div>
  ${genres ? `<div class="game-genres">🏷️ ${genres}</div>` : ""}
  <div class="release-date">📅 ${dateStr}</div>
  ${
    isReleased
      ? `<div class="countdown">🎉 SORTI !</div><div class="countdown-label">Disponible maintenant</div>`
      : `<div class="countdown" id="cd">${days}j ${hours}h ${minutes}m ${seconds}s</div><div class="countdown-label">Compte à rebours</div>`
  }
  <div class="progress-container">
    <div class="progress-bar"><div class="progress-fill" id="bar" style="width:${pct}%"></div></div>
    <div class="progress-text">${Math.round(pct)}% du temps écoulé</div>
  </div>
  <div class="platforms-row">${platformCards}</div>
</div>
<div class="footer">Game Release Countdown • ${new Date().toLocaleDateString("fr-FR")} • http://31.220.79.90:3000</div>
<script>
const releaseTime = ${releaseDate.getTime()};
function tick() {
  const diff = releaseTime - Date.now();
  if (diff <= 0) {
    document.getElementById('cd').innerHTML = '🎉 SORTI !';
    return;
  }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  document.getElementById('cd').innerHTML = d + 'j ' + h + 'h ' + m + 'm ' + s + 's';
  const total = 90 * 86400000;
  const elapsed = total - diff;
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  document.getElementById('bar').style.width = pct + '%';
}
setInterval(tick, 1000);
</script>
</body>
</html>`;
}

// ─── Showcase page: all upcoming AAA/AA games with animated platform cards ──

export function getShowcasePage(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Game Releases — Showcase</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  background: linear-gradient(rgba(10,10,26,0.30), rgba(10,10,26,0.45)), url('https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fimages.wallpapersden.com%2Fimage%2Fdownload%2Fhelldivers-2-super-citizen_bmdoa2yUmZqaraWkpJRmbmdlrWZlbWU.jpg&f=1&nofb=1&ipt=71c088dfc355d8b3b741c672ff276afcd49bb38cc57cc23e1d6d28d17c6c7401') center/cover no-repeat fixed;
  color: #fff;
  font-family: 'Segoe UI', system-ui, sans-serif;
  height: 100vh;
  overflow: hidden;
}
.showcase {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  padding: 14px 24px;
}
.showcase-header {
  text-align: center;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.showcase-header h1 {
  font-size: 1.8em; font-weight: 900;
  color: #fff;
  text-shadow: 0 4px 20px rgba(88,101,242,0.5);
  letter-spacing: 1px;
}
.showcase-header .subtitle {
  font-size: 0.8em; color: rgba(255,255,255,0.5);
  margin-top: 2px;
}
.games-track {
  flex: 1;
  overflow: hidden;
  position: relative;
  mask-image: linear-gradient(to bottom, transparent 0%, #000 5%, #000 95%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 5%, #000 95%, transparent 100%);
}
.games-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 20px 8px;
  will-change: transform;
}
.game-card {
  display: flex;
  background: rgba(15,15,35,0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05);
  transition: opacity 0.3s ease, transform 0.3s ease, box-shadow 0.2s, max-height 0.3s ease, margin 0.3s ease, padding 0.3s ease;
  max-height: 130px;
  opacity: 1;
  will-change: transform, opacity;
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.game-card.entering {
  opacity: 0;
  transform: translateY(20px) scale(0.92);
}
.game-card.entered {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.game-card.expiring {
  animation: expireGlow 2s ease;
}
@keyframes expireGlow {
  0% { box-shadow: 0 4px 20px rgba(0,0,0,0.5); transform: scale(1); }
  20% { box-shadow: 0 0 40px rgba(0,210,106,0.8), 0 0 0 3px rgba(0,210,106,0.5); transform: scale(1.05); }
  40% { box-shadow: 0 0 30px rgba(0,210,106,0.6), 0 0 0 2px rgba(0,210,106,0.3); transform: scale(1.02); }
  60% { box-shadow: 0 0 50px rgba(0,210,106,0.7), 0 0 0 3px rgba(0,210,106,0.4); transform: scale(1.06); }
  100% { box-shadow: 0 0 20px rgba(0,210,106,0.3); transform: scale(1); }
}
.game-card.expired {
  opacity: 0;
  transform: scale(0.8) translateX(50px);
  max-height: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  filter: blur(4px);
}
@keyframes slideInFromRight {
  0% { opacity: 0; transform: translateX(40px) scale(0.9); }
  60% { opacity: 0.9; transform: translateX(-3px) scale(1.01); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}
.game-card.slide-in {
  animation: slideInFromRight 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  will-change: transform, opacity;
}
.game-card:hover {
  box-shadow: 0 8px 30px rgba(88,101,242,0.25), 0 0 0 1px rgba(88,101,242,0.15);
}
.game-card.imminent {
  background: rgba(40,30,5,0.55);
  border: 1px solid rgba(255,200,50,0.4);
  box-shadow: 0 4px 20px rgba(255,180,0,0.15), 0 0 0 1px rgba(255,200,50,0.2);
}
.game-card.imminent .gc-countdown {
  color: #ffc832;
  text-shadow: 0 0 12px rgba(255,200,50,0.5);
}
.game-card.imminent .gc-title {
  color: #ffe082;
}
.gc-cover {
  width: 80px; height: 110px;
  background-size: cover; background-position: center;
  background-color: #1a1a2e;
  flex-shrink: 0;
  border-radius: 6px;
  margin: 8px;
}
.gc-info {
  padding: 8px 12px 8px 4px;
  display: flex; flex-direction: column;
  flex: 1;
  justify-content: center;
}
.gc-title {
  font-size: 1.05em; font-weight: 700;
  color: #fff;
  margin-bottom: 2px;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gc-date {
  font-size: 0.72em; color: #7878a0;
  margin-bottom: 4px;
}
.gc-countdown {
  font-size: 1.1em; font-weight: 800;
  color: #5865f2;
  font-variant-numeric: tabular-nums;
  margin-bottom: 5px;
  text-shadow: 0 0 8px rgba(88,101,242,0.3);
}
.gc-countdown.released {
  color: #00d26a;
  text-shadow: 0 0 12px rgba(0,210,106,0.5);
}
.gc-genres {
  font-size: 0.62em; color: #5a5a8a;
  margin-bottom: 5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.gc-platforms {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.pcard {
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 0.6em; font-weight: 600;
  color: rgba(255,255,255,0.92);
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}
.pcard-name { white-space: nowrap; }
.footer {
  text-align: center;
  font-size: 0.55em;
  color: rgba(255,255,255,0.25);
  padding: 4px 0;
  flex-shrink: 0;
}
.loading {
  color: rgba(255,255,255,0.4);
  font-size: 1.2em;
  text-align: center;
  padding: 80px;
  grid-column: 1/-1;
}
</style>
</head>
<body>
<div class="showcase">
  <div class="showcase-header">
    <h1>🎮 Sorties à venir</h1>
    <div class="subtitle" id="subtitle">Chargement...</div>
  </div>
  <div class="games-track">
    <div class="games-grid" id="grid">
      <div class="loading">Chargement des sorties...</div>
    </div>
  </div>
  <div class="footer">Game Release Countdown • Défilement automatique • Mise à jour temps réel</div>
</div>
<script>
const platformColors = {
  steam: '#1b2838', epic: '#0a0a0a', playstation: '#003791', ps: '#003791',
  xbox: '#107c10', nintendo: '#e60012', switch: '#e60012'
};
function getPlatformColor(name) {
  const lower = name.toLowerCase();
  for (const [key, c] of Object.entries(platformColors)) {
    if (lower.includes(key)) return c;
  }
  return '#2a2a4a';
}

let currentGames = new Map(); // gameName -> { el, releaseTime }

function buildCard(game) {
  const releaseDate = new Date(game.releaseDate);
  const now = Date.now();
  const diff = releaseDate.getTime() - now;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const cover = game.coverUrl || '';
  const dateStr = releaseDate.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  const genres = (game.genres || []).slice(0, 3).join(' • ');
  const cards = (game.platforms || []).map(p =>
    '<div class="pcard" style="background:' + getPlatformColor(p) + '"><span class="pcard-name">' + p + '</span></div>'
  ).join('');

  const card = document.createElement('div');
  card.className = 'game-card entering';
  card.dataset.gameName = game.gameName;
  card.dataset.releaseTime = releaseDate.getTime().toString();
  // Highlight games releasing within 7 days in gold
  if (diff > 0 && diff <= 7 * 86400000) {
    card.classList.add('imminent');
  }
  card.innerHTML =
    '<div class="gc-cover"' + (cover ? ' style="background-image:url(\\'' + cover + '\\')"' : '') + '></div>' +
    '<div class="gc-info">' +
      '<div class="gc-title">' + game.gameName + '</div>' +
      '<div class="gc-date">' + dateStr + '</div>' +
      '<div class="gc-countdown" data-release="' + releaseDate.getTime() + '">' +
        (diff <= 0 ? '🎉 SORTI !' : days + 'j ' + hours + 'h ' + minutes + 'm ' + seconds + 's') +
      '</div>' +
      (genres ? '<div class="gc-genres">' + genres + '</div>' : '') +
      '<div class="gc-platforms">' + cards + '</div>' +
    '</div>';

  // Animate in with slide effect
  card.classList.add('slide-in');
  card.classList.remove('entering');
  setTimeout(() => {
    card.classList.add('entered');
    card.classList.remove('slide-in');
  }, 700);
  return card;
}

function updateCountdowns() {
  const now = Date.now();
  document.querySelectorAll('.gc-countdown').forEach(el => {
    const release = parseInt(el.dataset.release);
    const diff = release - now;
    if (diff <= 0) {
      el.innerHTML = '🎉 SORTI !';
      el.classList.add('released');
      const card = el.closest('.game-card');
      if (card && !card.classList.contains('expiring') && !card.classList.contains('expired')) {
        card.classList.add('expiring');
        // After glow animation, fade out with blur and remove
        setTimeout(() => {
          card.classList.remove('expiring');
          card.classList.add('expired');
          setTimeout(() => {
            const name = card.dataset.gameName;
            if (name) currentGames.delete(name);
            card.remove();
          }, 800);
        }, 2000);
      }
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.innerHTML = d + 'j ' + h + 'h ' + m + 'm ' + s + 's';
    // Add/remove imminent class based on 7-day threshold
    const card = el.closest('.game-card');
    if (card) {
      if (diff > 0 && diff <= 7 * 86400000) {
        card.classList.add('imminent');
      } else {
        card.classList.remove('imminent');
      }
    }
  });
}

async function fetchAndRender() {
  try {
    const res = await fetch('/releases/data');
    if (!res.ok) return;
    const data = await res.json();
    const now = Date.now();
    const upcoming = data
      .filter(g => new Date(g.releaseDate).getTime() > now - 3600000) // Keep games up to 1h after release for animation
      .sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));

    document.getElementById('subtitle').textContent =
      'AAA & AA • ' + upcoming.length + ' jeux • Compte à rebours en temps réel';

    const grid = document.getElementById('grid');
    const existingNames = new Set(currentGames.keys());
    const newNames = new Set(upcoming.map(g => g.gameName));

    // Remove games no longer in data (and not already expiring)
    for (const name of existingNames) {
      if (!newNames.has(name)) {
        const entry = currentGames.get(name);
        if (entry && !entry.el.classList.contains('expired') && !entry.el.classList.contains('expiring')) {
          entry.el.classList.add('expired');
          setTimeout(() => {
            currentGames.delete(name);
            entry.el.remove();
          }, 700);
        }
      }
    }

    // Add new games
    let added = 0;
    for (const game of upcoming) {
      if (!currentGames.has(game.gameName)) {
        const card = buildCard(game);
        grid.appendChild(card);
        currentGames.set(game.gameName, { el: card, releaseTime: new Date(game.releaseDate).getTime() });
        added++;
      }
    }

    // Remove loading placeholder
    const loading = grid.querySelector('.loading');
    if (loading && upcoming.length > 0) loading.remove();

    updateCountdowns();
  } catch (err) {
    console.error('fetch error:', err);
  }
}

// Initial load
fetchAndRender();
// Update countdowns every second
setInterval(updateCountdowns, 1000);
// Refresh data every 30s (picks up new games, removes expired ones)
setInterval(fetchAndRender, 30000);

// JS-driven smooth scroll — more reliable than CSS animation with dynamic DOM
let scrollY = 0;
let scrollPaused = false;
const track = document.querySelector('.games-track');
const gridEl = document.getElementById('grid');
gridEl.addEventListener('mouseenter', () => { scrollPaused = true; });
gridEl.addEventListener('mouseleave', () => { scrollPaused = false; });

function scrollLoop() {
  if (!scrollPaused && gridEl.scrollHeight > 0) {
    scrollY += 0.3; // pixels per frame — smooth slow scroll
    const maxScroll = gridEl.scrollHeight - track.clientHeight;
    if (maxScroll > 0) {
      if (scrollY >= maxScroll) scrollY = 0; // loop back to top
      gridEl.style.transform = 'translateY(' + (-scrollY) + 'px)';
    }
  }
  requestAnimationFrame(scrollLoop);
}
requestAnimationFrame(scrollLoop);
</script>
</body>
</html>`;
}
