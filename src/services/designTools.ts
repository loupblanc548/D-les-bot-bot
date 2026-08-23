/**
 * designTools.ts — Outils design pour l'agent IA
 *
 * Intègre 3 ressources design:
 * 1. Godly (godly.website) — galerie d'inspiration design
 * 2. Aceternity UI (ui.aceternity.com) — composants React/Tailwind
 * 3. Impeccable (impeccable.style) — audit design anti-AI-slop
 */

import logger from "../utils/logger.js";

// ─── 1. Godly (godly.website / godly.design) ─────────────────────────────────

/**
 * Récupère les derniers sites en vedette sur Godly pour inspiration design.
 */
export async function getGodlyInspiration(category?: string): Promise<string | null> {
  try {
    const url = category
      ? `https://godly.design/sites?category=${encodeURIComponent(category)}`
      : "https://godly.design/sites";
    const res = await fetch(url, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.error(`[DesignTools] Godly HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();
    // Extract site titles and URLs from the HTML
    const sites: string[] = [];
    const matches = html.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/g);
    for (const m of matches) {
      const href = m[1];
      const title = m[2].trim();
      if (title.length > 3 && !href.includes("godly.design") && !href.includes("twitter.com")) {
        sites.push(`• **${title}** — ${href}`);
      }
    }

    if (sites.length === 0) {
      // Fallback: extract from JSON embedded in page
      const jsonMatch = html.match(/"sites":\s*(\[.*?\])/s);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]) as Array<{ title: string; url: string }>;
          for (const s of parsed.slice(0, 10)) {
            sites.push(`• **${s.title}** — ${s.url}`);
          }
        } catch { logger.error("[Silent catch]"); }
      }
    }

    if (sites.length === 0) {
      return "Aucun site trouvé sur Godly pour cette catégorie.";
    }

    const header = category
      ? `🎨 Inspiration design Godly (${category}):`
      : "🎨 Derniers sites en vedette sur Godly:";

    return `${header}\n${sites.slice(0, 10).join("\n")}`;
  } catch (err) {
    logger.error("[DesignTools] Godly failed:", String(err));
    return null;
  }
}

// ─── 2. Aceternity UI (ui.aceternity.com) ────────────────────────────────────

const ACETERNITY_COMPONENTS: Record<
  string,
  { description: string; installCmd: string; url: string }
> = {
  "hero-sections": {
    description: "Sections hero modernes avec animations",
    installCmd: "npx aceternity-ui add hero-sections",
    url: "https://ui.aceternity.com/components/hero-sections",
  },
  "bento-grid": {
    description: "Grilles bento pour dashboards et landing pages",
    installCmd: "npx aceternity-ui add bento-grid",
    url: "https://ui.aceternity.com/components/bento-grid",
  },
  "feature-sections": {
    description: "Sections de features (bento, simple, cards)",
    installCmd: "npx aceternity-ui add feature-sections",
    url: "https://ui.aceternity.com/components/feature-sections",
  },
  backgrounds: {
    description: "Backgrounds créatifs (grid, dots, aurora, etc.)",
    installCmd: "npx aceternity-ui add backgrounds",
    url: "https://ui.aceternity.com/components/backgrounds",
  },
  "logo-clouds": {
    description: "Clouds de logos avec micro-interactions",
    installCmd: "npx aceternity-ui add logo-clouds",
    url: "https://ui.aceternity.com/components/logo-clouds",
  },
  shaders: {
    description: "Shaders réutilisables pour backgrounds",
    installCmd: "npx aceternity-ui add shaders",
    url: "https://ui.aceternity.com/components/shaders",
  },
  cards: {
    description: "Cartes animées (3D, glow, hover effects)",
    installCmd: "npx aceternity-ui add cards",
    url: "https://ui.aceternity.com/components/cards",
  },
  navbar: {
    description: "Navigation bars avec animations",
    installCmd: "npx aceternity-ui add navbar",
    url: "https://ui.aceternity.com/components/navbar",
  },
  footer: {
    description: "Footers modernes",
    installCmd: "npx aceternity-ui add footer",
    url: "https://ui.aceternity.com/components/footer",
  },
  testimonials: {
    description: "Sections témoignages avec animations",
    installCmd: "npx aceternity-ui add testimonials",
    url: "https://ui.aceternity.com/components/testimonials",
  },
  pricing: {
    description: "Sections pricing avec toggle mensuel/annuel",
    installCmd: "npx aceternity-ui add pricing",
    url: "https://ui.aceternity.com/components/pricing",
  },
  faq: {
    description: "Sections FAQ accordéon",
    installCmd: "npx aceternity-ui add faq",
    url: "https://ui.aceternity.com/components/faq",
  },
  cta: {
    description: "Call-to-action sections",
    installCmd: "npx aceternity-ui add cta",
    url: "https://ui.aceternity.com/components/cta",
  },
  tabs: {
    description: "Tabs animées",
    installCmd: "npx aceternity-ui add tabs",
    url: "https://ui.aceternity.com/components/tabs",
  },
  modal: {
    description: "Modals/dialogs animés",
    installCmd: "npx aceternity-ui add modal",
    url: "https://ui.aceternity.com/components/modal",
  },
};

/**
 * Liste les composants Aceternity UI disponibles ou donne la commande d'installation.
 */
export function getAceternityComponents(filter?: string): string {
  const entries = Object.entries(ACETERNITY_COMPONENTS);

  if (filter) {
    const lower = filter.toLowerCase();
    const filtered = entries.filter(
      ([name, info]) => name.includes(lower) || info.description.toLowerCase().includes(lower),
    );

    if (filtered.length === 0) {
      return `Aucun composant Aceternity trouvé pour "${filter}". Composants disponibles: ${entries.map(([n]) => n).join(", ")}`;
    }

    const lines = filtered.map(
      ([name, info]) =>
        `• **${name}**: ${info.description}\n  Install: \`${info.installCmd}\`\n  Doc: ${info.url}`,
    );

    return `🧩 Composants Aceternity UI pour "${filter}":\n\n${lines.join("\n\n")}`;
  }

  const lines = entries.map(([name, info]) => `• **${name}**: ${info.description}`);

  return `🧩 Composants Aceternity UI disponibles (${entries.length}):\n\n${lines.join("\n")}\n\n💡 Installation: \`npx aceternity-ui add <component>\`\n🔗 https://ui.aceternity.com/components`;
}

/**
 * Récupère la doc d'un composant Aceternity spécifique.
 */
export async function getAceternityComponentDoc(componentName: string): Promise<string | null> {
  const key = componentName.toLowerCase().replace(/\s+/g, "-");
  const info = ACETERNITY_COMPONENTS[key];

  if (!info) {
    return `Composant "${componentName}" non trouvé. Composants: ${Object.keys(ACETERNITY_COMPONENTS).join(", ")}`;
  }

  try {
    const res = await fetch(info.url, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Return metadata even if fetch fails
      return `🧩 **${componentName}**\n${info.description}\n\nInstall: \`${info.installCmd}\`\nDoc: ${info.url}`;
    }

    const html = await res.text();
    // Extract code blocks from the page
    const codeBlocks: string[] = [];
    const codeMatches = html.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g);
    for (const m of codeMatches) {
      const code = m[1].replace(/<[^>]+>/g, "").trim();
      if (code.length > 20 && code.length < 3000) {
        codeBlocks.push(code);
      }
    }

    const codeSection =
      codeBlocks.length > 0
        ? `\n\n**Exemple de code:**\n\`\`\`tsx\n${codeBlocks[0].slice(0, 1500)}\n\`\`\``
        : "";

    return `🧩 **${componentName}**\n${info.description}\n\nInstall: \`${info.installCmd}\`\nDoc: ${info.url}${codeSection}`;
  } catch (err) {
    logger.error("[DesignTools] Aceternity doc failed:", String(err));
    return `🧩 **${componentName}**\n${info.description}\n\nInstall: \`${info.installCmd}\`\nDoc: ${info.url}`;
  }
}

