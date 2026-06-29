/* ═══════════════════════════════════════════════════════════════════════════
   studio.js — Creative Studio: AI-powered design tools
   ═══════════════════════════════════════════════════════════════════════════ */

const Studio = {
  _uploadedImage: null,
  _uploadedImageData: null,
  _extractedColors: [],
  _palette: [],
  _lastResultUrl: null,
  _lastSvgB64: null,

  init() {
    this._setupUpload();
    this._setupTools();
  },

  // ─── Image Upload ──────────────────────────────────────────────────────────

  _setupUpload() {
    const dropZone = document.getElementById("studio-dropzone");
    const fileInput = document.getElementById("studio-file-input");
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) this._loadImage(file);
    });

    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) this._loadImage(file);
    });
  },

  _loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this._uploadedImage = e.target.result;
      const preview = document.getElementById("studio-image-preview");
      if (preview) {
        preview.innerHTML = '<img src="' + this._uploadedImage + '" style="max-width:100%;max-height:300px;border-radius:var(--radius);object-fit:contain">';
      }
      // Extract pixel data for client-side tools
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const maxSize = 400;
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          const ratio = Math.min(maxSize / w, maxSize / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        this._uploadedImageData = ctx.getImageData(0, 0, w, h);
      };
      img.src = this._uploadedImage;
      Notifications.success("Image chargée");
    };
    reader.readAsDataURL(file);
  },

  // ─── Tool Setup ────────────────────────────────────────────────────────────

  _setupTools() {
    window.studioDownload = () => this._downloadLast();
    window.studioDownloadSVG = () => this._downloadLastSVG();
    // 1. Color Extraction
    window.studioExtractColors = () => this._extractColors();
    // 2. Palette Generation
    window.studioGeneratePalette = () => this._generatePalette();
    // 3. Font Matching
    window.studioFontMatch = () => this._fontMatch();
    // 4. Moodboarding
    window.studioMoodboard = () => this._moodboard();
    // 5. Background Removal
    window.studioRemoveBg = () => this._removeBackground();
    // 6. Raster to Vector
    window.studioVectorize = () => this._vectorize();
    // 7. Image Upscaling
    window.studioUpscale = () => this._upscale();
    // 8. Inpainting
    window.studioInpaint = () => this._inpaint();
    // 9. Outpainting
    window.studioOutpaint = () => this._outpaint();
    // 10. Prompt Expansion
    window.studioPromptExpand = () => this._promptExpand();
    // 11. Smart Resizing
    window.studioSmartResize = () => this._smartResize();
    // 12. Auto Layout
    window.studioAutoLayout = () => this._autoLayout();
    // 13. Mockup Engine
    window.studioMockup = () => this._mockup();
    // 14. Style Transfer
    window.studioStyleTransfer = () => this._styleTransfer();
    // 15. Contrast Checker
    window.studioContrastCheck = () => this._contrastCheck();
    // 16. Safe Zone Detection
    window.studioSafeZone = () => this._safeZone();
    // 17. Compliance Audit
    window.studioCompliance = () => this._complianceAudit();
  },

  // ─── 1. Color Extraction ──────────────────────────────────────────────────

  _extractColors() {
    if (!this._uploadedImageData) { Notifications.warning("Charge une image d'abord"); return; }
    const data = this._uploadedImageData.data;
    const colorMap = {};
    const step = 4 * 10; // Sample every 10th pixel

    for (let i = 0; i < data.length; i += step) {
      const r = Math.round(data[i] / 16) * 16;
      const g = Math.round(data[i + 1] / 16) * 16;
      const b = Math.round(data[i + 2] / 16) * 16;
      const a = data[i + 3];
      if (a < 128) continue;
      const key = r + "," + g + "," + b;
      colorMap[key] = (colorMap[key] || 0) + 1;
    }

    const sorted = Object.entries(colorMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    this._extractedColors = sorted.map(([key, count]) => {
      const [r, g, b] = key.split(",").map(Number);
      return { r, g, b, hex: this._rgbToHex(r, g, b), count };
    });

    const container = document.getElementById("studio-color-results");
    if (container) {
      container.innerHTML = '<div class="color-swatches">' + this._extractedColors.map((c) =>
        '<div class="color-swatch" style="background:' + c.hex + '" title="' + c.hex + '"><span class="color-hex">' + c.hex + '</span></div>'
      ).join("") + "</div>";
    }
    Notifications.success(this._extractedColors.length + " couleurs extraites");
  },

  // ─── 2. Palette Generation ─────────────────────────────────────────────────

  _generatePalette() {
    if (!this._extractedColors.length) { this._extractColors(); }
    if (!this._extractedColors.length) return;

    const base = this._extractedColors[0];
    const hsl = this._rgbToHsl(base.r, base.g, base.b);
    const harmonies = [
      { name: "Complémentaire", colors: this._complementary(hsl) },
      { name: "Triadique", colors: this._triadic(hsl) },
      { name: "Analogique", colors: this._analogous(hsl) },
      { name: "Monochromatique", colors: this._monochromatic(hsl) },
      { name: "Tétradique", colors: this._tetradic(hsl) },
    ];

    const container = document.getElementById("studio-palette-results");
    if (container) {
      container.innerHTML = harmonies.map((h) =>
        '<div class="palette-group"><div class="palette-name">' + h.name + '</div><div class="palette-colors">' +
        h.colors.map((c) => {
          const rgb = this._hslToRgb(c.h, c.s, c.l);
          const hex = this._rgbToHex(rgb.r, rgb.g, rgb.b);
          return '<div class="color-swatch sm" style="background:' + hex + '" title="' + hex + '"><span class="color-hex">' + hex + '</span></div>';
        }).join("") + '</div></div>'
      ).join("");
    }
    Notifications.success("5 palettes générées");
  },

  // ─── 3. Font Matching ──────────────────────────────────────────────────────

  _fontMatch() {
    if (!this._uploadedImage) { Notifications.warning("Charge une image d'abord"); return; }
    Notifications.info("Analyse typographique via Google Vision...");

    window.electronAPI.apiFetch("/api/studio/analyze", {
      method: "POST",
      body: JSON.stringify({ imageUrl: this._uploadedImage, mode: "text" })
    }).then((result) => {
      const container = document.getElementById("studio-font-results");
      if (!container) return;

      const fonts = this._matchFonts(result.text || "", result.labels || []);
      container.innerHTML = '<div class="font-results">' + fonts.map((f) =>
        '<div class="font-card"><span class="font-preview" style="font-family:' + f.family + ',sans-serif;font-size:24px">' + (result.text?.substring(0, 20) || "Aa") + '</span><div class="font-info"><strong>' + f.name + '</strong><span class="font-tags">' + f.tags.join(", ") + '</span><span class="font-confidence">Match: ' + f.confidence + '%</span></div></div>'
      ).join("") + "</div>";
      Notifications.success("Analyse terminée");
    }).catch(() => {
      // Fallback: show common font suggestions
      const container = document.getElementById("studio-font-results");
      if (container) {
        const suggestions = [
          { name: "Inter", family: "Inter", tags: ["Modern", "UI", "Sans-serif"], confidence: 85 },
          { name: "Playfair Display", family: "Playfair Display, serif", tags: ["Elegant", "Serif", "Display"], confidence: 72 },
          { name: "Montserrat", family: "Montserrat", tags: ["Geometric", "Clean", "Sans-serif"], confidence: 68 },
          { name: "Roboto Slab", family: "Roboto Slab, serif", tags: ["Readable", "Slab", "Serif"], confidence: 60 },
        ];
        container.innerHTML = '<div class="font-results">' + suggestions.map((f) =>
          '<div class="font-card"><span class="font-preview" style="font-family:' + f.family + ';font-size:24px">Aa Bb Cc</span><div class="font-info"><strong>' + f.name + '</strong><span class="font-tags">' + f.tags.join(", ") + '</span><span class="font-confidence">Suggestion: ' + f.confidence + '%</span></div></div>'
        ).join("") + "</div>";
      }
      Notifications.warning("Analyse IA indisponible — suggestions génériques affichées");
    });
  },

  _matchFonts(text, labels) {
    const hasText = text && text.length > 0;
    const isElegant = labels?.some((l) => /elegant|luxury|fashion|logo/i.test(l.description || ""));
    const isTech = labels?.some((l) => /technology|computer|screen|digital/i.test(l.description || ""));
    const isHandwritten = labels?.some((l) => /handwrit|sketch|draw|art/i.test(l.description || ""));

    const fonts = [];
    if (isElegant) fonts.push({ name: "Playfair Display", family: "'Playfair Display', serif", tags: ["Élégant", "Serif"], confidence: 90 });
    if (isTech) fonts.push({ name: "JetBrains Mono", family: "'JetBrains Mono', monospace", tags: ["Tech", "Mono"], confidence: 88 });
    if (isHandwritten) fonts.push({ name: "Caveat", family: "Caveat, cursive", tags: ["Manuscrit", "Cursive"], confidence: 85 });
    fonts.push({ name: "Inter", family: "Inter, sans-serif", tags: ["Moderne", "UI"], confidence: 75 });
    fonts.push({ name: "Montserrat", family: "Montserrat, sans-serif", tags: ["Géométrique", "Clean"], confidence: 70 });
    return fonts.slice(0, 4);
  },

  // ─── 4. Moodboarding ───────────────────────────────────────────────────────

  _moodboard() {
    const keyword = document.getElementById("studio-moodboard-keyword")?.value || "design inspiration";
    Notifications.info("Génération moodboard: " + keyword);

    const themes = {
      nature: ["🌿", "🍃", "🌸", "🏔️", "🌊", "🌅", "🦋", "🌵"],
      tech: ["💻", "⚙️", "🔧", "📱", "🖥️", "🔌", "💡", "🎛️"],
      fashion: ["👗", "👠", "💄", "🕶️", "👜", "💍", "🧥", "🎩"],
      food: ["🍔", "🍕", "🍣", "🍰", "☕", "🍷", "🥗", "🍫"],
      abstract: ["🎨", "✨", "🔮", "💫", "🦄", "🌈", "🎆", "🎭"],
    };

    const lowerKw = keyword.toLowerCase();
    let emojis = themes.abstract;
    if (/nature|vert|eco|bio|forest|plant/.test(lowerKw)) emojis = themes.nature;
    else if (/tech|digital|code|app|web|cyber/.test(lowerKw)) emojis = themes.tech;
    else if (/fashion|mode|style|luxe|couture/.test(lowerKw)) emojis = themes.fashion;
    else if (/food|cuisine|resto|cafe|repas/.test(lowerKw)) emojis = themes.food;

    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"];
    const container = document.getElementById("studio-moodboard-results");
    if (container) {
      let html = '<div class="moodboard-grid">';
      for (let i = 0; i < 8; i++) {
        html += '<div class="moodboard-cell" style="background:' + colors[i] + ';animation:slideIn 0.3s ease ' + (i * 0.08) + 's both"><span style="font-size:36px">' + emojis[i] + '</span><span style="font-size:10px;opacity:0.7;margin-top:4px">' + keyword + '</span></div>';
      }
      html += "</div>";
      container.innerHTML = html;
    }
    Notifications.success("Moodboard généré");
  },

  // ─── 5. Background Removal ─────────────────────────────────────────────────

  _removeBackground() {
    if (!this._uploadedImageData) { Notifications.warning("Charge une image d'abord"); return; }
    Notifications.info("Détourage en cours...");

    const imgData = this._uploadedImageData;
    const data = imgData.data;
    const w = imgData.width;
    const h = imgData.height;

    // Sample corner colors as potential background
    const corners = [
      this._getPixel(data, 0, 0, w),
      this._getPixel(data, w - 1, 0, w),
      this._getPixel(data, 0, h - 1, w),
      this._getPixel(data, w - 1, h - 1, w),
    ];

    // Average corner color = likely background
    const bgR = (corners[0].r + corners[1].r + corners[2].r + corners[3].r) / 4;
    const bgG = (corners[0].g + corners[1].g + corners[2].g + corners[3].g) / 4;
    const bgB = (corners[0].b + corners[1].b + corners[2].b + corners[3].b) / 4;

    const threshold = 50;
    for (let i = 0; i < data.length; i += 4) {
      const dr = data[i] - bgR;
      const dg = data[i + 1] - bgG;
      const db = data[i + 2] - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < threshold) {
        data[i + 3] = 0; // Make transparent
      } else if (dist < threshold + 30) {
        data[i + 3] = Math.round(255 * (dist - threshold) / 30); // Feather edge
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").putImageData(imgData, 0, 0);

    this._lastResultUrl = canvas.toDataURL();
    const container = document.getElementById("studio-bg-results");
    if (container) {
      container.innerHTML = '<div style="display:flex;gap:12px;align-items:center"><img src="' + this._lastResultUrl + '" style="max-width:300px;border-radius:var(--radius);background:repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 50% / 16px 16px"><button class="btn btn-sm btn-primary" onclick="studioDownload()">📥 Télécharger</button></div>';
    }
    Notifications.success("Arrière-plan supprimé");
  },

  // ─── 6. Raster to Vector ───────────────────────────────────────────────────

  _vectorize() {
    if (!this._uploadedImageData) { Notifications.warning("Charge une image d'abord"); return; }
    Notifications.info("Vectorisation en cours...");

    const imgData = this._uploadedImageData;
    const data = imgData.data;
    const w = imgData.width;
    const h = imgData.height;

    // Edge detection (Sobel)
    const edges = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const gx = -this._gray(data, idx - 4) - 2 * this._gray(data, idx + w * 4 - 4) - this._gray(data, idx + w * 4 * 2 - 4)
                   + this._gray(data, idx + 4) + 2 * this._gray(data, idx + w * 4 + 4) + this._gray(data, idx + w * 4 * 2 + 4);
        const gy = -this._gray(data, idx - w * 4) - 2 * this._gray(data, idx - 4) - this._gray(data, idx + 4)
                   + this._gray(data, idx + w * 4) + 2 * this._gray(data, idx + w * 4 - 4) + this._gray(data, idx + w * 4 + 4);
        const mag = Math.sqrt(gx * gx + gy * gy);
        if (mag > 100) edges.push({ x, y });
      }
    }

    // Generate SVG paths
    let svgPaths = "";
    const step = 3;
    for (let i = 0; i < edges.length; i += step) {
      const e = edges[i];
      if (i === 0) svgPaths += "M " + e.x + " " + e.y;
      else svgPaths += " L " + e.x + " " + e.y;
    }

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" style="max-width:300px;background:#fff;border-radius:var(--radius)"><path d="' + svgPaths + '" stroke="black" fill="none" stroke-width="1"/></svg>';
    this._lastSvgB64 = btoa(svg);
    const container = document.getElementById("studio-vector-results");
    if (container) {
      container.innerHTML = '<div style="display:flex;gap:12px;align-items:center">' + svg + '<div><p style="font-size:12px;color:var(--text-muted)">' + edges.length + ' points détectés</p><button class="btn btn-sm btn-primary" onclick="studioDownloadSVG()">📥 SVG</button></div></div>';
    }
    Notifications.success("Vectorisation: " + edges.length + " contours");
  },

  // ─── 7. Image Upscaling ────────────────────────────────────────────────────

  _upscale() {
    if (!this._uploadedImage) { Notifications.warning("Charge une image d'abord"); return; }
    const scale = parseInt(document.getElementById("studio-upscale-factor")?.value || "2");
    Notifications.info("Upscaling x" + scale + "...");

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const container = document.getElementById("studio-upscale-results");
      if (container) {
        this._lastResultUrl = canvas.toDataURL();
        container.innerHTML = '<div style="display:flex;gap:12px;align-items:center"><img src="' + this._lastResultUrl + '" style="max-width:300px;border-radius:var(--radius)"><div><p style="font-size:12px;color:var(--text-muted)">' + canvas.width + "x" + canvas.height + '</p><button class="btn btn-sm btn-primary" onclick="studioDownload()">📥 Télécharger</button></div></div>';
      }
      Notifications.success("Image upscaled: " + canvas.width + "x" + canvas.height);
    };
    img.src = this._uploadedImage;
  },

  // ─── 8. Inpainting ─────────────────────────────────────────────────────────

  _inpaint() {
    if (!this._uploadedImageData) { Notifications.warning("Charge une image d'abord"); return; }
    Notifications.info("Inpainting (correction)...");

    const imgData = this._uploadedImageData;
    const data = imgData.data;
    const w = imgData.width;
    const h = imgData.height;

    // Simple inpainting: detect damaged pixels (very bright/dark spots) and fill with neighbors
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const brightness = (r + g + b) / 3;
        if (brightness > 250 || brightness < 5) {
          // Damaged pixel — fill with average of neighbors
          let avgR = 0, avgG = 0, avgB = 0, count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nIdx = ((y + dy) * w + (x + dx)) * 4;
              const nBright = (data[nIdx] + data[nIdx + 1] + data[nIdx + 2]) / 3;
              if (nBright > 5 && nBright < 250) {
                avgR += data[nIdx];
                avgG += data[nIdx + 1];
                avgB += data[nIdx + 2];
                count++;
              }
            }
          }
          if (count > 0) {
            data[idx] = Math.round(avgR / count);
            data[idx + 1] = Math.round(avgG / count);
            data[idx + 2] = Math.round(avgB / count);
          }
        }
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").putImageData(imgData, 0, 0);

    this._lastResultUrl = canvas.toDataURL();
    const container = document.getElementById("studio-inpaint-results");
    if (container) {
      container.innerHTML = '<div style="display:flex;gap:12px"><img src="' + this._lastResultUrl + '" style="max-width:300px;border-radius:var(--radius)"><button class="btn btn-sm btn-primary" onclick="studioDownload()">📥 Télécharger</button></div>';
    }
    Notifications.success("Inpainting terminé");
  },

  // ─── 9. Outpainting ────────────────────────────────────────────────────────

  _outpaint() {
    if (!this._uploadedImage) { Notifications.warning("Charge une image d'abord"); return; }
    const direction = document.getElementById("studio-outpaint-dir")?.value || "all";
    const extend = 100;
    Notifications.info("Outpainting: " + direction + "...");

    const img = new Image();
    img.onload = () => {
      let offsetX = 0, offsetY = 0, newW = img.width, newH = img.height;
      if (direction === "all" || direction === "left") { offsetX += extend; newW += extend; }
      if (direction === "all" || direction === "right") { newW += extend; }
      if (direction === "all" || direction === "top") { offsetY += extend; newH += extend; }
      if (direction === "all" || direction === "bottom") { newH += extend; }

      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d");

      // Fill extended area with edge colors (mirror edge pixels)
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, newW, newH);
      ctx.drawImage(img, offsetX, offsetY);

      // Mirror edges for smoother extension
      if (direction === "all" || direction === "left") {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(img, -(offsetX + img.width), offsetY, extend, img.height);
        ctx.restore();
      }
      if (direction === "all" || direction === "right") {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(img, -(offsetX + img.width + extend), offsetY, extend, img.height);
        ctx.restore();
      }

      const container = document.getElementById("studio-outpaint-results");
      if (container) {
        this._lastResultUrl = canvas.toDataURL();
        container.innerHTML = '<div style="display:flex;gap:12px"><img src="' + this._lastResultUrl + '" style="max-width:300px;border-radius:var(--radius)"><button class="btn btn-sm btn-primary" onclick="studioDownload()">📥 Télécharger</button></div>';
      }
      Notifications.success("Outpainting terminé: " + newW + "x" + newH);
    };
    img.src = this._uploadedImage;
  },

  // ─── 10. Prompt Expansion ───────────────────────────────────────────────────

  _promptExpand() {
    const prompt = document.getElementById("studio-prompt-input")?.value;
    if (!prompt) { Notifications.warning("Entre un prompt d'abord"); return; }

    Notifications.info("Optimisation du prompt via IA...");

    window.electronAPI.apiFetch("/api/studio/prompt-expand", {
      method: "POST",
      body: JSON.stringify({ prompt })
    }).then((result) => {
      const container = document.getElementById("studio-prompt-results");
      if (container && result.expanded) {
        container.innerHTML = '<div class="prompt-result"><div class="prompt-original"><strong>Original:</strong> ' + Utils.escapeHtml(prompt) + '</div><div class="prompt-expanded"><strong>Optimisé:</strong> ' + Utils.escapeHtml(result.expanded) + '</div>' +
          (result.tags ? '<div class="prompt-tags">' + result.tags.map((t) => '<span class="tag">' + t + '</span>').join("") + '</div>' : '') + '</div>';
        Notifications.success("Prompt optimisé");
      }
    }).catch(() => {
      // Fallback: local expansion
      const expanded = this._localPromptExpand(prompt);
      const container = document.getElementById("studio-prompt-results");
      if (container) {
        container.innerHTML = '<div class="prompt-result"><div class="prompt-original"><strong>Original:</strong> ' + Utils.escapeHtml(prompt) + '</div><div class="prompt-expanded"><strong>Optimisé:</strong> ' + Utils.escapeHtml(expanded) + '</div></div>';
      }
      Notifications.warning("IA indisponible — expansion locale utilisée");
    });
  },

  _localPromptExpand(prompt) {
    const enhancements = [
      "highly detailed", "professional lighting", "8K resolution", "sharp focus",
      "vibrant colors", "balanced composition", "studio quality", "trending on artstation"
    ];
    const styleKeywords = ["cinematic", "dramatic lighting", "depth of field", "bokeh"];
    const qualityKeywords = ["ultra-detailed", "hyperrealistic", "photorealistic"];

    let expanded = prompt + ", " + qualityKeywords.join(", ") + ", " + enhancements.slice(0, 4).join(", ");
    if (prompt.length < 50) expanded += ", " + styleKeywords.join(", ");
    return expanded;
  },

  // ─── 11. Smart Resizing ────────────────────────────────────────────────────

  _smartResize() {
    if (!this._uploadedImage) { Notifications.warning("Charge une image d'abord"); return; }
    const format = document.getElementById("studio-resize-format")?.value || "1080x1080";
    const [targetW, targetH] = format.split("x").map(Number);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");

      // Smart fill background with edge color
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, targetW, targetH);

      // Calculate cover fit
      const scale = Math.max(targetW / img.width, targetH / img.height);
      const newW = img.width * scale;
      const newH = img.height * scale;
      const x = (targetW - newW) / 2;
      const y = (targetH - newH) / 2;

      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, x, y, newW, newH);

      const container = document.getElementById("studio-resize-results");
      if (container) {
        this._lastResultUrl = canvas.toDataURL();
        container.innerHTML = '<div style="display:flex;gap:12px"><img src="' + this._lastResultUrl + '" style="max-width:300px;border-radius:var(--radius)"><div><p style="font-size:12px;color:var(--text-muted)">' + targetW + "x" + targetH + '</p><button class="btn btn-sm btn-primary" onclick="studioDownload()">📥 Télécharger</button></div></div>';
      }
      Notifications.success("Redimensionné: " + targetW + "x" + targetH);
    };
    img.src = this._uploadedImage;
  },

  // ─── 12. Auto Layout ───────────────────────────────────────────────────────

  _autoLayout() {
    const text = document.getElementById("studio-layout-text")?.value || "Your Title Here";
    Notifications.info("Auto-layout en cours...");

    const layouts = [
      { name: "Centered", x: "50%", y: "50%", align: "center", fontSize: "48px", weight: "bold" },
      { name: "Top Left", x: "10%", y: "15%", align: "left", fontSize: "36px", weight: "600" },
      { name: "Bottom Bar", x: "50%", y: "90%", align: "center", fontSize: "28px", weight: "500" },
      { name: "Diagonal", x: "70%", y: "30%", align: "right", fontSize: "42px", weight: "bold" },
    ];

    const container = document.getElementById("studio-layout-results");
    if (container) {
      container.innerHTML = '<div class="layout-grid">' + layouts.map((l, i) =>
        '<div class="layout-preview" style="animation:slideIn 0.3s ease ' + (i * 0.1) + 's both"><div class="layout-canvas" style="position:relative;width:100%;height:120px;background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:var(--radius-sm);overflow:hidden"><div style="position:absolute;left:' + l.x + ";top:" + l.y + ";transform:translate(-50%,-50%);text-align:" + l.align + ';font-size:' + l.fontSize + ";font-weight:" + l.weight + ';color:#fff;white-space:nowrap">' + Utils.escapeHtml(text) + '</div></div><span class="layout-name">' + l.name + "</span></div>"
      ).join("") + "</div>";
    }
    Notifications.success("4 layouts générés");
  },

  // ─── 13. Mockup Engine ─────────────────────────────────────────────────────

  _mockup() {
    if (!this._uploadedImage) { Notifications.warning("Charge une image d'abord"); return; }
    const support = document.getElementById("studio-mockup-support")?.value || "phone";
    Notifications.info("Mockup: " + support + "...");

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext("2d");

      if (support === "phone") {
        // Phone mockup
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(250, 50, 300, 500);
        ctx.fillStyle = "#000";
        ctx.fillRect(270, 90, 260, 420);
        ctx.drawImage(img, 270, 90, 260, 420);
        // Notch
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(350, 50, 100, 25);
      } else if (support === "laptop") {
        ctx.fillStyle = "#333";
        ctx.fillRect(100, 80, 600, 350);
        ctx.fillStyle = "#111";
        ctx.fillRect(120, 100, 560, 310);
        ctx.drawImage(img, 120, 100, 560, 310);
        // Base
        ctx.fillStyle = "#222";
        ctx.fillRect(50, 430, 700, 20);
      } else if (support === "poster") {
        // Poster on wall
        ctx.fillStyle = "#e8e8e8";
        ctx.fillRect(0, 0, 800, 600);
        ctx.fillStyle = "#fff";
        ctx.fillRect(200, 50, 400, 500);
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 20;
        ctx.drawImage(img, 200, 50, 400, 500);
        ctx.shadowBlur = 0;
      } else if (support === "tshirt") {
        // T-shirt mockup
        ctx.fillStyle = "#f5f5f5";
        ctx.fillRect(0, 0, 800, 600);
        ctx.fillStyle = "#fff";
        // T-shirt shape
        ctx.beginPath();
        ctx.moveTo(300, 100);
        ctx.lineTo(350, 80);
        ctx.lineTo(450, 80);
        ctx.lineTo(500, 100);
        ctx.lineTo(550, 150);
        ctx.lineTo(520, 180);
        ctx.lineTo(500, 160);
        ctx.lineTo(500, 500);
        ctx.lineTo(300, 500);
        ctx.lineTo(300, 160);
        ctx.lineTo(280, 180);
        ctx.lineTo(250, 150);
        ctx.closePath();
        ctx.fill();
        ctx.drawImage(img, 320, 200, 160, 200);
      }

      const container = document.getElementById("studio-mockup-results");
      if (container) {
        this._lastResultUrl = canvas.toDataURL();
        container.innerHTML = '<div style="display:flex;gap:12px"><img src="' + this._lastResultUrl + '" style="max-width:400px;border-radius:var(--radius)"><button class="btn btn-sm btn-primary" onclick="studioDownload()">📥 Télécharger</button></div>';
      }
      Notifications.success("Mockup " + support + " généré");
    };
    img.src = this._uploadedImage;
  },

  // ─── 14. Style Transfer ────────────────────────────────────────────────────

  _styleTransfer() {
    if (!this._uploadedImage) { Notifications.warning("Charge une image d'abord"); return; }
    const style = document.getElementById("studio-style-select")?.value || "anime";
    Notifications.info("Style transfer: " + style + "...");

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      if (style === "anime") {
        // Posterize + boost saturation
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.round(data[i] / 64) * 64;
          data[i + 1] = Math.round(data[i + 1] / 64) * 64;
          data[i + 2] = Math.round(data[i + 2] / 64) * 64;
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] = Math.min(255, data[i] + (data[i] - avg) * 0.5);
          data[i + 1] = Math.min(255, data[i + 1] + (data[i + 1] - avg) * 0.5);
          data[i + 2] = Math.min(255, data[i + 2] + (data[i + 2] - avg) * 0.5);
        }
      } else if (style === "oil") {
        // Soft blur + contrast
        ctx.putImageData(imgData, 0, 0);
        ctx.filter = "blur(1px) contrast(1.3) saturate(1.4)";
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = "none";
        Notifications.success("Style " + style + " appliqué");
        const container = document.getElementById("studio-style-results");
        if (container) {
          this._lastResultUrl = canvas.toDataURL();
          container.innerHTML = '<div style="display:flex;gap:12px"><img src="' + this._lastResultUrl + '" style="max-width:300px;border-radius:var(--radius)"><button class="btn btn-sm btn-primary" onclick="studioDownload()">📥 Télécharger</button></div>';
        }
        return;
      } else if (style === "sketch") {
        // Edge detection + grayscale
        const w = canvas.width, h = canvas.height;
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
          const inv = 255 - gray;
          data[i] = data[i + 1] = data[i + 2] = inv;
        }
      } else if (style === "vintage") {
        // Sepia
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
          data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
          data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
        }
      } else if (style === "neon") {
        // Neon glow
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] * 1.5);
          data[i + 1] = Math.min(255, data[i + 1] * 0.8);
          data[i + 2] = Math.min(255, data[i + 2] * 1.8);
        }
      }

      ctx.putImageData(imgData, 0, 0);
      this._lastResultUrl = canvas.toDataURL();
      const container = document.getElementById("studio-style-results");
      if (container) {
        container.innerHTML = '<div style="display:flex;gap:12px"><img src="' + this._lastResultUrl + '" style="max-width:300px;border-radius:var(--radius)"><button class="btn btn-sm btn-primary" onclick="studioDownload()">📥 Télécharger</button></div>';
      }
      Notifications.success("Style " + style + " appliqué");
    };
    img.src = this._uploadedImage;
  },

  // ─── 15. Contrast Checker ──────────────────────────────────────────────────

  _contrastCheck() {
    const fg = document.getElementById("studio-contrast-fg")?.value || "#ffffff";
    const bg = document.getElementById("studio-contrast-bg")?.value || "#000000";

    const fgRgb = this._hexToRgb(fg);
    const bgRgb = this._hexToRgb(bg);
    const ratio = this._contrastRatio(fgRgb, bgRgb);

    const wcagAA = ratio >= 4.5 ? "PASS" : "FAIL";
    const wcagAALarge = ratio >= 3.0 ? "PASS" : "FAIL";
    const wcagAAA = ratio >= 7.0 ? "PASS" : "FAIL";

    const container = document.getElementById("studio-contrast-results");
    if (container) {
      container.innerHTML =
        '<div class="contrast-preview" style="background:' + bg + ";color:" + fg + ';padding:20px;border-radius:var(--radius);margin-bottom:12px;font-size:18px">Le rapide renard brun saute par-dessus le chien paresseux. 1234567890</div>' +
        '<div class="contrast-stats"><div class="contrast-stat ' + (ratio >= 4.5 ? "pass" : "fail") + '"><span class="contrast-label">Ratio</span><span class="contrast-value">' + ratio.toFixed(2) + ":1</span></div>" +
        '<div class="contrast-stat ' + (wcagAA === "PASS" ? "pass" : "fail") + '"><span class="contrast-label">WCAG AA</span><span class="contrast-value">' + wcagAA + "</span></div>" +
        '<div class="contrast-stat ' + (wcagAALarge === "PASS" ? "pass" : "fail") + '"><span class="contrast-label">WCAG AA Large</span><span class="contrast-value">' + wcagAALarge + "</span></div>" +
        '<div class="contrast-stat ' + (wcagAAA === "PASS" ? "pass" : "fail") + '"><span class="contrast-label">WCAG AAA</span><span class="contrast-value">' + wcagAAA + "</span></div></div>";
    }
    Notifications.success("Ratio: " + ratio.toFixed(2) + ":1 — AA: " + wcagAA);
  },

  // ─── 16. Safe Zone Detection ───────────────────────────────────────────────

  _safeZone() {
    if (!this._uploadedImage) { Notifications.warning("Charge une image d'abord"); return; }
    const format = document.getElementById("studio-safezone-format")?.value || "instagram";

    const zones = {
      instagram: { w: 1080, h: 1080, safe: 0.85, label: "Instagram 1:1" },
      story: { w: 1080, h: 1920, safe: 0.90, label: "Story 9:16" },
      twitter: { w: 1500, h: 500, safe: 0.80, label: "Twitter Banner 3:1" },
      youtube: { w: 1280, h: 720, safe: 0.85, label: "YouTube 16:9" },
    };
    const zone = zones[format] || zones.instagram;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = Math.round(400 * (zone.h / zone.w));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw safe zone overlay
      const margin = canvas.width * (1 - zone.safe) / 2;
      const safeW = canvas.width - margin * 2;
      const safeH = canvas.height - margin * 2;

      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(margin, margin, safeW, safeH);

      ctx.fillStyle = "rgba(0,255,0,0.05)";
      ctx.fillRect(margin, margin, safeW, safeH);

      // Danger zone labels
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,0,0,0.3)";
      ctx.fillRect(0, 0, canvas.width, margin);
      ctx.fillRect(0, canvas.height - margin, canvas.width, margin);
      ctx.fillRect(0, 0, margin, canvas.height);
      ctx.fillRect(canvas.width - margin, 0, margin, canvas.height);

      const container = document.getElementById("studio-safezone-results");
      if (container) {
        container.innerHTML = '<div style="display:flex;gap:12px;align-items:center"><img src="' + canvas.toDataURL() + '" style="max-width:350px;border-radius:var(--radius)"><div><p style="font-size:12px;color:var(--text-muted)">' + zone.label + "</p><p style=\"font-size:11px;color:var(--success)\">Zone verte = safe</p><p style=\"font-size:11px;color:var(--danger)\">Zone rouge = risquée</p></div></div>";
      }
      Notifications.success("Safe zone: " + zone.label);
    };
    img.src = this._uploadedImage;
  },

  // ─── 17. Compliance Audit ───────────────────────────────────────────────────

  _complianceAudit() {
    if (!this._uploadedImageData) { Notifications.warning("Charge une image d'abord"); return; }
    const brief = document.getElementById("studio-brief-input")?.value || "";
    Notifications.info("Audit de conformité...");

    const imgData = this._uploadedImageData;
    const data = imgData.data;
    const w = imgData.width;
    const h = imgData.height;

    // Analyze image properties
    let totalBrightness = 0, totalSat = 0, pixelCount = 0;
    const brightnessHist = new Array(5).fill(0);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const brightness = (r + g + b) / 3;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      totalBrightness += brightness;
      totalSat += sat;
      pixelCount++;
      brightnessHist[Math.floor(brightness / 51)]++;
    }

    const avgBrightness = totalBrightness / pixelCount;
    const avgSaturation = totalSat / pixelCount;
    const contrast = this._calculateContrast(data);

    const checks = [
      { name: "Résolution", status: w >= 800 ? "pass" : "warn", message: w + "x" + h + (w >= 800 ? " — Suffisant" : " — Faible, recommandé ≥800px") },
      { name: "Luminosité", status: avgBrightness > 40 && avgBrightness < 220 ? "pass" : "warn", message: "Moyenne: " + avgBrightness.toFixed(0) + "/255" },
      { name: "Saturation", status: avgSaturation > 0.15 ? "pass" : "warn", message: "Moyenne: " + (avgSaturation * 100).toFixed(0) + "%" },
      { name: "Contraste", status: contrast > 30 ? "pass" : "warn", message: "Niveau: " + contrast.toFixed(0) + (contrast > 30 ? " — Bon" : " — Faible") },
      { name: "Format carré", status: w === h ? "pass" : "info", message: w === h ? "Carré 1:1" : "Ratio: " + (w / h).toFixed(2) },
      { name: "Cohérence brief", status: brief.length > 10 ? "pass" : "info", message: brief.length > 10 ? "Brief fourni — vérification visuelle recommandée" : "Aucun brief fourni" },
    ];

    const passed = checks.filter((c) => c.status === "pass").length;
    const total = checks.length;
    const score = Math.round((passed / total) * 100);

    const container = document.getElementById("studio-compliance-results");
    if (container) {
      container.innerHTML =
        '<div class="audit-score ' + (score >= 70 ? "pass" : score >= 50 ? "warn" : "fail") + '"><span class="audit-score-value">' + score + "%</span><span class=\"audit-score-label\">Conformité</span></div>" +
        '<div class="audit-checks">' + checks.map((c) =>
          '<div class="audit-check ' + c.status + '"><span class="audit-icon">' + (c.status === "pass" ? "✓" : c.status === "warn" ? "⚠" : "ℹ") + '</span><div><strong>' + c.name + '</strong><span class="audit-msg">' + c.message + '</span></div></div>'
        ).join("") + "</div>";
    }
    Notifications.success("Audit: " + score + "% de conformité");
  },

  // ─── Utilities ─────────────────────────────────────────────────────────────

  _getPixel(data, x, y, w) {
    const idx = (y * w + x) * 4;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
  },

  _gray(data, idx) {
    return 0.3 * data[idx] + 0.59 * data[idx + 1] + 0.11 * data[idx + 2];
  },

  _rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  },

  _hexToRgb(hex) {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
  },

  _rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h * 360, s, l };
  },

  _hslToRgb(h, s, l) {
    h /= 360;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  },

  _complementary(hsl) {
    return [
      { h: hsl.h, s: hsl.s, l: hsl.l },
      { h: (hsl.h + 180) % 360, s: hsl.s, l: hsl.l },
      { h: hsl.h, s: hsl.s, l: Math.min(0.85, hsl.l + 0.2) },
      { h: (hsl.h + 180) % 360, s: hsl.s * 0.7, l: Math.max(0.15, hsl.l - 0.2) },
      { h: hsl.h, s: hsl.s * 0.5, l: 0.95 },
    ];
  },

  _triadic(hsl) {
    return [
      { h: hsl.h, s: hsl.s, l: hsl.l },
      { h: (hsl.h + 120) % 360, s: hsl.s, l: hsl.l },
      { h: (hsl.h + 240) % 360, s: hsl.s, l: hsl.l },
      { h: hsl.h, s: hsl.s * 0.6, l: Math.min(0.85, hsl.l + 0.15) },
      { h: (hsl.h + 120) % 360, s: hsl.s * 0.6, l: Math.max(0.15, hsl.l - 0.15) },
    ];
  },

  _analogous(hsl) {
    return [
      { h: (hsl.h - 60 + 360) % 360, s: hsl.s, l: hsl.l },
      { h: (hsl.h - 30 + 360) % 360, s: hsl.s, l: hsl.l },
      { h: hsl.h, s: hsl.s, l: hsl.l },
      { h: (hsl.h + 30) % 360, s: hsl.s, l: hsl.l },
      { h: (hsl.h + 60) % 360, s: hsl.s, l: hsl.l },
    ];
  },

  _monochromatic(hsl) {
    return [
      { h: hsl.h, s: hsl.s, l: 0.2 },
      { h: hsl.h, s: hsl.s, l: 0.4 },
      { h: hsl.h, s: hsl.s, l: hsl.l },
      { h: hsl.h, s: hsl.s, l: 0.7 },
      { h: hsl.h, s: hsl.s, l: 0.9 },
    ];
  },

  _tetradic(hsl) {
    return [
      { h: hsl.h, s: hsl.s, l: hsl.l },
      { h: (hsl.h + 90) % 360, s: hsl.s, l: hsl.l },
      { h: (hsl.h + 180) % 360, s: hsl.s, l: hsl.l },
      { h: (hsl.h + 270) % 360, s: hsl.s, l: hsl.l },
      { h: hsl.h, s: hsl.s * 0.5, l: 0.9 },
    ];
  },

  _contrastRatio(rgb1, rgb2) {
    const lum = (rgb) => {
      const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((c) =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      );
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const l1 = lum(rgb1);
    const l2 = lum(rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  },

  _calculateContrast(data) {
    let min = 255, max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (gray < min) min = gray;
      if (gray > max) max = gray;
    }
    return max - min;
  },

  _downloadLast() {
    if (!this._lastResultUrl) return;
    const a = document.createElement("a");
    a.href = this._lastResultUrl;
    a.download = "studio-output.png";
    a.click();
    Notifications.success("Téléchargé");
  },

  _downloadLastSVG() {
    if (!this._lastSvgB64) return;
    const svg = atob(this._lastSvgB64);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vectorized.svg";
    a.click();
    URL.revokeObjectURL(url);
    Notifications.success("SVG téléchargé");
  },

  _downloadCanvas(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
    Notifications.success("Téléchargé: " + filename);
  },

  _downloadSVG(b64) {
    const svg = atob(b64);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vectorized.svg";
    a.click();
    URL.revokeObjectURL(url);
    Notifications.success("SVG téléchargé");
  },
};
