// Point d'entrée public du module security.
// Réexporte les symboles utilisés par index.ts et les autres modules.

export { commands, handleCommand } from "./core";
export { handleVerifButton } from "./verifButton";

export {
  startAntiRaidCacheSweeper,
  stopAntiRaidCacheSweeper,
  stopAntiPhishingCacheSweeper,
} from "./cache";

export {
  checkSuspiciousLinks,
  checkSuspiciousLinksDetailed,
  isAntiPhishingActive,
  isAntiRaidActive,
} from "./utils";
