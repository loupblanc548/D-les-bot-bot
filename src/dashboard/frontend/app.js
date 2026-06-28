/* dashboard/frontend/app.js — Logique frontend du dashboard Shadow Broker */

// ─── State ──────────────────────────────────────────────────────────────────

let sessionToken = null;
let currentGuildId = null;
let currentGuildConfig = null;

// ─── API Helper ─────────────────────────────────────────────────────────────

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Screen Management ──────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ─── Toast ──────────────────────────────────────────────────────────────────

function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = `toast${isError ? " error" : ""}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── Init ───────────────────────────────────────────────────────────────────

async function init() {
  // Check for token in URL (after OAuth callback)
  const params = new URLSearchParams(window.location.search);
  const tokenParam = params.get("token");
  if (tokenParam) {
    sessionToken = tokenParam;
    window.history.replaceState({}, document.title, "/");
    await loadUser();
    return;
  }

  // Check for stored token
  const stored = localStorage.getItem("sb_session");
  if (stored) {
    sessionToken = stored;
    try {
      await loadUser();
      return;
    } catch {
      localStorage.removeItem("sb_session");
      sessionToken = null;
    }
  }

  // Show login
  showScreen("login-screen");
  startMatrixRain();
}

// ─── Login ──────────────────────────────────────────────────────────────────

document.getElementById("login-btn").addEventListener("click", () => {
  window.open("/api/auth/discord", "_blank");
});

// ─── Load User ──────────────────────────────────────────────────────────────

async function loadUser() {
  try {
    const user = await api("/user");
    localStorage.setItem("sb_session", sessionToken);

    document.getElementById("user-avatar").src = user.avatarUrl;
    document.getElementById("user-name").textContent = user.globalName || user.username;

    await loadGuilds();
  } catch (err) {
    toast("Session expirée, veuillez vous reconnecter", true);
    showScreen("login-screen");
    startMatrixRain();
  }
}

// ─── Load Guilds ────────────────────────────────────────────────────────────

async function loadGuilds() {
  showScreen("guilds-screen");
  const grid = document.getElementById("guilds-grid");
  grid.innerHTML = '<div class="loading">Chargement des serveurs</div>';

  try {
    const data = await api("/guilds");
    grid.innerHTML = "";

    if (data.guilds.length === 0) {
      grid.innerHTML = "<p>Aucun serveur trouvé. Vous devez être administrateur d'un serveur où le bot est présent.</p>";
      return;
    }

    for (const guild of data.guilds) {
      const card = document.createElement("div");
      card.className = "guild-card";
      card.innerHTML = `
        ${guild.icon
          ? `<img class="guild-card-icon" src="${escapeHtml(guild.icon)}" alt="">`
          : `<div class="guild-card-icon-placeholder">🏰</div>`
        }
        <div class="guild-card-info">
          <div class="guild-card-name">${escapeHtml(guild.name)}</div>
          <div class="guild-card-status">
            <span class="status-dot ${guild.botPresent ? "online" : "offline"}"></span>
            <span>${guild.botPresent ? "Bot en ligne" : "Bot absent"}</span>
            ${guild.isOwner ? " · 👑 Owner" : ""}
          </div>
          <div class="guild-card-actions">
            ${guild.botPresent
              ? `<button class="btn-ghost" onclick="openDashboard('${escapeHtml(guild.id)}', '${escapeHtml(guild.name)}', '${escapeHtml(guild.icon || "")}')">Configurer →</button>`
              : `<button class="btn-ghost" onclick="inviteBot('${escapeHtml(guild.id)}')">+ Inviter le bot</button>`
            }
          </div>
        </div>
      `;
      grid.appendChild(card);
    }
  } catch (err) {
    grid.innerHTML = `<p style="color: var(--danger)">Erreur: ${escapeHtml(err.message)}</p>`;
  }
}

// ─── Open Dashboard ─────────────────────────────────────────────────────────

async function openDashboard(guildId, guildName, guildIcon) {
  currentGuildId = guildId;
  document.getElementById("guild-name").textContent = guildName;
  document.getElementById("guild-icon").src = guildIcon || "";
  showScreen("dashboard-screen");

  try {
    currentGuildConfig = await api(`/guilds/${guildId}`);
    renderTab("general");
  } catch (err) {
    toast("Erreur chargement config: " + err.message, true);
  }
}

// Make it global
window.openDashboard = openDashboard;

// ─── Invite Bot ─────────────────────────────────────────────────────────────

function inviteBot(guildId) {
  const clientId = localStorage.getItem("sb_client_id") || "";
  const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands&permissions=8&guild_id=${guildId}`;
  window.open(url, "_blank");
}
window.inviteBot = inviteBot;

