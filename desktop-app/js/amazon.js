/* ═══════════════════════════════════════════════════════════════════════════
   amazon.js — Amazon monitoring tab logic
   ═══════════════════════════════════════════════════════════════════════════ */

const Amazon = {
  async refresh() {
    try {
      const data = await window.electronAPI.getAmazon();
      const keepaEl = document.getElementById("amazon-keepa-status");
      const keepaLabel = document.getElementById("amazon-keepa-label");
      const alertsCountEl = document.getElementById("amazon-alerts-count");
      const triggeredEl = document.getElementById("amazon-alerts-triggered");
      const alertsListEl = document.getElementById("amazon-alerts-list");

      if (keepaEl) keepaEl.textContent = data.keepaEnabled ? "✅ Actif" : "❌ Inactif";
      if (keepaLabel) keepaLabel.textContent = data.keepaEnabled ? "API configurée" : "Scraping fallback";
      if (alertsCountEl) alertsCountEl.textContent = data.activeAlerts || 0;
      if (triggeredEl) triggeredEl.textContent = data.triggeredAlerts || 0;

      if (alertsListEl && data.alertResults && data.alertResults.length > 0) {
        alertsListEl.innerHTML = data.alertResults.map((a) => {
          const status = a.triggered ? "🔥" : "⏳";
          const price = a.currentPrice !== null ? `$${a.currentPrice}` : "N/A";
          return `<div style="padding:8px;border-bottom:1px solid var(--border)">
            <span>${status}</span> <strong>${a.asin}</strong> — Cible: $${a.targetPrice} | Actuel: ${price}
          </div>`;
        }).join("");
      } else if (alertsListEl) {
        alertsListEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div>Aucune alerte active</div>';
      }
    } catch (err) {
      if (window.Notifications) Notifications.warning("Amazon: erreur de chargement");
    }
  },

  async trackPrice() {
    const asin = document.getElementById("amazon-asin-input")?.value?.trim();
    const domain = document.getElementById("amazon-domain-select")?.value || "com";
    const resultEl = document.getElementById("amazon-track-result");
    if (!asin) { if (window.Notifications) Notifications.warning("ASIN requis"); return; }
    if (resultEl) resultEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div>Chargement...</div>';
    try {
      const data = await window.electronAPI.amazonTrack(asin, domain);
      if (data.error) {
        if (resultEl) resultEl.innerHTML = `<div style="color:var(--danger)">❌ ${data.error}</div>`;
        return;
      }
      const price = data.currentPriceAmazon ?? data.currentPriceNew ?? "N/A";
      const title = data.title || "Unknown";
      if (resultEl) resultEl.innerHTML = `
        <div style="padding:12px;background:var(--bg-tertiary);border-radius:var(--radius-sm)">
          <div style="font-weight:600;margin-bottom:6px">${title}</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px">
            <span>💰 Prix Amazon: <strong>${price !== "N/A" ? "$" + price : "N/A"}</strong></span>
            <span>🆕 Prix neuf: <strong>${data.currentPriceNew ? "$" + data.currentPriceNew : "N/A"}</strong></span>
            <span>♻️ Prix occasion: <strong>${data.currentPriceUsed ? "$" + data.currentPriceUsed : "N/A"}</strong></span>
          </div>
          ${data.lowestAmazon ? `<div style="margin-top:6px;font-size:12px;color:var(--text-muted)">Plus bas: $${data.lowestAmazon} | Plus haut: $${data.highestAmazon || "N/A"}</div>` : ""}
        </div>`;
    } catch (err) {
      if (resultEl) resultEl.innerHTML = `<div style="color:var(--danger)">❌ ${err.message || "Erreur"}</div>`;
    }
  },

  async createAlert() {
    const asin = document.getElementById("amazon-alert-asin")?.value?.trim();
    const price = parseFloat(document.getElementById("amazon-alert-price")?.value || "0");
    if (!asin || !price) { if (window.Notifications) Notifications.warning("ASIN et prix requis"); return; }
    try {
      const data = await window.electronAPI.amazonAlert(asin, price);
      if (data.success) {
        if (window.Notifications) Notifications.success(`Alerte créée: ${asin} à $${price}`);
        this.refresh();
      } else {
        if (window.Notifications) Notifications.warning(data.error || "Erreur création alerte");
      }
    } catch (err) {
      if (window.Notifications) Notifications.warning("Erreur: " + (err.message || ""));
    }
  },

  async scanWishlist() {
    const url = document.getElementById("amazon-wishlist-url")?.value?.trim();
    const resultEl = document.getElementById("amazon-wishlist-result");
    if (!url) { if (window.Notifications) Notifications.warning("URL wishlist requise"); return; }
    if (resultEl) resultEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div>Scan en cours...</div>';
    try {
      const data = await window.electronAPI.amazonWishlist(url, "com");
      if (data.error) {
        if (resultEl) resultEl.innerHTML = `<div style="color:var(--danger)">❌ ${data.error}</div>`;
        return;
      }
      if (resultEl) {
        const items = (data.items || []).slice(0, 20);
        resultEl.innerHTML = `
          <div style="margin-bottom:8px;font-size:13px">${data.itemCount} articles trouvés</div>
          ${items.map((item) => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--border)">
              ${item.image ? `<img src="${item.image}" style="width:40px;height:40px;object-fit:cover;border-radius:4px">` : ""}
              <div style="flex:1">
                <div style="font-size:12px;font-weight:500">${item.title}</div>
                <div style="font-size:11px;color:var(--text-muted)">${item.price ? "$" + item.price : "Prix N/A"} ${item.inStock ? "✅" : "❌"}</div>
              </div>
            </div>
          `).join("")}`;
      }
    } catch (err) {
      if (resultEl) resultEl.innerHTML = `<div style="color:var(--danger)">❌ ${err.message || "Erreur"}</div>`;
    }
  },

  async loadDeals() {
    const domain = document.getElementById("amazon-deals-domain")?.value || "com";
    const listEl = document.getElementById("amazon-deals-list");
    if (listEl) listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div>Chargement...</div>';
    try {
      const data = await window.electronAPI.amazonDeals({ domain });
      if (data.error) {
        if (listEl) listEl.innerHTML = `<div style="color:var(--danger)">❌ ${data.error}</div>`;
        return;
      }
      const deals = (data.deals || []).slice(0, 15);
      if (listEl) {
        if (deals.length === 0) {
          listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🔥</div>Aucune offre trouvée</div>';
        } else {
          listEl.innerHTML = deals.map((d) => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--border)">
              ${d.image ? `<img src="${d.image}" style="width:40px;height:40px;object-fit:cover;border-radius:4px">` : ""}
              <div style="flex:1">
                <div style="font-size:12px;font-weight:500">${d.title}</div>
                <div style="font-size:11px;color:var(--text-muted)">${d.price ? "$" + d.price : ""} ${d.discount ? `(-${d.discount}%)` : ""}</div>
              </div>
              <a href="${d.url}" target="_blank" style="font-size:11px;color:var(--accent)">Voir →</a>
            </div>
          `).join("");
        }
      }
    } catch (err) {
      if (listEl) listEl.innerHTML = `<div style="color:var(--danger)">❌ ${err.message || "Erreur"}</div>`;
    }
  },
};

window.Amazon = Amazon;
