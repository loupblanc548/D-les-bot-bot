/* dashboard/frontend/app.js — Shadow Broker AI Dashboard */

let sessionToken = null;
let isSending = false;
let allTools = [];

async function api(path, options = {}) {
  const token = sessionToken || localStorage.getItem("sb_session");
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function controlApi(path, options = {}) {
  const base = localStorage.getItem("sb_control_url") || `http://${window.location.hostname}:3002`;
  const token = localStorage.getItem("sb_control_token") || "";
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const v = document.getElementById(`${name}-view`);
  if (v) v.classList.add("active");
  if (name === "tools" && allTools.length === 0) loadTools();
  if (name === "servers") loadServers();
  if (name === "stats") loadStats();
  if (name === "fortnite") loadFortnite();
  if (name === "settings") loadSettings();
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
  const params = new URLSearchParams(window.location.search);
  const tokenParam = params.get("token");
  if (tokenParam) {
    sessionToken = tokenParam;
    window.history.replaceState({}, document.title, "/");
    try {
      await loadUser();
      showScreen("main-screen");
      showView("chat");
      return;
    } catch {
      localStorage.removeItem("sb_session");
      sessionToken = null;
    }
  }

  const stored = localStorage.getItem("sb_session");
  if (stored) {
    sessionToken = stored;
    try {
      await loadUser();
      showScreen("main-screen");
      showView("chat");
      return;
    } catch {
      localStorage.removeItem("sb_session");
      sessionToken = null;
    }
  }

  showScreen("login-screen");
}

document.getElementById("login-btn").addEventListener("click", () => {
  window.location.href = "/api/auth/discord";
});

async function loadUser() {
  const user = await api("/user");
  localStorage.setItem("sb_session", sessionToken);
  const avatarEl = document.getElementById("user-avatar");
  const nameEl = document.getElementById("user-name");
  if (user.avatarUrl) avatarEl.src = user.avatarUrl;
  else if (user.avatar) avatarEl.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
  else avatarEl.style.display = "none";
  nameEl.textContent = user.globalName || user.username || "User";
}

// ─── Sidebar Nav ────────────────────────────────────────────────────────────

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    showView(btn.dataset.view);
  });
});

// ─── AI Chat ────────────────────────────────────────────────────────────────

const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatMessages = document.getElementById("chat-messages");
const chatToolsToggle = document.getElementById("chat-tools-toggle");

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
  chatSend.disabled = !chatInput.value.trim() || isSending;
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!chatSend.disabled) sendChat();
  }
});

chatSend.addEventListener("click", () => sendChat());

document.getElementById("chat-clear").addEventListener("click", () => {
  chatMessages.innerHTML = "";
  showChatWelcome();
});

function showChatWelcome() {
  chatMessages.innerHTML = `
    <div class="chat-welcome">
      <div class="chat-welcome-icon">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/><path d="M12 16a4 4 0 1 0-4-4 4 4 0 0 0 4 4z"/></svg>
      </div>
      <h3>Bienvenue sur Shadow Broker AI</h3>
      <p>Posez-moi n'importe quelle question. J'ai accès à 212 outils :<br>météo, crypto, web, gaming, DNS, math, GitHub, et plus encore.</p>
      <div class="chat-suggestions">
        <button class="suggestion-chip" data-prompt="Quel temps fait-il à Paris ?">🌤️ Météo Paris</button>
        <button class="suggestion-chip" data-prompt="Quel est le prix du Bitcoin ?">₿ Prix Bitcoin</button>
        <button class="suggestion-chip" data-prompt="Donne-moi les dernières actualités tech">📰 Actus tech</button>
        <button class="suggestion-chip" data-prompt="Génère un mot de passe sécurisé de 20 caractères">🔐 Mot de passe</button>
      </div>
    </div>`;
  document.querySelectorAll(".suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      chatInput.value = chip.dataset.prompt;
      chatInput.dispatchEvent(new Event("input"));
      sendChat();
    });
  });
}

