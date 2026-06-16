"use strict";
// Point d'entrée public du module security.
// Réexporte les symboles utilisés par index.ts et les autres modules.
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAntiRaidActive = exports.isAntiPhishingActive = exports.checkSuspiciousLinksDetailed = exports.checkSuspiciousLinks = exports.stopAntiPhishingCacheSweeper = exports.stopAntiRaidCacheSweeper = exports.startAntiRaidCacheSweeper = exports.handleVerifButton = exports.handleCommand = exports.commands = void 0;
var core_1 = require("./core");
Object.defineProperty(exports, "commands", { enumerable: true, get: function () { return core_1.commands; } });
Object.defineProperty(exports, "handleCommand", { enumerable: true, get: function () { return core_1.handleCommand; } });
var verifButton_1 = require("./verifButton");
Object.defineProperty(exports, "handleVerifButton", { enumerable: true, get: function () { return verifButton_1.handleVerifButton; } });
var cache_1 = require("./cache");
Object.defineProperty(exports, "startAntiRaidCacheSweeper", { enumerable: true, get: function () { return cache_1.startAntiRaidCacheSweeper; } });
Object.defineProperty(exports, "stopAntiRaidCacheSweeper", { enumerable: true, get: function () { return cache_1.stopAntiRaidCacheSweeper; } });
Object.defineProperty(exports, "stopAntiPhishingCacheSweeper", { enumerable: true, get: function () { return cache_1.stopAntiPhishingCacheSweeper; } });
var utils_1 = require("./utils");
Object.defineProperty(exports, "checkSuspiciousLinks", { enumerable: true, get: function () { return utils_1.checkSuspiciousLinks; } });
Object.defineProperty(exports, "checkSuspiciousLinksDetailed", { enumerable: true, get: function () { return utils_1.checkSuspiciousLinksDetailed; } });
Object.defineProperty(exports, "isAntiPhishingActive", { enumerable: true, get: function () { return utils_1.isAntiPhishingActive; } });
Object.defineProperty(exports, "isAntiRaidActive", { enumerable: true, get: function () { return utils_1.isAntiRaidActive; } });
//# sourceMappingURL=index.js.map