// ─── Tab Navigation ─────────────────────────────────────────────────────────

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderTab(btn.dataset.tab);
  });
});

function renderTab(tab) {
  const content = document.getElementById("tab-content");
  const cfg = currentGuildConfig || {};

  switch (tab) {
    case "general":
      content.innerHTML = `
        <div class="card">
          <div class="card-title">⚙️ Configuration Générale</div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Préfixe des commandes</label>
              <input class="form-input" id="cfg-prefix" value="${escapeHtml(cfg.prefix || "/")}" placeholder="/">
            </div>
            <div class="form-group">
              <label class="form-label">Langue</label>
              <select class="form-select" id="cfg-language">
                <option value="fr" ${cfg.language === "fr" ? "selected" : ""}>Français</option>
                <option value="en" ${cfg.language === "en" ? "selected" : ""}>English</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Salon de logs</label>
            <input class="form-input" id="cfg-logChannel" value="${escapeHtml(cfg.logChannelId || "")}" placeholder="ID du salon">
          </div>
        </div>
        <div class="card">
          <div class="card-title">🎨 Apparence</div>
          <div class="form-group">
            <label>Mode sombre forcé</label>
            <label class="toggle">
              <input type="checkbox" id="cfg-darkMode" ${cfg.darkMode ? "checked" : ""}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>`;
      break;

    case "moderation":
      content.innerHTML = `
        <div class="card">
          <div class="card-title">⚖️ Modération</div>
          <div class="form-group">
            <label class="form-label">Rôle Modérateur</label>
            <input class="form-input" id="cfg-modRole" value="${escapeHtml(cfg.modRoleId || "")}" placeholder="ID du rôle modérateur">
          </div>
          <div class="form-group">
            <label class="form-label">Rôle Admin</label>
            <input class="form-input" id="cfg-adminRole" value="${escapeHtml(cfg.adminRoleId || "")}" placeholder="ID du rôle admin">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Auto-ban spammers</label>
              <label class="toggle">
                <input type="checkbox" id="cfg-autoBan" ${cfg.autoBanSpammers ? "checked" : ""}>
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="form-group">
              <label>Anti-raid</label>
              <label class="toggle">
                <input type="checkbox" id="cfg-antiRaid" ${cfg.antiRaid ? "checked" : ""}>
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>`;
      break;

    case "logs":
      content.innerHTML = `
        <div class="card">
          <div class="card-title">📋 Configuration des Logs</div>
          <div class="form-group">
            <label class="form-label">Salon de logs général</label>
            <input class="form-input" id="cfg-logChannel" value="${escapeHtml(cfg.logChannelId || "")}" placeholder="ID du salon">
          </div>
          <div class="form-group">
            <label class="form-label">Salon de logs de modération</label>
            <input class="form-input" id="cfg-modLogChannel" value="${escapeHtml(cfg.modLogChannelId || "")}" placeholder="ID du salon">
          </div>
          <div class="form-row">
            <div class="form-group"><label>Logs joins/leaves</label><label class="toggle"><input type="checkbox" ${cfg.logJoins ? "checked" : ""}><span class="toggle-slider"></span></label></div>
            <div class="form-group"><label>Logs messages supprimés</label><label class="toggle"><input type="checkbox" ${cfg.logDeletes ? "checked" : ""}><span class="toggle-slider"></span></label></div>
            <div class="form-group"><label>Logs edits</label><label class="toggle"><input type="checkbox" ${cfg.logEdits ? "checked" : ""}><span class="toggle-slider"></span></label></div>
            <div class="form-group"><label>Logs voice</label><label class="toggle"><input type="checkbox" ${cfg.logVoice ? "checked" : ""}><span class="toggle-slider"></span></label></div>
          </div>
        </div>`;
      break;

    case "levels":
      content.innerHTML = `
        <div class="card">
          <div class="card-title">📊 Système de Niveaux</div>
          <div class="form-group">
            <label>Activer les niveaux</label>
            <label class="toggle"><input type="checkbox" id="cfg-levels" ${cfg.levelsEnabled ? "checked" : ""}><span class="toggle-slider"></span></label>
          </div>
          <div class="form-group">
            <label class="form-label">Salon des annonces de niveau</label>
            <input class="form-input" id="cfg-levelChannel" value="${escapeHtml(cfg.levelChannelId || "")}" placeholder="ID du salon">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">XP par message</label>
              <input class="form-input" type="number" id="cfg-xpPerMsg" value="${cfg.xpPerMessage || 15}">
            </div>
            <div class="form-group">
              <label class="form-label">Cooldown (secondes)</label>
              <input class="form-input" type="number" id="cfg-xpCooldown" value="${cfg.xpCooldown || 60}">
            </div>
          </div>
        </div>`;
      break;

    case "welcome":
      content.innerHTML = `
        <div class="card">
          <div class="card-title">👋 Messages de Bienvenue</div>
          <div class="form-group">
            <label>Activer les bienvenues</label>
            <label class="toggle"><input type="checkbox" id="cfg-welcome" ${cfg.welcomeEnabled ? "checked" : ""}><span class="toggle-slider"></span></label>
          </div>
          <div class="form-group">
            <label class="form-label">Salon de bienvenue</label>
            <input class="form-input" id="cfg-welcomeChannel" value="${escapeHtml(cfg.welcomeChannelId || "")}" placeholder="ID du salon">
          </div>
          <div class="form-group">
            <label class="form-label">Message de bienvenue</label>
            <textarea class="form-textarea" id="cfg-welcomeMsg" placeholder="Bienvenue {user} sur {server}!">${escapeHtml(cfg.welcomeMessage || "")}</textarea>
          </div>
        </div>`;
      break;

    case "automod":
      content.innerHTML = `
        <div class="card">
          <div class="card-title">🤖 Auto-Modération</div>
          <div class="form-group">
            <label>Activer l'auto-mod</label>
            <label class="toggle"><input type="checkbox" id="cfg-automod" ${cfg.autoModEnabled ? "checked" : ""}><span class="toggle-slider"></span></label>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Filtre anti-insultes</label><label class="toggle"><input type="checkbox" ${cfg.filterProfanity ? "checked" : ""}><span class="toggle-slider"></span></label></div>
            <div class="form-group"><label>Filtre anti-spam</label><label class="toggle"><input type="checkbox" ${cfg.filterSpam ? "checked" : ""}><span class="toggle-slider"></span></label></div>
            <div class="form-group"><label>Filtre anti-caps</label><label class="toggle"><input type="checkbox" ${cfg.filterCaps ? "checked" : ""}><span class="toggle-slider"></span></label></div>
            <div class="form-group"><label>Filtre anti-links</label><label class="toggle"><input type="checkbox" ${cfg.filterLinks ? "checked" : ""}><span class="toggle-slider"></span></label></div>
          </div>
          <div class="form-group">
            <label class="form-label">Mots interdits (séparés par virgule)</label>
            <textarea class="form-textarea" id="cfg-bannedWords" placeholder="mot1, mot2, mot3">${escapeHtml(cfg.bannedWords || "")}</textarea>
          </div>
        </div>`;
      break;

    case "osint":
      content.innerHTML = `
        <div class="card">
          <div class="card-title">🕵️ Shadow Broker OSINT</div>
          <p style="color: var(--text-muted); margin-bottom: 1rem;">18 sous-commandes disponibles via /shadow (modérateur minimum)</p>
          <div class="form-row">
            <div class="form-group"><label>Activer /shadow</label><label class="toggle"><input type="checkbox" ${cfg.shadowEnabled !== false ? "checked" : ""}><span class="toggle-slider"></span></label></div>
            <div class="form-group"><label>Alertes proactive DM</label><label class="toggle"><input type="checkbox" ${cfg.proactiveAlerts ? "checked" : ""}><span class="toggle-slider"></span></label></div>
          </div>
          <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-tertiary); border-radius: 4px; border-left: 2px solid var(--accent);">
            <p style="color: var(--text-secondary); font-size: 0.85rem;">📋 Sous-commandes: intel, network, patterns, report, stealth, watch, search, sherlock, maigret, email, breach, phone, domain, whois, dns, instagram, insta-deep, crawl, social, harvester, wmn, exif, cms</p>
          </div>
        </div>`;
      break;

    case "stats":
      content.innerHTML = '<div class="loading">Chargement des statistiques</div>';
      api("/bot/stats").then((stats) => {
        content.innerHTML = `
          <div class="stats-grid">
            <div class="stat-card"><div class="stat-value">${stats.totalGuilds}</div><div class="stat-label">SERVEURS</div></div>
            <div class="stat-card"><div class="stat-value">${stats.totalLogs}</div><div class="stat-label">LOGS</div></div>
            <div class="stat-card"><div class="stat-value">${stats.totalSanctions}</div><div class="stat-label">SANCTIONS</div></div>
            <div class="stat-card"><div class="stat-value">${stats.totalUsers}</div><div class="stat-label">UTILISATEURS</div></div>
            <div class="stat-card"><div class="stat-value">${Math.floor(stats.uptime / 3600)}h</div><div class="stat-label">UPTIME</div></div>
            <div class="stat-card"><div class="stat-value">${stats.memoryMb}</div><div class="stat-label">MÉMOIRE (MB)</div></div>
          </div>`;
      }).catch(() => {
        content.innerHTML = "<p style='color: var(--danger)'>Erreur chargement stats</p>";
      });
      break;

    default:
      content.innerHTML = "<p>Section en construction</p>";
  }
}