// ─── 3. Impeccable (impeccable.style) ────────────────────────────────────────

const IMPECCABLE_COMMANDS: Record<string, string> = {
  init: "Setup initial: crée PRODUCT.md et DESIGN.md, configure le contexte design",
  craft: "Flow complet: plan UX → build → itération visuelle",
  document: "Génère DESIGN.md depuis le code existant",
  extract: "Extrait composants et tokens réutilisables",
  shape: "Plan UX/UI avant de coder",
  critique: "Review design: hiérarchie, clarté, résonance émotionnelle",
  audit: "Checks qualité technique (a11y, perf, responsive)",
  polish: "Pass finale: alignement design system, prêt à shipper",
  bolder: "Amplifie un design ennuyeux",
  quieter: "Calme un design trop chargé",
  distill: "Strip to essence — minimalise",
  harden: "Error handling, i18n, edge cases",
  onboard: "First-run flows, empty states, activation",
  animate: "Ajoute du motion purposeful",
  colorize: "Introduit de la couleur stratégique",
  typeset: "Fix fonts, hiérarchie, sizing",
  layout: "Fix layout, spacing, rythme visuel",
  delight: "Ajoute des moments de joie",
  overdrive: "Effets techniquement extraordinaires",
  clarify: "Améliore le copy UX",
  adapt: "Adapte pour différents devices",
  optimize: "Améliore les performances",
  live: "Mode itération visuelle dans le browser",
};

