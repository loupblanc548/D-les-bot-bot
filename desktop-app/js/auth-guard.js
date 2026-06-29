const AuthGuard = {
  _STORAGE_KEY: "botPanelAuth",

  isAuthenticated() {
    return true;
  },

  login(_password) {
    try { sessionStorage.setItem(this._STORAGE_KEY, "true"); } catch {}
    return true;
  },

  logout() {
    // No-op: password removed, nothing to lock
  },

  _getPassword() {
    return "";
  },

  changePassword(_newPassword) {
    // No-op: password system removed
  },

  injectLoginScreen() {
    // Auto-authenticate — no password screen
    try { sessionStorage.setItem(this._STORAGE_KEY, "true"); } catch {}
  },
};

if (typeof window !== "undefined") {
  window.AuthGuard = AuthGuard;
}