// ─── Save Settings ──────────────────────────────────────────────────────────

document.getElementById("save-btn").addEventListener("click", async () => {
  if (!currentGuildId) return;

  // Collecter toutes les valeurs des inputs
  const settings = {};
  document.querySelectorAll("[id^='cfg-']").forEach((el) => {
    const key = el.id.replace("cfg-", "");
    if (el.type === "checkbox") {
      settings[key] = el.checked;
    } else if (el.type === "number") {
      settings[key] = parseInt(el.value, 10) || 0;
    } else {
      settings[key] = el.value;
    }
  });

  try {
    await api(`/guilds/${currentGuildId}/settings`, {
      method: "POST",
      body: JSON.stringify(settings),
    });
    toast("✅ Configuration sauvegardée");
  } catch (err) {
    toast("Erreur: " + err.message, true);
  }
});

// ─── Logout ─────────────────────────────────────────────────────────────────

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await api("/auth/logout", { method: "GET" });
  } catch {}
  localStorage.removeItem("sb_session");
  sessionToken = null;
  showScreen("login-screen");
  startMatrixRain();
});

// ─── Back Button ────────────────────────────────────────────────────────────

document.getElementById("back-btn").addEventListener("click", () => {
  loadGuilds();
});

// ─── Matrix Rain Effect ─────────────────────────────────────────────────────

function startMatrixRain() {
  const canvas = document.createElement("canvas");
  const container = document.getElementById("matrix");
  if (!container) return;
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const chars = "01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
  const fontSize = 14;
  const columns = Math.floor(canvas.width / fontSize);
  const drops = Array(columns).fill(1);

  function draw() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#00ff41";
    ctx.font = `${fontSize}px monospace`;
    for (let i = 0; i < drops.length; i++) {
      const text = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(text, i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
  }

  const interval = setInterval(draw, 50);

  // Stop after 10s to save CPU
  setTimeout(() => {
    clearInterval(interval);
    container.innerHTML = "";
  }, 10000);
}

// ─── Utils ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ─── Start ──────────────────────────────────────────────────────────────────

init();