document.querySelectorAll(".suggestion-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    chatInput.value = chip.dataset.prompt;
    chatInput.dispatchEvent(new Event("input"));
    sendChat();
  });
});

async function sendChat() {
  const message = chatInput.value.trim();
  if (!message || isSending) return;
  isSending = true;
  chatSend.disabled = true;

  const welcome = chatMessages.querySelector(".chat-welcome");
  if (welcome) welcome.remove();

  addChatMessage("user", message);
  chatInput.value = "";
  chatInput.style.height = "auto";

  const typingEl = addTypingIndicator();

  try {
    const res = await controlApi("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        sessionId: "dashboard",
        username: "Dashboard User",
        tools: chatToolsToggle.checked,
      }),
    });
    typingEl.remove();
    addChatMessage("assistant", res.response || "Aucune réponse");
  } catch (err) {
    typingEl.remove();
    addChatMessage("assistant", "Erreur: " + err.message);
  } finally {
    isSending = false;
    chatSend.disabled = !chatInput.value.trim();
  }
}

function addChatMessage(role, content) {
  const msg = document.createElement("div");
  msg.className = `chat-msg ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "chat-msg-avatar";
  avatar.textContent = role === "user" ? "U" : "AI";
  const bubble = document.createElement("div");
  bubble.className = "chat-msg-bubble";
  bubble.textContent = content;
  msg.appendChild(avatar);
  msg.appendChild(bubble);
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addTypingIndicator() {
  const msg = document.createElement("div");
  msg.className = "chat-msg assistant";
  msg.innerHTML = `<div class="chat-msg-avatar">AI</div><div class="chat-msg-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>`;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return msg;
}

// ─── Tools ──────────────────────────────────────────────────────────────────

async function loadTools() {
  try {
    const data = await controlApi("/api/tools");
    allTools = data.tools || [];
    renderTools(allTools);
  } catch (err) {
    document.getElementById("tools-grid").innerHTML =
      `<p style="color: var(--danger); grid-column: 1/-1; text-align: center;">Erreur: ${escapeHtml(err.message)}</p>`;
  }
}

function renderTools(tools) {
  const grid = document.getElementById("tools-grid");
  if (!tools.length) {
    grid.innerHTML = "<p style='color: var(--text-muted); grid-column: 1/-1; text-align: center;'>Aucun outil trouvé</p>";
    return;
  }
  grid.innerHTML = tools.map((t) => `
    <div class="tool-card">
      <div class="tool-card-name">${escapeHtml(t.name || "unknown")}</div>
      <div class="tool-card-desc">${escapeHtml((t.description || "").slice(0, 120))}</div>
      <span class="tool-card-type ${t.type}">${t.type}</span>
    </div>`).join("");
}

document.getElementById("tools-search").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  renderTools(allTools.filter((t) =>
    (t.name || "").toLowerCase().includes(q) ||
    (t.description || "").toLowerCase().includes(q)
  ));
});

// ─── Servers ────────────────────────────────────────────────────────────────

async function loadServers() {
  try {
    const data = await api("/guilds");
    const guilds = data.guilds || data;
    const grid = document.getElementById("servers-grid");
    if (!guilds.length) {
      grid.innerHTML = "<p style='color: var(--text-muted); grid-column: 1/-1; text-align: center;'>Aucun serveur trouvé</p>";
      return;
    }
    grid.innerHTML = guilds.map((g) => {
      const icon = g.icon
        ? `<img class="server-card-icon" src="${escapeHtml(g.icon)}" alt="">`
        : `<div class="server-card-placeholder">🏰</div>`;
      return `<div class="server-card">${icon}<div class="server-card-info"><div class="server-card-name">${escapeHtml(g.name)}</div><div class="server-card-status"><span class="status-dot ${g.botPresent ? "online" : "offline"}"></span><span>${g.botPresent ? "Bot en ligne" : "Bot absent"}</span></div></div></div>`;
    }).join("");
  } catch (err) {
    document.getElementById("servers-grid").innerHTML =
      `<p style="color: var(--danger); grid-column: 1/-1; text-align: center;">Erreur: ${escapeHtml(err.message)}</p>`;
  }
}

