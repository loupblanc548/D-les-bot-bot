/**
 * toolkits/index.ts — Barrel export unifié pour tous les toolkits utils/
 *
 * Regroupe les 22 toolkits en 4 domaines:
 *  - security: crypto, forensics, pentest, security, securityAudit
 *  - data: amazon, cloudApi, codeDev, dataScience, data, gaming, health, math, science
 *  - network: geo, ip, net, network, osint
 *  - media: media, textNlp, utility, systemDevops
 */

// ─── Security ────────────────────────────────────────────────────────────────
export * as cryptoToolkit from "../cryptoToolkit.js";
export * as forensicsToolkit from "../forensicsToolkit.js";
export * as pentestToolkit from "../pentestToolkit.js";
export * as securityToolkit from "../securityToolkit.js";
export * as securityAuditToolkit from "../securityAuditToolkit.js";

// ─── Data ────────────────────────────────────────────────────────────────────
export * as amazonToolkit from "../amazonToolkit.js";
export * as cloudApiToolkit from "../cloudApiToolkit.js";
export * as codeDevToolkit from "../codeDevToolkit.js";
export * as dataScienceToolkit from "../dataScienceToolkit.js";
export * as dataToolkit from "../dataToolkit.js";
export * as gamingToolkit from "../gamingToolkit.js";
export * as healthToolkit from "../healthToolkit.js";
export * as mathToolkit from "../mathToolkit.js";
export * as scienceToolkit from "../scienceToolkit.js";

// ─── Network ─────────────────────────────────────────────────────────────────
export * as geoToolkit from "../geoToolkit.js";
export * as ipToolkit from "../ipToolkit.js";
export * as netToolkit from "../netToolkit.js";
export * as networkToolkit from "../networkToolkit.js";
export * as osintToolkit from "../osintToolkit.js";

// ─── Media & Utils ───────────────────────────────────────────────────────────
export * as mediaToolkit from "../mediaToolkit.js";
export * as textNlpToolkit from "../textNlpToolkit.js";
export * as utilityToolkit from "../utilityToolkit.js";
export * as systemDevopsToolkit from "../systemDevopsToolkit.js";

// ─── Design ──────────────────────────────────────────────────────────────────
export * as designTools from "../../services/designTools.js";
