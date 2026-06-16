/* ═══════════════════════════════════════════════════════════════════════════
   store.js — Centralized state management
   ═══════════════════════════════════════════════════════════════════════════ */

const Store = {
  _state: {
    status: null,
    platforms: [],
    health: [],
    fortnite: null,
    logs: [],
    settings: {},
    wsConnected: false,
  },

  _listeners: {},

  get(key) {
    return this._state[key];
  },

  update(key, value) {
    const old = this._state[key];
    this._state[key] = value;
    if (this._listeners[key]) {
      this._listeners[key].forEach((fn) => fn(value, old));
    }
  },

  on(key, fn) {
    if (!this._listeners[key]) this._listeners[key] = [];
    this._listeners[key].push(fn);
    return () => {
      this._listeners[key] = this._listeners[key].filter((f) => f !== fn);
    };
  },

  addLog(entry) {
    const logs = this._state.logs;
    logs.push(entry);
    if (logs.length > 2000) logs.splice(0, logs.length - 2000);
    this.update("logs", [...logs]);
  },

  clearLogs() {
    this.update("logs", []);
  },

  setWsStatus(connected) {
    this.update("wsConnected", connected);
  },
};