// ─── Stats ──────────────────────────────────────────────────────────────────

async function loadStats() {
  const content = document.getElementById("stats-content");
  try {
    const stats = await api("/bot/stats");
    content.innerHTML = `<div class="stats-grid">
      <div class="stat-card"><span class="stat-icon">🏰</span><div class="stat-value">${stats.totalGuilds || 0}</div><div class="stat-label">Serveurs</div></div>
      <div class="stat-card"><span class="stat-icon">👥</span><div class="stat-value">${stats.totalUsers || 0}</div><div class="stat-label">Utilisateurs</div></div>
      <div class="stat-card"><span class="stat-icon">📋</span><div class="stat-value">${stats.totalLogs || 0}</div><div class="stat-label">Logs</div></div>
      <div class="stat-card"><span class="stat-icon">🔨</span><div class="stat-value">${stats.totalSanctions || 0}</div><div class="stat-label">Sanctions</div></div>
      <div class="stat-card"><span class="stat-icon">⏱️</span><div class="stat-value">${Math.floor((stats.uptime || 0) / 3600)}h</div><div class="stat-label">Uptime</div></div>
      <div class="stat-card"><span class="stat-icon">💾</span><div class="stat-value">${stats.memoryMb || 0}</div><div class="stat-label">Mémoire (MB)</div></div>
    </div>`;
  } catch (err) {
    content.innerHTML = `<p style="color: var(--danger)">Erreur: ${escapeHtml(err.message)}</p>`;
  }
}

// ─── Settings ───────────────────────────────────────────────────────────────

function loadSettings() {
  document.getElementById("settings-content").innerHTML = `
    <div class="settings-card">
      <div class="settings-card-title">Compte</div>
      <div class="form-group"><label class="form-label">Session</label><input class="form-input" value="${escapeHtml(sessionToken || "N/A")}" readonly></div>
      <div class="form-group"><label class="form-label">Control Server</label><input class="form-input" value="http://${window.location.hostname}:3002" readonly></div>
    </div>
    <div class="settings-card">
      <div class="settings-card-title">À propos</div>
      <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6;">
        Shadow Broker AI Dashboard — Version 2.0<br>212 outils · Multi-LLM · Agent Loop<br>Powered by OpenRouter, Groq, Gemini & HuggingFace
      </p>
    </div>`;
}

// ─── Logout ─────────────────────────────────────────────────────────────────

document.getElementById("logout-btn").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "GET" }); } catch {}
  localStorage.removeItem("sb_session");
  sessionToken = null;
  showScreen("login-screen");
});

// ─── Utils ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ─── Fortnite ───────────────────────────────────────────────────────────────

