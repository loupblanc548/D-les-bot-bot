const AuthGuard = {
  _STORAGE_KEY: "botPanelAuth",
  _DEFAULT_PASSWORD: "loupblanc",

  isAuthenticated() {
    try {
      return sessionStorage.getItem(this._STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  },

  login(password) {
    const savedPassword = this._getPassword();
    if (password === savedPassword) {
      try { sessionStorage.setItem(this._STORAGE_KEY, "true"); } catch {}
      return true;
    }
    return false;
  },

  logout() {
    try { sessionStorage.removeItem(this._STORAGE_KEY); } catch {}
    location.reload();
  },

  _getPassword() {
    try {
      var s = JSON.parse(localStorage.getItem("botSettings") || "{}");
      return s.panelPassword || this._DEFAULT_PASSWORD;
    } catch {
      return this._DEFAULT_PASSWORD;
    }
  },

  changePassword(newPassword) {
    try {
      var s = JSON.parse(localStorage.getItem("botSettings") || "{}");
      s.panelPassword = newPassword;
      localStorage.setItem("botSettings", JSON.stringify(s));
    } catch {}
  },

  injectLoginScreen() {
    if (this.isAuthenticated()) return;

    const overlay = document.createElement("div");
    overlay.id = "auth-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0", left: "0", right: "0", bottom: "0",
      background: "var(--bg-base, #0a0e1a)",
      zIndex: "99999",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: "20px",
    });

    overlay.innerHTML = `
      <div style="text-align:center">
        <div style="font-size:48px;margin-bottom:12px">🤖</div>
        <h2 style="color:var(--text,#fff);font-size:22px;margin:0 0 4px">Bot Control Panel</h2>
        <p style="color:var(--text-muted,#888);font-size:13px;margin:0">Entrez le mot de passe pour accéder au panneau</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;width:300px">
        <div style="position:relative">
          <input type="password" id="auth-password" placeholder="Mot de passe" autofocus
            style="width:100%;padding:12px 40px 12px 16px;background:var(--bg-tertiary,#1a1f2e);border:1px solid var(--border,#2a3142);border-radius:8px;color:var(--text,#fff);font-size:14px;outline:none;text-align:center">
          <span id="auth-toggle-eye" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:18px;user-select:none">👁</span>
        </div>
        <button id="auth-submit"
          style="padding:12px;background:var(--accent,#6366f1);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity 0.2s">
          🔓 Déverrouiller
        </button>
        <p id="auth-error" style="color:var(--danger,#ef4444);font-size:12px;text-align:center;display:none">Mot de passe incorrect</p>
      </div>
      <p style="color:var(--text-muted,#555);font-size:11px;position:absolute;bottom:20px">Mot de passe par défaut: loupblanc (modifiable dans Paramètres)</p>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    const input = document.getElementById("auth-password");
    const btn = document.getElementById("auth-submit");
    const error = document.getElementById("auth-error");

    const attempt = () => {
      const pw = input.value.trim();
      if (this.login(pw)) {
        overlay.style.animation = "fadeOut 0.3s ease forwards";
        setTimeout(() => {
          overlay.remove();
          document.body.style.overflow = "";
        }, 300);
      } else {
        error.style.display = "block";
        input.value = "";
        input.focus();
        input.style.borderColor = "var(--danger,#ef4444)";
        setTimeout(() => { input.style.borderColor = ""; error.style.display = "none"; }, 2000);
      }
    };

    btn.addEventListener("click", attempt);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });

    const eye = document.getElementById("auth-toggle-eye");
    if (eye) {
      eye.addEventListener("click", () => {
        if (input.type === "password") {
          input.type = "text";
          eye.textContent = "🙈";
        } else {
          input.type = "password";
          eye.textContent = "👁";
        }
      });
    }
  },
};

if (typeof window !== "undefined") {
  window.AuthGuard = AuthGuard;
}