/**
 * Liste les commandes Impeccable disponibles.
 */
export function listImpeccableCommands(): string {
  const lines = Object.entries(IMPECCABLE_COMMANDS).map(
    ([cmd, desc]) => `• \`/impeccable ${cmd}\` — ${desc}`,
  );
  return `🎨 Impeccable — 23 commandes design pour AI agents:\n\n${lines.join("\n")}\n\n💡 Install: \`npx impeccable install\`\n🔗 https://impeccable.style`;
}

/**
 * Génère un audit design basé sur les 59 règles déterministes d'Impeccable.
 * Version simplifiée sans dépendance npm — checke les anti-patterns courants.
 */
export function auditDesignForSlop(html: string): string {
  const issues: string[] = [];

  // ─── AI Slop detection (règles déterministes) ───

  // 1. Purple gradients (AI favorite)
  if (/purple|violet|indigo/i.test(html) && /gradient/i.test(html)) {
    issues.push(
      "⚠️ **Purple gradient détecté** — cliché AI, utiliser une couleur de marque à la place",
    );
  }

  // 2. Side-tab borders
  if (/border.*rounded.*left|border.*rounded.*right/i.test(html)) {
    issues.push("⚠️ **Side-tab borders** — pattern AI slop, éviter les bordures asymétriques");
  }

  // 3. Bounce easing
  if (/bounce|cubic-bezier.*0\.68.*-0\.55.*0\.265.*1\.55/i.test(html)) {
    issues.push("⚠️ **Bounce easing** — animation cliché, préférer ease-out");
  }

  // 4. Dark glows
  if (/glow|shadow.*dark|box-shadow.*rgba\(0/i.test(html)) {
    issues.push("⚠️ **Dark glow** — effet AI slop, utiliser des shadows subtiles");
  }

  // 5. Ghost cards (border-only, no background)
  if (/border.*solid.*1px.*rgba.*0\.1/i.test(html) && !/background/i.test(html)) {
    issues.push("⚠️ **Ghost cards** — cards sans background, ajouter un bg subtil");
  }

  // 6. Over-rounding
  if (/border-radius:\s*(2[0-9]|[3-9][0-9])px/i.test(html)) {
    issues.push("⚠️ **Over-rounding** — border-radius > 20px, trop arrondi");
  }

  // 7. Image-on-hover motion
  if (/hover.*scale|hover.*transform.*scale/i.test(html)) {
    issues.push("⚠️ **Image-on-hover scale** — motion cliché, préférer un changement subtil");
  }

  // ─── General design quality ───

  // 8. Line length
  if (/max-width:\s*(none|100%|unset)/i.test(html)) {
    issues.push("📏 **Line length** — pas de max-width sur le texte, viser 65-75 caractères");
  }

  // 9. Cramped padding
  if (/padding:\s*[0-3]px/i.test(html)) {
    issues.push("📏 **Cramped padding** — padding < 4px, trop serré");
  }

  // 10. Small touch targets
  if (/width:\s*(1[0-9]|20)px|height:\s*(1[0-9]|20)px/i.test(html)) {
    issues.push("📏 **Small touch target** — élément < 24px, minimum 44px pour mobile");
  }

  // 11. Skipped headings
  const headings = html.match(/<h[1-6]/gi) || [];
  const headingLevels = headings.map((h) => parseInt(h.match(/\d/)![0]));
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] > headingLevels[i - 1] + 1) {
      issues.push("📖 **Skipped heading** — niveau de titre sauté (ex: h1 → h3)");
      break;
    }
  }

  // 12. Missing alt text
  const imgs = html.match(/<img[^>]*>/gi) || [];
  const imgsWithoutAlt = imgs.filter((img) => !/alt=/i.test(img));
  if (imgsWithoutAlt.length > 0) {
    issues.push(`♿ **Missing alt text** — ${imgsWithoutAlt.length} image(s) sans attribut alt`);
  }

  if (issues.length === 0) {
    return "✅ **Audit design Impeccable** — Aucun anti-pattern détecté! Le design semble propre.\n\nPour un audit complet avec les 59 règles: `npx impeccable detect src`";
  }

  return `🔍 **Audit design Impeccable** — ${issues.length} problème(s) détecté(s):\n\n${issues.join("\n")}\n\n💡 Pour un audit complet: \`npx impeccable detect src\`\n🔗 https://impeccable.style`;
}