async function loadFortnite() {
  const content = document.getElementById("fortnite-content");
  try {
    const data = await controlApi("/api/fortnite/status");
    const connected = data.connected || false;
    const displayName = data.displayName || null;

    if (connected && displayName) {
      content.innerHTML = `
        <div class="fortnite-status-card connected">
          <div class="fortnite-status-header">
            <div class="fortnite-status-icon">🎮</div>
            <div>
              <div class="fortnite-status-title">Bot connecté</div>
              <div class="fortnite-status-name">${escapeHtml(displayName)}</div>
            </div>
            <div class="fortnite-status-badge">EN LIGNE</div>
          </div>
          <div class="fortnite-info-grid">
            <div class="fortnite-info-item">
              <div class="fortnite-info-icon">👥</div>
              <div class="fortnite-info-text">
                <div class="fortnite-info-label">Ajoute en ami</div>
                <div class="fortnite-info-value">${escapeHtml(displayName)}</div>
              </div>
            </div>
            <div class="fortnite-info-item">
              <div class="fortnite-info-icon">🎉</div>
              <div class="fortnite-info-text">
                <div class="fortnite-info-label">Party</div>
                <div class="fortnite-info-value">Accepte automatiquement</div>
              </div>
            </div>
            <div class="fortnite-info-item">
              <div class="fortnite-info-icon">👕</div>
              <div class="fortnite-info-text">
                <div class="fortnite-info-label">Skin</div>
                <div class="fortnite-info-value">/game bot-skin</div>
              </div>
            </div>
            <div class="fortnite-info-item">
              <div class="fortnite-info-icon">💃</div>
              <div class="fortnite-info-text">
                <div class="fortnite-info-label">Emote</div>
                <div class="fortnite-info-value">/game bot-emote</div>
              </div>
            </div>
          </div>
          <button class="btn-ghost" onclick="fortniteLogout()" style="margin-top: 1rem;">Déconnecter le bot</button>
        </div>`;
    } else {
      content.innerHTML = `
        <div class="fortnite-status-card disconnected">
          <div class="fortnite-status-header">
            <div class="fortnite-status-icon">⚠️</div>
            <div>
              <div class="fortnite-status-title">Bot non connecté</div>
              <div class="fortnite-status-name">Aucun compte Fortnite lié</div>
            </div>
            <div class="fortnite-status-badge offline">HORS LIGNE</div>
          </div>
          <div class="fortnite-login-section">
            <h3>Connecter un compte Fortnite</h3>
            <p class="fortnite-help">Obtenez un code d'autorisation sur le lien ci-dessous, puis collez-le ici :</p>
            <a href="https://www.epicgames.com/id/api/redirect?clientId=3446cd72694c4a4485d81b77adbb2141&responseType=code" target="_blank" class="fortnite-link">🔗 Obtenir un code Epic Games</a>
            <div class="fortnite-input-row">
              <input type="text" id="fortnite-auth-input" class="form-input" placeholder="Collez votre code d'autorisation ici..." style="flex:1;">
              <button class="btn-primary" onclick="fortniteLogin()">Connecter</button>
            </div>
          </div>
        </div>`;
    }
  } catch (err) {
    content.innerHTML = `
      <div class="fortnite-status-card disconnected">
        <div class="fortnite-status-header">
          <div class="fortnite-status-icon">⚠️</div>
          <div>
            <div class="fortnite-status-title">Erreur</div>
            <div class="fortnite-status-name">${escapeHtml(err.message)}</div>
          </div>
        </div>
        <div class="fortnite-login-section">
          <h3>Connecter un compte Fortnite</h3>
          <p class="fortnite-help">Obtenez un code d'autorisation sur le lien ci-dessous, puis collez-le ici :</p>
          <a href="https://www.epicgames.com/id/api/redirect?clientId=3446cd72694c4a4485d81b77adbb2141&responseType=code" target="_blank" class="fortnite-link">🔗 Obtenir un code Epic Games</a>
          <div class="fortnite-input-row">
            <input type="text" id="fortnite-auth-input" class="form-input" placeholder="Collez votre code d'autorisation ici..." style="flex:1;">
            <button class="btn-primary" onclick="fortniteLogin()">Connecter</button>
          </div>
        </div>
      </div>`;
  }
}

async function fortniteLogin() {
  const input = document.getElementById("fortnite-auth-input");
  if (!input || !input.value.trim()) {
    toast("Veuillez coller un code d'autorisation", true);
    return;
  }
  try {
    await controlApi("/api/fortnite/login", {
      method: "POST",
      body: JSON.stringify({ authCode: input.value.trim() }),
    });
    toast("Bot Fortnite connecté avec succès !");
    loadFortnite();
  } catch (err) {
    toast("Erreur: " + err.message, true);
  }
}

async function fortniteLogout() {
  try {
    await controlApi("/api/fortnite/logout", { method: "POST" });
    toast("Bot Fortnite déconnecté");
    loadFortnite();
  } catch (err) {
    toast("Erreur: " + err.message, true);
  }
}

init();
