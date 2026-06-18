// Facade de compatibilite : le module a ete refactorise en src/commands/security/.
// Ce fichier reexporte les symboles publics pour preserver les imports existants.

// Re-export explicite depuis le barrel du dossier (evite la resolution circulaire de export * from "./security.js")
export { commands, handleCommand } from "./security/core.js";
export { handleVerifButton } from "./security/verifButton.js";
export {
  startAntiRaidCacheSweeper,
  stopAntiRaidCacheSweeper,
  stopAntiPhishingCacheSweeper,
} from "./security/cache.js";
export {
  checkSuspiciousLinks,
  checkSuspiciousLinksDetailed,
  isAntiPhishingActive,
  isAntiRaidActive,
} from "./security/utils.js";
