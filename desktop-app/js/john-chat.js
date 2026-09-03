const JohnChat = {
  _busy: false,
  _pingTimer: null,

  init() {
    this.refreshPings();
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => this.refreshPings(), 15000);
  },

  async refreshPings() {
    const list = document.getElementById("john-ping-list");
    const empty = document.getElementById("john-ping-empty");
    if (!list || !window.electronAPI?.apiFetch) return;
    try {
      const data = await window.electronAPI.apiFetch("/api/mentions");
      const mentions = data?.mentions || data?.status?.mentions || [];
      list.innerHTML = "";
      if (!mentions.length) {
        if (empty) empty.style.display = "";
        return;
      }
      if (empty) empty.style.display = "none";
      for (const m of mentions.slice(0, 15)) {
        const li = document.createElement("li");
        const meta = document.createElement("div");
        meta.className = "ping-meta";
        const when = m.at ? new Date(m.at).toLocaleString("fr-FR") : "";
        const where = m.channelName ? "#" + m.channelName : "MP";
        meta.textContent = (m.userTag || "quelqu’un") + " · " + where + (when ? " · " + when : "");
        const body = document.createElement("div");
        body.textContent = m.content || "(sans texte)";
        li.appendChild(meta);
        li.appendChild(body);
        list.appendChild(li);
      }
    } catch {
      /* panel hors-ligne */
    }
  },

  clear() {
    const thread = document.getElementById("john-chat-thread");
    if (!thread) return;
    thread.innerHTML =
      '<div class="chat-bubble chat-bubble--john">Fil vidé. Reprends quand tu veux.</div>';
  },

  _add(role, text) {
    const thread = document.getElementById("john-chat-thread");
    if (!thread) return null;
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-bubble--" + role;
    bubble.textContent = text;
    thread.appendChild(bubble);
    thread.scrollTop = thread.scrollHeight;
    return bubble;
  },

  async send(event) {
    if (event) event.preventDefault();
    if (this._busy) return;
    const input = document.getElementById("john-chat-input");
    const message = (input?.value || "").trim();
    if (!message) return;
    input.value = "";
    this._add("me", message);
    const wait = this._add("john", "John réfléchit…");
    if (wait) wait.classList.add("chat-bubble--wait");
    this._busy = true;
    try {
      const useTools = document.getElementById("chat-use-tools")?.checked !== false;
      const data = await window.electronAPI.apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          sessionId: "panel-john",
          username: "Loup Blanc",
          tools: useTools,
        }),
      });
      if (wait) {
        wait.classList.remove("chat-bubble--wait");
        wait.textContent = data.response || data.error || "Pas de réponse.";
      }
    } catch (err) {
      if (wait) {
        wait.classList.remove("chat-bubble--wait");
        wait.textContent =
          "John n’est pas joignable depuis le panel. Vérifie l’URL VPS et le CONTROL_TOKEN dans Paramètres. (" +
          (err.message || "erreur") +
          ")";
      }
    } finally {
      this._busy = false;
      const thread = document.getElementById("john-chat-thread");
      if (thread) thread.scrollTop = thread.scrollHeight;
    }
  },
};

if (typeof window !== "undefined") window.JohnChat = JohnChat;
