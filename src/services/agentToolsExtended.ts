/**
 * agentToolsExtended.ts — Tools supplémentaires pour l'agent IA
 *
 * Regroupe tous les tools gratuits (APIs sans clé) + tools Discord natifs
 * + tools exploitant les features existantes du bot.
 *
 * Importé et fusionné avec AGENT_TOOLS dans agentTools.ts
 */

import { ChannelType } from "discord.js";
import logger from "../utils/logger.js";
import { stripAllHtml } from "../utils/sanitizeHtml.js";
import { fetchRetry } from "../utils/fetchRetry.js";
import { checkUrlForSsrf } from "../utils/ssrfGuard.js";
import { translate as deeplTranslate } from "../utils/deepl.js";
import type { AgentToolDef, ToolCallResult, ToolContext } from "./agentTools.js";
import prisma from "../prisma.js";
import { SCREENSHOT_TOOL_DEF, handleScreenshotTool } from "./screenshotTool.js";
import {
  pingIP,
  tracerouteIP,
  portScanIP,
  checkHttpHeaders,
  checkSSL,
  fullIPReport,
  formatIPReport,
  validateTargetIP,
} from "../utils/ipToolkit.js";
import {
  dnsLookup,
  grabBanner,
  checkHttpMethods,
  checkDirectories,
  detectTech,
  testCors,
  validateEmail,
  decodeJwt,
  expandUrl,
  scoreSecurityHeaders,
} from "../utils/netToolkit.js";
import {
  crackHash,
  detectHashAlgorithm,
  detectSqli,
  detectXss,
  analyzePassword,
  enumerateSubdomains,
  testZoneTransfer,
  reverseIpLookup,
  calculateCidr,
  lookupMacVendor,
  checkHsts,
  detectWaf,
  parseRobotsTxt,
  parseSitemap,
  getHttpStatusInfo,
  getPortInfo,
} from "../utils/securityToolkit.js";
import {
  convertTimestamp,
  convertBase,
  generateUuids,
  testRegex,
  formatJson,
  minifyJson,
  textToBinary,
  binaryToText,
  textToHex,
  hexToText,
  textToMorse,
  morseToText,
  caesarCipher,
  rot13,
  generateHashes,
  generateLoremIpsum,
  convertColor,
} from "../utils/utilityToolkit.js";
import {
  runMetasploit,
  captureTraffic,
  runHydra,
  runSqlmap,
  searchExploit,
  runHashcat,
  runJohn,
  snmpWalk,
  runEnum4linux,
  runHarvester,
  runCrackMapExec,
  runWhatWeb,
  runGobuster,
  runNmapNse,
} from "../utils/pentestToolkit.js";
import {
  base64Encode,
  base64Decode,
  urlEncode,
  urlDecode,
  aesEncrypt,
  aesDecrypt,
  hashFile,
  getFileMetadata,
  scanPii,
  parseIocs,
  analyzeEntropy,
  hexDump,
  extractStrings,
  parsePeHeader,
  parseElfHeader,
  getApkInfo,
  checkDependencyVulns,
  detectSteganography,
} from "../utils/forensicsToolkit.js";
import {
  convertUnit,
  convertTemperature,
  evalMath,
  calculateStats,
  analyzeSentiment,
  detectLanguage,
  wordFrequency,
  convertCase,
  generateSlug,
  generateQrAscii,
  parseCron,
  generateIpRange,
  numberToWordsFr,
  generatePasswords,
  formatDataSize,
  textDiff,
} from "../utils/dataToolkit.js";
import {
  listModels as mcpListModels,
  getModel as mcpGetModel,
  getBenchmarks as mcpGetBenchmarks,
  getRankings as mcpGetRankings,
  chatSend as mcpChatSend,
  searchDocs as mcpSearchDocs,
  getCredits as mcpGetCredits,
} from "./openrouterMcp.js";

import { listUpcomingEvents, createCalendarEvent } from "./googleCalendar.js";
import {
  hashCrackDictionary,
  hashIdentifyAdvanced,
  generateHmac,
  aesDecrypt as cryptoAesDecrypt,
  rsaKeypairGenerate,
  rsaEncrypt,
  rsaDecrypt,
  pgpEncrypt,
  pgpDecrypt,
  stegoExtractLsb,
  stegoHideLsb,
  steganalysisZscore,
  xorCipher,
  frequencyAnalysis,
  randomTokenGenerator,
  certificateParse,
} from "../utils/cryptoToolkit.js";
import {
  smtpRelayTest,
  smtpEnumVrfy,
  ftpAnonymousCheck,
  smbEnumShares,
  smbVersionDetect,
  ldapEnum,
  kerberosUserEnum,
  rdpCheck,
  sshVersionScan,
  telnetBannerGrab,
  snmpWalk as netSnmpWalk,
  ntpMonlist,
  dnsZoneTransfer,
  dnsSubdomainBrute,
  dnsRebindingCheck,
  ipv6Scan,
  vlanHopTest,
  wifiDeauthDetect,
  arpPoisonDetect,
  networkMapGenerate,
} from "../utils/networkToolkit.js";
import {
  waybackMachineLookup,
  waybackDiff,
  crtshSearch,
  haveibeenpwnedCheck,
  dehashedSearch,
  hunterIoEmail,
  phoneNumberLookupFull,
  socialMediaChecker,
  gravatarLookup,
  githubDorksSearch,
  githubCommitHistory,
  googleDorksGenerator,
  googleCacheLookup,
  reverseImageSearch,
  exifExtractFull,
  metadataStrip,
  darkwebMonitor,
  leakedSourceSearch,
  bitcoinAddressAnalysis,
  ethereumContractVerify,
  domainWhoisHistory,
  reverseWhois,
  dnsHistoryPassive,
  breachParse,
  malwareSampleLookup,
} from "../utils/osintToolkit.js";
import {
  owaspZapScan,
  nucleiScan,
  ffufFuzz,
  wfuzzScan,
  wpscanFull,
  joomscan,
  droopescan,
  sslLabsGrade,
  securityHeadersFull,
  corsMisconfigCheck,
  openRedirectCheck,
  xssPayloadGenerator,
  sqliPayloadGenerator,
  commandInjectionTest,
  xxeVulnCheck,
  ssrfCheck,
  lfiRfiCheck,
  csrfTokenCheck,
  rateLimitCheck,
  dependencyAudit,
} from "../utils/securityAuditToolkit.js";
import {
  csvAnalyzer,
  jsonPathQuery,
  sqlQueryExplainer,
  dataAnonymizer,
  outlierDetector,
  correlationMatrix,
  histogramGenerator,
  scatterPlotGenerator,
  timeSeriesDecompose,
  movingAverageCalc,
  linearRegression,
  hypothesisTest,
  confidenceInterval,
  permutationGenerator,
  combinatoricsCalc,
} from "../utils/dataScienceToolkit.js";
import {
  matrixOperations,
  vectorCalculus,
  derivativeCalculator,
  integralCalculator,
  limitCalculator,
  seriesSumCalculator,
  primeFactorization,
  gcdLcmCalculator,
  modularArithmetic,
  probabilityDistribution,
  bayesTheorem,
  trigonometrySolver,
  complexNumberOps,
  polynomialSolver,
  numberBaseConvertAdvanced,
} from "../utils/mathToolkit.js";
import {
  textExtractEntities,
  textSummarizeAdvanced,
  textKeywordExtract,
  textReadabilityScore,
  textLanguageDetectAdvanced,
  textTransliterate,
  textPhoneticMatch,
  textStemLemmatize,
  textNgramGenerator,
  textRegexTester,
  textFuzzyMatch,
  textExtractEmails,
  textExtractUrls,
  textExtractIps,
  textExtractPhoneNumbers,
  textRedactPii,
  textMarkdownToPlain,
  textHtmlToMarkdown,
  textCsvToJson,
  textJsonToCsv,
} from "../utils/textNlpToolkit.js";
import {
  processMonitor,
  diskUsageAnalyzer,
  networkConnectionsList,
  firewallRulesAudit,
  cronJobsList,
  envVarsInspect,
  logTail,
  serviceStatusCheck,
  dockerPsAudit,
  dockerImageVulnScan,
  k8sPodInspect,
  nginxConfigCheck,
  apacheConfigCheck,
  sslCertExpiryCheck,
  dnsPropagationCheck,
  loadAverageMonitor,
  memoryLeakDetect,
  portKill,
  filePermissionAudit,
  sshKeyAudit,
} from "../utils/systemDevopsToolkit.js";
import {
  awsS3BucketCheck,
  awsIamAudit,
  awsSecurityGroupsAudit,
  azureAdEnum,
  gcpProjectEnum,
  cloudMetadataCheck,
  terraformValidate,
  terraformPlanDiff,
  kubernetesManifestValidate,
  dockerComposeValidate,
  apiSchemaDiff,
  graphqlIntrospectionCheck,
  apiRateLimitDiscover,
  webhookSignatureVerify,
  oauthFlowTest,
} from "../utils/cloudApiToolkit.js";
import {
  riotAccountLookup,
  lolMatchHistory,
  lolRankCheck,
  csgoStatsFetch,
  apexLegendsStats,
  rocketLeagueStats,
  osuUserStats,
  minecraftServerStatus,
  fortniteItemShop,
  epicGamesFreeGames,
  twitchStreamCheck,
  twitchClipCreate,
  spotifyTrackSearch,
  spotifyPlaylistAnalyze,
  boardgameGeekSearch,
} from "../utils/gamingToolkit.js";
import {
  physicsCalculator,
  ohmsLawCalc,
  wavelengthFrequency,
  radioactiveDecayCalc,
  unitConvertScientific,
  molarMassCalc,
  chemicalEquationBalancer,
  phCalculator,
  idealGasLaw,
  kinematicsCalc,
  opticsCalc,
  electricFieldCalc,
  thermalExpansionCalc,
  astronomicalDistance,
  radioactiveDecayCalc as radioactiveDecayCalc2,
} from "../utils/scienceToolkit.js";
import {
  geocodeReverse,
  timezoneConvertAdvanced,
  distanceMatrix,
  elevationLookup,
  countryBordering,
  currencyByCountry,
  languageByCountry,
  capitalLookup,
  isoCountryCode,
  sunriseSunsetAnywhere,
} from "../utils/geoToolkit.js";
import {
  waterIntakeCalc,
  heartRateZone,
  bodyFatPercentageCalc,
  idealWeightCalc,
  pregnancyDueDate,
  ovulationCalc,
  macroNutrientCalc,
  sleepQualityScore,
  stepToCalorie,
  hydrationTracker,
} from "../utils/healthToolkit.js";
import {
  codeComplexityAnalyzer,
  codeFormatBeautifier,
  codeMinifier,
  codeDiffUnified,
  codeLinterCheck,
  regexDebugger,
  apiEndpointTester,
  jsonSchemaValidate,
  yamlValidate,
  xmlToJson,
  sqlFormatBeautify,
  dockerfileLint,
  changelogGenerator,
  sqlFormatBeautify as sqlFormatBeautify2,
  dockerfileLint as dockerfileLint2,
} from "../utils/codeDevToolkit.js";
import {
  imageResizeCrop,
  imageFormatConvert,
  imageMetadataStrip,
  imageCollageCreate,
  audioConvert,
  audioExtractFromVideo,
  videoCompress,
  videoGifConvert,
  textToSpeechMulti,
  imageWatermarkAdd,
} from "../utils/mediaToolkit.js";
import {
  amazonWishlistScrape,
  amazonPriceTrack,
  amazonPriceHistory,
  amazonProductLookup,
  amazonCartMonitor,
  amazonPriceAlertCreate,
  amazonPriceAlertCheck,
  amazonPriceAlertDelete,
  amazonWishlistDiff,
  amazonDealSearch,
  amazonBestSellers,
  amazonCouponSearch,
  amazonSubscribeSaveCheck,
  amazonOrderHistory,
  amazonReviewSummary,
} from "../utils/amazonToolkit.js";

// ─── Cache partagé ────────────────────────────────────────────────────────────

const extCache = new Map<string, { data: string; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCache(key: string): string | null {
  const e = extCache.get(key);
  if (e && Date.now() - e.ts < CACHE_TTL) return e.data;
  return null;
}

function setCache(key: string, data: string): void {
  extCache.set(key, { data, ts: Date.now() });
  if (extCache.size > 80) {
    const oldest = extCache.keys().next().value;
    if (oldest) extCache.delete(oldest);
  }
}

// ─── Définitions des tools supplémentaires ────────────────────────────────────

export const EXTENDED_TOOLS: AgentToolDef[] = [
  // ── IP Toolkit ──
  {
    type: "function",
    function: {
      name: "ip_ping",
      description:
        "Ping ICMP une adresse IP pour vérifier si elle est en ligne et mesurer la latence.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP à pinger" },
          count: { type: "number", description: "Nombre de paquets (défaut: 4)" },
        },
        required: ["ip"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ip_traceroute",
      description: "Traceroute vers une adresse IP pour voir le chemin réseau et les hops.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP cible" },
          maxHops: { type: "number", description: "Nombre max de hops (défaut: 15)" },
        },
        required: ["ip"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ip_portscan",
      description: "Scan rapide des ports communs (TCP connect) sur une adresse IP. Sans nmap.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP à scanner" },
          ports: {
            type: "array",
            items: { type: "number" },
            description: "Ports spécifiques (défaut: ports communs)",
          },
        },
        required: ["ip"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ip_http_check",
      description: "Récupère les headers HTTP d'une IP et vérifie les security headers.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP" },
          port: { type: "number", description: "Port (défaut: 80)" },
          useSSL: { type: "boolean", description: "Utiliser HTTPS (défaut: false)" },
        },
        required: ["ip"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ip_ssl_check",
      description: "Vérifie le certificat SSL/TLS d'une IP sur le port 443.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP" },
          port: { type: "number", description: "Port (défaut: 443)" },
        },
        required: ["ip"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ip_full_report",
      description:
        "Rapport complet sur une IP: ping, port scan, HTTP, HTTPS, SSL. Combine tous les outils.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP à analyser" },
        },
        required: ["ip"],
      },
    },
  },
  // ── Net Toolkit ──
  {
    type: "function",
    function: {
      name: "dns_lookup",
      description: "Résolution DNS complète: A, AAAA, MX, TXT, CNAME, NS records.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domaine à résoudre" },
          types: {
            type: "array",
            items: { type: "string" },
            description: "Types de records (défaut: tous)",
          },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "banner_grab",
      description: "Banner grabbing sur un port TCP — identifie le service (SSH, FTP, HTTP, etc.).",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP" },
          port: { type: "number", description: "Port TCP" },
        },
        required: ["ip", "port"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "http_methods_check",
      description: "Énumère les méthodes HTTP autorisées (GET, POST, PUT, DELETE, TRACE, etc.).",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL à tester" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "directory_check",
      description:
        "Vérifie l'existence de chemins communs (/admin, /.env, /api, etc.) sur un site web.",
      parameters: {
        type: "object",
        properties: {
          baseUrl: { type: "string", description: "URL de base (ex: https://example.com)" },
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Chemins spécifiques (défaut: liste commune)",
          },
        },
        required: ["baseUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tech_detect",
      description:
        "Détecte la stack technique d'un site (Nginx, Apache, Express, PHP, ASP.NET, Cloudflare, etc.).",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL à analyser" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cors_test",
      description:
        "Teste la configuration CORS d'un site — détecte les origines permissives et les credentials.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL à tester" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "email_validate",
      description: "Valide un email: MX, SPF, DKIM, DMARC. Vérifie la configuration du domaine.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Adresse email à valider" },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "jwt_decode",
      description:
        "Décode et analyse un token JWT: header, payload, algorithme, expiration, issuer.",
      parameters: {
        type: "object",
        properties: {
          token: { type: "string", description: "Token JWT à décoder" },
        },
        required: ["token"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "url_expand",
      description:
        "Suit les redirects d'une URL jusqu'à la destination finale. Détecte les shorteners.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL à expansionner" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "security_score",
      description: "Note la sécurité HTTP d'un site (A+ à F) — HSTS, CSP, X-Frame-Options, etc.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL à scorer" },
        },
        required: ["url"],
      },
    },
  },
  // ── Security Toolkit ──
  {
    type: "function",
    function: {
      name: "hash_crack",
      description: "Tente de cracker un hash (MD5/SHA1/SHA256) par attaque dictionnaire.",
      parameters: {
        type: "object",
        properties: {
          hash: { type: "string", description: "Hash à cracker" },
        },
        required: ["hash"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sqli_detect",
      description: "Détecte les patterns d'injection SQL dans une chaîne.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Chaîne à analyser" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "xss_detect",
      description: "Détecte les patterns XSS dans une chaîne.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Chaîne à analyser" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "password_analyze",
      description:
        "Analyse la force d'un mot de passe: entropie, charset, temps de crack, patterns.",
      parameters: {
        type: "object",
        properties: {
          password: { type: "string", description: "Mot de passe à analyser" },
        },
        required: ["password"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "subdomain_enum",
      description:
        "Énumère les sous-domaines d'un domaine via DNS brute-force (90+ sous-domaines communs).",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domaine cible" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reverse_ip",
      description: "Reverse DNS lookup — résout une IP en nom d'hôte.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP" },
        },
        required: ["ip"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cidr_calc",
      description: "Calculateur CIDR — réseau, broadcast, masque, plage d'hôtes.",
      parameters: {
        type: "object",
        properties: {
          cidr: { type: "string", description: "Notation CIDR (ex: 192.168.1.0/24)" },
        },
        required: ["cidr"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mac_vendor",
      description: "Identifie le fabricant d'une adresse MAC (lookup OUI).",
      parameters: {
        type: "object",
        properties: {
          mac: { type: "string", description: "Adresse MAC" },
        },
        required: ["mac"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hsts_check",
      description: "Vérifie le HSTS preload d'un domaine (max-age, includeSubDomains, preload).",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domaine à vérifier" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "waf_detect",
      description: "Détecte la présence d'un WAF (Cloudflare, Akamai, Imperva, Sucuri, F5, etc.).",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL à tester" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "robots_parse",
      description: "Parse le robots.txt d'un site — règles, sitemaps, crawl-delay.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL de base du site" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sitemap_parse",
      description: "Parse le sitemap.xml d'un site — liste toutes les URLs.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL de base du site" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "http_status_ref",
      description: "Référence des codes HTTP (1xx-5xx) avec description.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "number", description: "Code HTTP (ex: 404)" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "port_ref",
      description: "Référence des ports communs avec service et description.",
      parameters: {
        type: "object",
        properties: {
          port: { type: "number", description: "Numéro de port (ex: 22)" },
        },
        required: ["port"],
      },
    },
  },
  // ── Utility Toolkit ──
  {
    type: "function",
    function: {
      name: "timestamp_convert",
      description: "Convertit un timestamp Unix ↔ date lisible (ISO, UTC, local, relatif).",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Timestamp Unix ou date ISO" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "base_convert",
      description: "Convertit un nombre entre bases (binaire, octal, décimal, hexadécimal).",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Nombre à convertir" },
          fromBase: { type: "number", description: "Base source (2, 8, 10, 16)" },
        },
        required: ["input", "fromBase"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "uuid_gen",
      description: "Génère des UUID v4 ou v7.",
      parameters: {
        type: "object",
        properties: {
          count: { type: "number", description: "Nombre d'UUIDs (défaut: 1)" },
          version: { type: "number", description: "Version (4 ou 7, défaut: 4)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "regex_test",
      description: "Teste une regex contre une chaîne et retourne les matches.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Pattern regex" },
          flags: { type: "string", description: "Flags (ex: gi)" },
          testString: { type: "string", description: "Chaîne de test" },
        },
        required: ["pattern", "testString"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "json_format",
      description: "Formate ou minifie du JSON.",
      parameters: {
        type: "object",
        properties: {
          json: { type: "string", description: "JSON à formater" },
          minify: { type: "boolean", description: "Minifier au lieu de formater (défaut: false)" },
        },
        required: ["json"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "binary_convert",
      description: "Convertit texte ↔ binaire.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Texte ou binaire à convertir" },
          mode: { type: "string", description: "encode ou decode" },
        },
        required: ["input", "mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hex_convert",
      description: "Convertit texte ↔ hexadécimal.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Texte ou hex à convertir" },
          mode: { type: "string", description: "encode ou decode" },
        },
        required: ["input", "mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "morse_code",
      description: "Encode ou décode du code Morse.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Texte ou Morse à convertir" },
          mode: { type: "string", description: "encode ou decode" },
        },
        required: ["input", "mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "caesar_cipher",
      description: "Chiffre ou déchiffre avec le chiffre de César.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à chiffrer" },
          shift: { type: "number", description: "Décalage (ex: 3, -3 pour déchiffrer)" },
        },
        required: ["text", "shift"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rot13",
      description: "Applique ROT13 à un texte.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à transformer" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hash_gen",
      description: "Génère MD5, SHA1, SHA256, SHA512 d'une chaîne.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Chaîne à hasher" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lorem_gen",
      description: "Génère du texte Lorem Ipsum.",
      parameters: {
        type: "object",
        properties: {
          paragraphs: { type: "number", description: "Nombre de paragraphes (défaut: 1)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "color_convert",
      description: "Convertit une couleur entre HEX, RGB et HSL.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Couleur (ex: #ff5733 ou rgb(255,87,51))" },
        },
        required: ["input"],
      },
    },
  },
  // ── Pentest Toolkit (Kali Docker) ──
  {
    type: "function",
    function: {
      name: "metasploit",
      description:
        "Exécute un module Metasploit dans le conteneur Kali. ⚠️ HAUT RISQUE — requiert validation admin. Types: auxiliary, exploit, post.",
      parameters: {
        type: "object",
        properties: {
          moduleType: { type: "string", description: "Type de module (auxiliary, exploit, post)" },
          moduleName: { type: "string", description: "Nom du module (ex: scanner/portscan/tcp)" },
          target: { type: "string", description: "IP cible (doit être dans la whitelist)" },
          options: { type: "object", description: "Options supplémentaires (ex: {PORTS: '22'})" },
        },
        required: ["moduleType", "moduleName", "target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tshark_capture",
      description:
        "Capture le trafic réseau avec tshark (Wireshark CLI) dans Kali. Analyse les protocoles et top talkers.",
      parameters: {
        type: "object",
        properties: {
          interface: { type: "string", description: "Interface réseau (ex: eth0)" },
          duration: { type: "number", description: "Durée de capture en secondes (défaut: 10)" },
          filter: { type: "string", description: "Filtre BPF (ex: 'tcp port 80')" },
        },
        required: ["interface"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hydra_brute",
      description:
        "Brute force authentification via Hydra (SSH, FTP, HTTP, SMB...). ⚠️ HAUT RISQUE — validation admin requise.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "IP/hostname cible (whitelist)" },
          service: { type: "string", description: "Service (ssh, ftp, http-get, smb, etc.)" },
          userlist: {
            type: "string",
            description: "Fichier liste utilisateurs (défaut: metasploit)",
          },
          passlist: {
            type: "string",
            description: "Fichier liste mots de passe (défaut: rockyou)",
          },
        },
        required: ["target", "service"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sqlmap_scan",
      description:
        "Test d'injection SQL automatisé via SQLmap. ⚠️ HAUT RISQUE — validation admin requise.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL à tester (ex: http://localhost/page?id=1)" },
          data: { type: "string", description: "Données POST (ex: 'user=test&pass=test')" },
          cookie: { type: "string", description: "Cookie de session" },
          level: { type: "number", description: "Niveau (1-5, défaut: 1)" },
          risk: { type: "number", description: "Risque (1-3, défaut: 1)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchsploit",
      description: "Recherche d'exploits dans la base ExploitDB. Lecture seule, sans danger.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Terme de recherche (ex: 'apache 2.4 rce')" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hashcat_crack",
      description:
        "Crack de hash via Hashcat (MD5, SHA1, SHA256, etc.). ⚠️ Utilise CPU/GPU dans le conteneur Kali.",
      parameters: {
        type: "object",
        properties: {
          hash: { type: "string", description: "Hash à cracker" },
          mode: { type: "number", description: "Mode hashcat (0=MD5, 100=SHA1, 1400=SHA256)" },
          wordlist: { type: "string", description: "Wordlist (défaut: rockyou.txt)" },
        },
        required: ["hash"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "snmp_walk",
      description:
        "Énumération SNMP d'un équipement (Cisco, etc.). Récupère system info, interfaces, communauté.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "IP de l'équipement (whitelist)" },
          community: { type: "string", description: "Communauté SNMP (défaut: public)" },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enum4linux_scan",
      description: "Énumération SMB/Windows via enum4linux. Shares, users, groups, OS info.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "IP cible (whitelist)" },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "harvester_osint",
      description: "OSINT via theHarvester — emails, subdomains, IPs pour un domaine.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domaine à investiguer" },
          sources: { type: "string", description: "Sources (défaut: all)" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crackmapexec_scan",
      description:
        "Pentest SMB/WinRM/MSSQL/SSH via CrackMapExec. ⚠️ HAUT RISQUE — validation admin.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "IP ou plage CIDR (whitelist)" },
          service: { type: "string", description: "Service (smb, winrm, mssql, ssh, ldap)" },
          username: { type: "string", description: "Nom d'utilisateur" },
          password: { type: "string", description: "Mot de passe" },
        },
        required: ["target", "service"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "whatweb_scan",
      description: "Fingerprinting web via WhatWeb — technologies, CMS, frameworks, server.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL à analyser" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gobuster_scan",
      description: "Directory/file brute force via Gobuster. Découvre chemins cachés.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL de base (ex: http://localhost)" },
          wordlist: { type: "string", description: "Wordlist (défaut: dirb/common.txt)" },
          extensions: { type: "string", description: "Extensions (ex: php,html,txt)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nmap_nse_scan",
      description: "Scan Nmap avec scripts NSE (vuln detection, Cisco, SMB, etc.).",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "IP cible (whitelist)" },
          scriptCategory: {
            type: "string",
            description: "Catégorie NSE (default, vuln, brute, exploit)",
          },
          scripts: {
            type: "array",
            items: { type: "string" },
            description: "Scripts spécifiques (ex: smb-enum-shares)",
          },
        },
        required: ["target"],
      },
    },
  },
  // ── Forensics Toolkit ──
  {
    type: "function",
    function: {
      name: "base64_codec",
      description: "Encode ou décode en Base64.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Texte à encoder/décoder" },
          mode: { type: "string", description: "encode ou decode" },
        },
        required: ["input", "mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "url_codec",
      description: "Encode ou décode une URL (percent-encoding).",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Texte à encoder/décoder" },
          mode: { type: "string", description: "encode ou decode" },
        },
        required: ["input", "mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aes_crypto",
      description: "Chiffre ou déchiffre avec AES-256-GCM. Retourne ciphertext, IV, tag.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Texte clair ou ciphertext (hex)" },
          password: { type: "string", description: "Mot de passe" },
          mode: { type: "string", description: "encrypt ou decrypt" },
          iv: { type: "string", description: "IV hex (pour decrypt)" },
          tag: { type: "string", description: "Tag hex (pour decrypt)" },
        },
        required: ["input", "password", "mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "file_hash",
      description: "Calcule MD5, SHA1, SHA256 d'un fichier.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin du fichier" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "file_metadata",
      description: "Extrait les métadonnées d'un fichier (taille, type MIME, dates).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin du fichier" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pii_scan",
      description:
        "Scanne un texte pour détecter des PII (emails, téléphones, cartes de crédit, IBAN, clés API, JWT).",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Texte à analyser" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ioc_parse",
      description:
        "Extrait les IOC (Indicators of Compromise) d'un texte: IPs, hashes, domaines, URLs, emails.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Texte à analyser" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "entropy_analyze",
      description:
        "Analyse l'entropie de Shannon d'une chaîne — détecte si elle est chiffrée/compressée.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Chaîne à analyser" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hex_dump",
      description: "Génère un hex dump d'une chaîne (format xxd).",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Texte à dumper" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "string_extract",
      description: "Extrait les chaînes imprimables d'un texte binaire (forensique).",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Données binaires (texte)" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pe_header",
      description: "Parse l'en-tête d'un exécutable Windows (PE) — machine, sections, timestamp.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin du fichier .exe/.dll" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "elf_header",
      description: "Parse l'en-tête d'un exécutable Linux (ELF) — machine, type, sections.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin du fichier ELF" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apk_info",
      description: "Extrait les infos d'un APK Android (package, version, permissions).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin du fichier .apk" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dep_vuln_check",
      description: "Vérifie les patterns de vulnérabilités dans un package.json.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin du package.json" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stego_detect",
      description: "Détecte la stéganographie LSB dans une image BMP/PNG.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin du fichier image" },
        },
        required: ["path"],
      },
    },
  },
  // ── Data & Text Toolkit ──
  {
    type: "function",
    function: {
      name: "unit_convert",
      description:
        "Convertit entre unités (longueur, poids, données, vitesse). Pour la température, utilisez temp_convert.",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number", description: "Valeur à convertir" },
          fromUnit: { type: "string", description: "Unité source (ex: m, kg, KB)" },
          category: { type: "string", description: "Catégorie (length, weight, data, speed)" },
        },
        required: ["value", "fromUnit", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "temp_convert",
      description: "Convertit entre °C, °F, K.",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number", description: "Température" },
          from: { type: "string", description: "Unité source (C, F, K)" },
        },
        required: ["value", "from"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "math_eval",
      description: "Évalue une expression mathématique (sqrt, sin, cos, log, +, -, *, /, ^, %).",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Expression (ex: 2+2*3, sqrt(144), sin(pi/2))",
          },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stats_calc",
      description: "Calcule statistiques: mean, median, std, variance, min, max, quartiles.",
      parameters: {
        type: "object",
        properties: {
          values: { type: "array", items: { type: "number" }, description: "Liste de nombres" },
        },
        required: ["values"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sentiment_analyze",
      description: "Analyse le sentiment d'un texte (positif/négatif/neutre) en FR et EN.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à analyser" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "language_detect",
      description: "Détecte la langue d'un texte (FR, EN, ES, DE, IT, PT).",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à analyser" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "word_freq",
      description: "Analyse la fréquence des mots dans un texte.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à analyser" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "case_convert",
      description:
        "Convertit un texte entre camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, etc.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Texte à convertir" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "slug_gen",
      description: "Génère un slug URL-friendly à partir d'un texte.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Texte à slugifier" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "qr_gen",
      description: "Génère un QR code en ASCII art.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à encoder" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cron_parse",
      description: "Parse et explique une expression cron (min hour day month weekday).",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "Expression cron (ex: '0 2 * * *')" },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ip_range_gen",
      description: "Génère la liste d'IPs dans un range CIDR.",
      parameters: {
        type: "object",
        properties: {
          cidr: { type: "string", description: "CIDR (ex: 192.168.1.0/24)" },
        },
        required: ["cidr"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "num_to_words",
      description: "Convertit un nombre en mots (français).",
      parameters: {
        type: "object",
        properties: {
          number: { type: "number", description: "Nombre à convertir" },
        },
        required: ["number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "password_gen",
      description: "Génère des mots de passe aléatoires sécurisés.",
      parameters: {
        type: "object",
        properties: {
          count: { type: "number", description: "Nombre de passwords (défaut: 1)" },
          length: { type: "number", description: "Longueur (défaut: 16)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "data_size_format",
      description: "Formate une taille en bytes en format lisible (KB, MB, GB, KiB, MiB...).",
      parameters: {
        type: "object",
        properties: {
          bytes: { type: "number", description: "Taille en bytes" },
        },
        required: ["bytes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_diff",
      description:
        "Compare deux textes et affiche les différences (additions, deletions, similarity).",
      parameters: {
        type: "object",
        properties: {
          text1: { type: "string", description: "Premier texte" },
          text2: { type: "string", description: "Second texte" },
        },
        required: ["text1", "text2"],
      },
    },
  },
  // ── Fun & Entertainment ──
  {
    type: "function",
    function: {
      name: "getJoke",
      description: "Récupère une blague aléatoire en anglais. Gratuit, pas de clé API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getDadJoke",
      description: "Récupère un 'dad joke' aléatoire. Gratuit, pas de clé API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getAdvice",
      description: "Récupère un conseil aléatoire. Gratuit, pas de clé API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getQuote",
      description: "Récupère une citation inspirante aléatoire. Gratuit via ZenQuotes.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getTrivia",
      description: "Récupère une question trivia (culture générale). Gratuit via Open Trivia DB.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getMeme",
      description: "Récupère un meme aléatoire (image + texte). Gratuit via Imgflip.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getDogImage",
      description: "Récupère une photo aléatoire de chien. Gratuit via Dog API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getCatImage",
      description: "Récupère une photo aléatoire de chat. Gratuit via Cataas.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Info & Reference ──
  {
    type: "function",
    function: {
      name: "getCountryInfo",
      description:
        "Récupère infos sur un pays : capitale, population, drapeau, monnaie, langues. Gratuit via REST Countries.",
      parameters: {
        type: "object",
        properties: {
          country: { type: "string", description: "Nom du pays (ex: France, Japan, Brazil)" },
        },
        required: ["country"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCurrencyRate",
      description: "Convertit un montant entre deux devises. Gratuit via exchangerate.host.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Montant à convertir" },
          from: { type: "string", description: "Devise source (ex: EUR, USD, JPY)" },
          to: { type: "string", description: "Devise cible (ex: USD, EUR, GBP)" },
        },
        required: ["amount", "from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDateTime",
      description: "Récupère l'heure actuelle dans un timezone. Gratuit via WorldTimeAPI.",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "Timezone IANA (ex: Europe/Paris, America/New_York, Asia/Tokyo)",
          },
        },
        required: ["timezone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getIpInfo",
      description: "Géolocalise une adresse IP (pays, ville, FAI). Gratuit via ipapi.co.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP à géolocaliser (ex: 8.8.8.8)" },
        },
        required: ["ip"],
      },
    },
  },
  // ── Finance ──
  {
    type: "function",
    function: {
      name: "getStockPrice",
      description:
        "Récupère le prix d'une action boursière. Gratuit via Stooq (pas de clé). Ex: AAPL, TSLA, MSFT.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Symbole boursier (ex: AAPL, TSLA, MSFT, GOOGL)" },
        },
        required: ["symbol"],
      },
    },
  },
  // ── Social & Content ──
  {
    type: "function",
    function: {
      name: "getRedditPosts",
      description: "Récupère les top posts d'un subreddit. Gratuit (Reddit JSON API, pas de clé).",
      parameters: {
        type: "object",
        properties: {
          subreddit: {
            type: "string",
            description: "Nom du subreddit sans r/ (ex: gaming, programming)",
          },
          limit: { type: "number", description: "Nombre de posts (défaut 5, max 10)" },
        },
        required: ["subreddit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getUrbanDict",
      description: "Définit un terme d'argot via Urban Dictionary. Gratuit, pas de clé.",
      parameters: {
        type: "object",
        properties: {
          term: { type: "string", description: "Terme à définir" },
        },
        required: ["term"],
      },
    },
  },
  // ── Books & Science ──
  {
    type: "function",
    function: {
      name: "getBookInfo",
      description:
        "Recherche un livre par titre. Retourne auteur, description, couverture. Gratuit via Open Library.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Titre ou mots-clés du livre" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getNasaApod",
      description:
        "Récupère la NASA Astronomy Picture of the Day (photo + explication). Gratuit (clé demo NASA).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Gaming ──
  {
    type: "function",
    function: {
      name: "getPokemon",
      description: "Récupère infos sur un Pokémon : types, stats, capacités. Gratuit via PokéAPI.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Nom ou ID du Pokémon (ex: pikachu, charizard, 25)",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSteamGame",
      description:
        "Récupère infos sur un jeu Steam : prix, description, note. Gratuit via Steam Store API.",
      parameters: {
        type: "object",
        properties: {
          appid: {
            type: "number",
            description: "App ID Steam du jeu (ex: 1086940 pour Baldur's Gate 3)",
          },
        },
        required: ["appid"],
      },
    },
  },
  // ── Dev Tools ──
  {
    type: "function",
    function: {
      name: "getNpmPackage",
      description:
        "Récupère infos sur un paquet npm : version, description, téléchargements. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom du paquet npm (ex: discord.js, express)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPypiPackage",
      description: "Récupère infos sur un paquet Python PyPI : version, résumé, auteur. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom du paquet (ex: flask, requests, discord.py)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGithubUser",
      description: "Récupère le profil d'un utilisateur GitHub : repos, followers, bio. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Nom d'utilisateur GitHub" },
        },
        required: ["username"],
      },
    },
  },
  // ── Utilities ──
  {
    type: "function",
    function: {
      name: "shortenUrl",
      description: "Raccourcit une URL. Gratuit via is.gd (pas de clé).",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "L'URL à raccourcir" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getQrCode",
      description:
        "Génère un QR code pour un texte ou URL. Gratuit via QuickChart. Retourne une URL d'image.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte ou URL à encoder dans le QR code" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRandomUser",
      description:
        "Génère un profil utilisateur fictif (nom, email, avatar). Gratuit via RandomUser API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Gaming Advanced ──
  {
    type: "function",
    function: {
      name: "getSteamDeals",
      description:
        "Récupère les jeux en promo sur Steam (≥50% de réduction). Gratuit via Steam API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getGameNews",
      description: "Récupère les dernières news d'un jeu Steam via son App ID. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          appid: {
            type: "number",
            description: "Steam App ID (ex: 730 pour CS2, 1086940 pour BG3)",
          },
          count: { type: "number", description: "Nombre de news (défaut 5, max 20)" },
        },
        required: ["appid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSpeedrunRecord",
      description: "Récupère le record du monde speedrun d'un jeu. Gratuit via speedrun.com API.",
      parameters: {
        type: "object",
        properties: {
          game: {
            type: "string",
            description: "Nom du jeu ou abbreviation (ex: Portal, celeste, sm64)",
          },
        },
        required: ["game"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGameReleases",
      description: "Récupère les sorties de jeux à venir via IGDB. Nécessite une clé API.",
      parameters: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            description: "Plateforme (ex: pc, playstation, xbox, switch, all)",
          },
          count: { type: "number", description: "Nombre de résultats (défaut 10, max 20)" },
        },
        required: ["platform"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSteamPlayerCount",
      description: "Récupère le nombre de joueurs actuels sur un jeu Steam. Gratuit via Steam API.",
      parameters: {
        type: "object",
        properties: {
          appid: { type: "number", description: "Steam App ID" },
        },
        required: ["appid"],
      },
    },
  },
  // ── Utilities Advanced ──
  {
    type: "function",
    function: {
      name: "generatePassword",
      description:
        "Génère un mot de passe sécurisé aléatoire. Paramètres: longueur, symboles, nombres.",
      parameters: {
        type: "object",
        properties: {
          length: { type: "number", description: "Longueur du mot de passe (défaut 16, max 64)" },
          symbols: {
            type: "boolean",
            description: "Inclure des caractères spéciaux (défaut true)",
          },
          numbers: { type: "boolean", description: "Inclure des chiffres (défaut true)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "solveMath",
      description:
        "Résout une expression mathématique. Supporte +, -, *, /, ^, sqrt, sin, cos, tan, log, pi, e. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Expression mathématique (ex: 2+2*3, sqrt(144), sin(pi/2))",
          },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dnsLookup",
      description:
        "Résolution DNS d'un domaine (A, AAAA, MX, TXT, CNAME, NS). Gratuit via Cloudflare DNS.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domaine à résoudre (ex: google.com)" },
          type: {
            type: "string",
            description: "Type d'enregistrement (A, AAAA, MX, TXT, CNAME, NS, ALL)",
          },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getHttpStatus",
      description: "Vérifie le statut HTTP d'une URL (code, temps de réponse, headers). Gratuit.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL à vérifier (ex: https://google.com)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "testRegex",
      description: "Teste une expression régulière contre un texte. Retourne les matches. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Pattern regex (ex: \\d+ pour les nombres)" },
          text: { type: "string", description: "Texte à tester" },
          flags: {
            type: "string",
            description: "Flags regex (ex: gi pour global+insensible à la casse)",
          },
        },
        required: ["pattern", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convertUnits",
      description:
        "Convertit entre unités: longueur, poids, température, volume, vitesse, données. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number", description: "Valeur à convertir" },
          from: {
            type: "string",
            description: "Unité source (ex: km, mi, kg, lb, C, F, L, gal, MB, GB)",
          },
          to: {
            type: "string",
            description: "Unité cible (ex: mi, km, lb, kg, F, C, gal, L, GB, MB)",
          },
        },
        required: ["value", "from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getColorInfo",
      description: "Infos sur une couleur: conversion HEX/RGB/HSL, nom, complémentaire. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          color: {
            type: "string",
            description: "Couleur en HEX (ex: #FF5733) ou RGB (ex: 255,87,51)",
          },
        },
        required: ["color"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRandomFact",
      description:
        "Récupère un fait aléatoire intéressant (science, histoire, nature). Gratuit via Numbers API.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "Type de fait: math, trivia, date, year (défaut: trivia)",
          },
          number: { type: "number", description: "Nombre spécifique (optionnel, sinon aléatoire)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getHoroscope",
      description: "Horoscope du jour pour un signe du zodiaque. Gratuit via Horoscope API.",
      parameters: {
        type: "object",
        properties: {
          sign: {
            type: "string",
            description:
              "Signe du zodiaque (aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces)",
          },
        },
        required: ["sign"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getUvIndex",
      description: "Indice UV et météo pour une ville. Gratuit via Open-Meteo (pas de clé).",
      parameters: {
        type: "object",
        properties: {
          lat: { type: "number", description: "Latitude" },
          lon: { type: "number", description: "Longitude" },
        },
        required: ["lat", "lon"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGithubRepoInfo",
      description:
        "Infos détaillées sur un repo GitHub: stars, forks, issues, langages, dernière release. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Propriétaire du repo (ex: facebook)" },
          repo: { type: "string", description: "Nom du repo (ex: react)" },
        },
        required: ["owner", "repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCryptoInfo",
      description:
        "Infos détaillées sur une crypto: prix, market cap, volume, changement 24h. Gratuit via CoinGecko.",
      parameters: {
        type: "object",
        properties: {
          coin: {
            type: "string",
            description: "ID CoinGecko (ex: bitcoin, ethereum, solana) ou symbole (BTC, ETH)",
          },
        },
        required: ["coin"],
      },
    },
  },
  // ── Discord Native Tools ──
  {
    type: "function",
    function: {
      name: "kickUser",
      description: "Expulse un utilisateur du serveur. Action de modération sérieuse.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          reason: { type: "string", description: "Raison de l'expulsion" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "banUser",
      description: "Bannit un utilisateur du serveur. Action de modération maximale.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          reason: { type: "string", description: "Raison du bannissement" },
          deleteMessageDays: {
            type: "number",
            description: "Supprimer messages des N derniers jours (défaut 7)",
          },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "addRole",
      description: "Ajoute un rôle à un utilisateur sur ce serveur.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          roleId: { type: "string", description: "ID du rôle à ajouter" },
        },
        required: ["userId", "roleId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "removeRole",
      description: "Retire un rôle à un utilisateur sur ce serveur.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          roleId: { type: "string", description: "ID du rôle à retirer" },
        },
        required: ["userId", "roleId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createChannel",
      description: "Crée un nouveau salon textuel sur ce serveur.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom du salon (ex: general-chat)" },
          topic: { type: "string", description: "Topic/description du salon (optionnel)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteChannel",
      description: "Supprime un salon du serveur par son ID.",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID du salon à supprimer" },
        },
        required: ["channelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setChannelTopic",
      description: "Modifie le topic/description d'un salon.",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID du salon" },
          topic: { type: "string", description: "Nouveau topic" },
        },
        required: ["channelId", "topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createInvite",
      description:
        "Crée une invitation au serveur (ou à un salon spécifique). Retourne l'URL d'invitation.",
      parameters: {
        type: "object",
        properties: {
          channelId: {
            type: "string",
            description: "ID du salon pour l'invitation (défaut: salon actuel)",
          },
          maxAge: {
            type: "number",
            description: "Durée en secondes (défaut 86400 = 24h, 0 = permanent)",
          },
          maxUses: { type: "number", description: "Max utilisations (défaut 0 = illimité)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getMemberInfo",
      description:
        "Récupère infos détaillées sur un membre : rôles, date de join, statut, permissions.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getServerRoles",
      description: "Liste tous les rôles du serveur avec leur ID et couleur.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "setNickname",
      description: "Change le surnom d'un utilisateur sur ce serveur.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          nickname: { type: "string", description: "Nouveau surnom (vide pour reset)" },
        },
        required: ["userId", "nickname"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sendDM",
      description: "Envoie un message privé à un utilisateur.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          message: { type: "string", description: "Message à envoyer" },
        },
        required: ["userId", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createEmbed",
      description:
        "Envoie un embed riche dans le salon actuel (titre, description, couleur, fields).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre de l'embed" },
          description: { type: "string", description: "Description principale" },
          color: { type: "number", description: "Couleur en decimal (ex: 0x4285f4 = 4359936)" },
          fields: {
            type: "string",
            description: 'JSON array de fields: [{"name":"...","value":"...","inline":true}]',
          },
        },
        required: ["title", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getVoiceChannels",
      description: "Liste les salons vocaux du serveur avec le nombre d'utilisateurs connectés.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "lockChannel",
      description: "Verrouille un salon (empêche @everyone de parler).",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID du salon à verrouiller" },
        },
        required: ["channelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unlockChannel",
      description: "Déverrouille un salon (remet la permission @everyone pour parler).",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID du salon à déverrouiller" },
        },
        required: ["channelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getEmojis",
      description: "Liste les emojis personnalisés du serveur.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getAuditLog",
      description: "Récupère les derniers logs d'audit du serveur (actions de modération).",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Nombre d'entrées (défaut 5, max 25)" },
        },
        required: [],
      },
    },
  },
  // ── Bot Feature Tools ──
  {
    type: "function",
    function: {
      name: "searchGifs",
      description: "Recherche des GIFs via Tenor. Retourne URLs de GIFs. Gratuit, pas de clé.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Recherche de GIF (ex: dance, happy, gaming)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "checkToxicity",
      description:
        "Analyse la toxicité d'un texte (insultes, harcèlement, spam). Retourne un score.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Le texte à analyser" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRiskProfile",
      description:
        "Récupère le profil de risque d'un utilisateur (score, niveau, sanctions). Via le risk-engine du bot.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "checkPhishing",
      description:
        "Vérifie si une URL est un lien de phishing connu. Via le système de sécurité du bot.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "L'URL à vérifier" },
        },
        required: ["url"],
      },
    },
  },
  // ── Agent Autonome Tools ──
  {
    type: "function",
    function: {
      name: "analyze_image",
      description:
        "Analyse une image via vision IA. Détecte le contenu, le texte, les objets. Utile quand un utilisateur envoie une image.",
      parameters: {
        type: "object",
        properties: {
          image_url: { type: "string", description: "URL de l'image à analyser" },
          question: { type: "string", description: "Question spécifique sur l'image (optionnel)" },
        },
        required: ["image_url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_sentiment",
      description:
        "Analyse le sentiment et la toxicité d'un texte. Retourne un score de toxicité, l'humeur détectée et le niveau de risque.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Le texte à analyser" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "triggerGarbageCollection",
      description:
        "Déclenche un nettoyage de la RAM du bot (garbage collection). Tool de maintenance automatique. Aucun paramètre requis.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Agent Proactive Tools ──
  {
    type: "function",
    function: {
      name: "summarize_conversation",
      description:
        "Résume les N derniers messages d'un salon Discord. Utile pour rattraper une conversation longue ou générer un compte-rendu.",
      parameters: {
        type: "object",
        properties: {
          channel_id: { type: "string", description: "ID du salon à résumer" },
          message_count: {
            type: "number",
            description: "Nombre de messages à analyser (défaut: 50, max: 100)",
          },
        },
        required: ["channel_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_language",
      description:
        "Détecte la langue d'un texte. Retourne le code langue (fr, en, es, de...) et le niveau de confiance. Aucune API requise.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Le texte à analyser" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_server_insights",
      description:
        "Génère des statistiques avancées sur un serveur : activité, ratio en ligne, croissance, top channels, distribution des rôles.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Screenshot Tool (Playwright) ──
  SCREENSHOT_TOOL_DEF,
  // ── OpenRouter MCP Tools ──
  {
    type: "function",
    function: {
      name: "or_list_models",
      description:
        "Liste les modèles IA disponibles sur OpenRouter avec prix, contexte, et capacités. Filtres optionnels: modality, provider, min_context, max_price, free_only.",
      parameters: {
        type: "object",
        properties: {
          modality: {
            type: "string",
            description: "Filtrer par modalité: text, image, audio, embeddings",
          },
          provider: {
            type: "string",
            description: "Filtrer par provider: anthropic, openai, google, meta, etc.",
          },
          free_only: { type: "boolean", description: "Seulement les modèles gratuits" },
          min_context: { type: "number", description: "Contexte minimum (ex: 32000)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "or_model_info",
      description:
        "Récupère les détails complets d'un modèle OpenRouter: prix, contexte, capacités, parameters supportés.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "string",
            description:
              "L'ID du modèle (ex: anthropic/claude-3.5-sonnet, meta-llama/llama-3.2-3b-instruct:free)",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "or_benchmarks",
      description:
        "Récupère les scores de benchmark des modèles IA (Artificial Analysis, Design Arena). Compare la qualité des modèles.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Catégorie de benchmark (ex: coding, reasoning, math, vision)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "or_rankings",
      description:
        "Récupère le classement quotidien des modèles les plus utilisés sur OpenRouter (par volume de tokens). Aucun paramètre.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "or_chat_test",
      description:
        "Envoie un prompt de test à n'importe quel modèle OpenRouter et retourne la réponse + coût. Utile pour comparer des modèles. ATTENTION: opération payante.",
      parameters: {
        type: "object",
        properties: {
          model: {
            type: "string",
            description:
              "L'ID du modèle (ex: openai/gpt-4o, meta-llama/llama-3.2-3b-instruct:free)",
          },
          prompt: { type: "string", description: "Le prompt à envoyer" },
          max_tokens: { type: "number", description: "Max tokens (défaut: 500)" },
        },
        required: ["model", "prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "or_docs_search",
      description:
        "Recherche dans la documentation OpenRouter. Utile pour comprendre le routing, le tool calling, le prompt caching, etc.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La requête de recherche" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "or_credits",
      description: "Vérifie les crédits restants sur le compte OpenRouter. Aucun paramètre.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Secure DM-Exclusive: Wi-Fi QR Generator ──
  {
    type: "function",
    function: {
      name: "generate_wifi_qr",
      description:
        "Génère un QR code WiFi. ⚠️ SÉCURITÉ: Cet outil ne fonctionne QUE en messages privés (DM). Refuse de s'exécuter dans un salon public pour protéger les identifiants réseau.",
      parameters: {
        type: "object",
        properties: {
          ssid: { type: "string", description: "Nom du réseau WiFi (SSID)" },
          password: { type: "string", description: "Mot de passe WiFi" },
          encryptionType: {
            type: "string",
            description: "Type de chiffrement",
            enum: ["WPA", "WEP", "nopass"],
          },
        },
        required: ["ssid", "password"],
      },
    },
  },
  // ═══ New Tools (Part A) — replacements for solveMath and translateText ═══
  {
    type: "function",
    function: {
      name: "solveMathAdvanced",
      description:
        "Résout des expressions mathématiques complexes via Wolfram Alpha: calcul symbolique, dérivées, intégrales, équations, conversions d'unités, physique, chimie. Remplace solveMath.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Requête mathématique en langage naturel (ex: 'derive x^2 + 3x', 'integrate sin(x)', 'convert 5 km to miles')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "translateTextDeepL",
      description:
        "Traduit un texte via DeepL API — qualité nettement supérieure à MyMemory pour les langues européennes. Remplace translateText.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à traduire (max 5000 caractères)" },
          targetLang: {
            type: "string",
            description: "Langue cible (FR, EN, DE, ES, IT, PT, NL, PL, RU, JA, KO, ZH)",
          },
          sourceLang: {
            type: "string",
            description: "Langue source (optionnel, auto-détection si omis)",
          },
        },
        required: ["text", "targetLang"],
      },
    },
  },
  // ── Google Calendar ──
  {
    type: "function",
    function: {
      name: "listUpcomingEvents",
      description:
        "Liste les prochains événements du calendrier partagé du serveur (Google Calendar). Retourne titre, date, description et lieu.",
      parameters: {
        type: "object",
        properties: {
          maxResults: { type: "number", description: "Nombre max d'événements (défaut 10)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createCalendarEvent",
      description:
        "Crée un événement sur le calendrier partagé du serveur (Google Calendar). L'événement est visible par tous les membres du calendrier.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Titre de l'événement" },
          description: { type: "string", description: "Description (optionnel)" },
          start: {
            type: "string",
            description: "Date/heure de début ISO 8601 (ex: 2026-07-20T18:00:00)",
          },
          end: { type: "string", description: "Date/heure de fin ISO 8601" },
          location: { type: "string", description: "Lieu (optionnel)" },
        },
        required: ["summary", "start", "end"],
      },
    },
  },
  // ── NEW TOOLKITS (241 tools) ──
  // ── CRYPTO Toolkit ──
  {
    type: "function",
    function: {
      name: "hash_crack_dictionary",
      description: "Tente de casser un hash via dictionnaire (hashcat/john) dans le container Kali",
      parameters: {
        type: "object",
        properties: {
          hash: { type: "string", description: "hash" },
          hashType: { type: "string", description: "hashType" },
          wordlist: { type: "string", description: "wordlist" },
        },
        required: ["hash", "hashType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hash_identify_advanced",
      description: "Identifie un hash avec précision (bcrypt, argon2, NTLM, etc.)",
      parameters: {
        type: "object",
        properties: {
          hash: { type: "string", description: "hash" },
        },
        required: ["hash"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_hmac",
      description: "Génère un HMAC-SHA256/SHA512 pour vérifier l'intégrité d'un message",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "message" },
          key: { type: "string", description: "key" },
          algorithm: { type: "string", description: "algorithm" },
        },
        required: ["message", "key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crypto_aes_decrypt",
      description: "Déchiffre AES-256-GCM/CBC avec clé + IV fournis",
      parameters: {
        type: "object",
        properties: {
          encryptedData: { type: "string", description: "encryptedData" },
          key: { type: "string", description: "key" },
          iv: { type: "string", description: "iv" },
          mode: { type: "string", description: "mode" },
        },
        required: ["encryptedData", "key", "iv"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rsa_keypair_generate",
      description: "Génère une paire de clés RSA (2048/4096 bits)",
      parameters: {
        type: "object",
        properties: {
          bits: { type: "number", description: "bits" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rsa_encrypt",
      description: "Chiffre un message avec RSA (clé publique PEM)",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "message" },
          publicKeyPem: { type: "string", description: "publicKeyPem" },
        },
        required: ["message", "publicKeyPem"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rsa_decrypt",
      description: "Déchiffre un message RSA (clé privée PEM)",
      parameters: {
        type: "object",
        properties: {
          encryptedBase64: { type: "string", description: "encryptedBase64" },
          privateKeyPem: { type: "string", description: "privateKeyPem" },
        },
        required: ["encryptedBase64", "privateKeyPem"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pgp_encrypt",
      description: "Chiffre un message avec PGP (gpg dans Kali)",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "message" },
          recipientKey: { type: "string", description: "recipientKey" },
        },
        required: ["message", "recipientKey"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pgp_decrypt",
      description: "Déchiffre un message PGP avec clé privée",
      parameters: {
        type: "object",
        properties: {
          encryptedMessage: { type: "string", description: "encryptedMessage" },
        },
        required: ["encryptedMessage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stego_extract_lsb",
      description: "Extrait un message caché dans une image (LSB steganography)",
      parameters: {
        type: "object",
        properties: {
          imagePath: { type: "string", description: "imagePath" },
        },
        required: ["imagePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stego_hide_lsb",
      description: "Cache un message dans une image via LSB",
      parameters: {
        type: "object",
        properties: {
          imagePath: { type: "string", description: "imagePath" },
          message: { type: "string", description: "message" },
          outputFile: { type: "string", description: "outputFile" },
        },
        required: ["imagePath", "message", "outputFile"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "steganalysis_zscore",
      description: "Analyse stéganographique avancée (chi-square, z-score)",
      parameters: {
        type: "object",
        properties: {
          imagePath: { type: "string", description: "imagePath" },
        },
        required: ["imagePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "xor_cipher",
      description: "Chiffre/déchiffre XOR avec clé custom",
      parameters: {
        type: "object",
        properties: {
          data: { type: "string", description: "data" },
          key: { type: "string", description: "key" },
        },
        required: ["data", "key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "frequency_analysis",
      description: "Analyse de fréquence pour casser les chiffres classiques",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "random_token_generator",
      description: "Génère un token sécurisé (hex, base64, base32, URL-safe)",
      parameters: {
        type: "object",
        properties: {
          length: { type: "number", description: "length" },
          encoding: { type: "string", description: "encoding" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "certificate_parse",
      description: "Parse un certificat X.509 (PEM/DER) et affiche tous les champs",
      parameters: {
        type: "object",
        properties: {
          certPem: { type: "string", description: "certPem" },
        },
        required: ["certPem"],
      },
    },
  },
  // ── NET Toolkit ──
  {
    type: "function",
    function: {
      name: "smtp_relay_test",
      description: "Teste si un serveur SMTP accepte le relais ouvert",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
          port: { type: "number", description: "port" },
        },
        required: ["host"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "smtp_enum_vrfy",
      description: "Énumère les utilisateurs via SMTP VRFY/EXPN",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
          port: { type: "number", description: "port" },
          usernames: { type: "string", description: "usernames" },
        },
        required: ["host", "usernames"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ftp_anonymous_check",
      description: "Vérifie si un serveur FTP accepte les connexions anonymes",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
          port: { type: "number", description: "port" },
        },
        required: ["host"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "smb_enum_shares",
      description: "Énumère les shares SMB via enum4linux",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
        },
        required: ["host"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "smb_version_detect",
      description: "Détecte la version SMB et l'OS distant",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
        },
        required: ["host"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ldap_enum",
      description: "Énumère un annuaire LDAP (users, groups, computers)",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
          port: { type: "number", description: "port" },
        },
        required: ["host"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kerberos_user_enum",
      description: "Énumère les utilisateurs via Kerberos pre-auth",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
          realm: { type: "string", description: "realm" },
          usernames: { type: "string", description: "usernames" },
        },
        required: ["host", "realm", "usernames"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rdp_check",
      description: "Vérifie si RDP est accessible et récupère les infos",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
          port: { type: "number", description: "port" },
        },
        required: ["host"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ssh_version_scan",
      description: "Scanne la version SSH et les algorithmes supportés",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
          port: { type: "number", description: "port" },
        },
        required: ["host"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "telnet_banner_grab",
      description: "Banner grab sur Telnet (port 23)",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
          port: { type: "number", description: "port" },
        },
        required: ["host"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "snmp_walk",
      description: "SNMP walk complet sur une communauté donnée",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
          community: { type: "string", description: "community" },
        },
        required: ["host"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ntp_monlist",
      description: "Vérifie si NTP est vulnérable à amplification (monlist)",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
        },
        required: ["host"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dns_zone_transfer",
      description: "Tente un transfert de zone DNS (AXFR)",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "domain" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dns_subdomain_brute",
      description: "Brute-force les sous-domaines avec wordlist",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "domain" },
          wordlist: { type: "string", description: "wordlist" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dns_rebinding_check",
      description: "Vérifie si un domaine est vulnérable au DNS rebinding",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "domain" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ipv6_scan",
      description: "Scan IPv6 via multicast (ff02::1)",
      parameters: {
        type: "object",
        properties: {
          interfaceName: { type: "string", description: "interfaceName" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "vlan_hop_test",
      description: "Teste le VLAN hopping",
      parameters: {
        type: "object",
        properties: {
          interfaceName: { type: "string", description: "interfaceName" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wifi_deauth_detect",
      description: "Détecte les attaques deauthentication WiFi",
      parameters: {
        type: "object",
        properties: {
          interfaceName: { type: "string", description: "interfaceName" },
          duration: { type: "number", description: "duration" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "arp_poison_detect",
      description: "Détecte l'ARP poisoning sur le réseau local",
      parameters: {
        type: "object",
        properties: {
          interfaceName: { type: "string", description: "interfaceName" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "network_map_generate",
      description: "Génère une carte réseau (topologie) via nmap",
      parameters: {
        type: "object",
        properties: {
          subnet: { type: "string", description: "subnet" },
        },
        required: ["subnet"],
      },
    },
  },
  // ── OSINT Toolkit ──
  {
    type: "function",
    function: {
      name: "wayback_machine_lookup",
      description: "Recherche les snapshots archivés d'une URL sur Wayback Machine",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wayback_diff",
      description: "Compare deux versions archivées d'une page web",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
          timestamp1: { type: "string", description: "timestamp1" },
          timestamp2: { type: "string", description: "timestamp2" },
        },
        required: ["url", "timestamp1", "timestamp2"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crtsh_search",
      description: "Recherche les certificats SSL émis pour un domaine (crt.sh)",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "domain" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "haveibeenpwned_check",
      description: "Vérifie si un email apparaît dans une breach",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "email" },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dehashed_search",
      description: "Recherche dans les bases de données leakées (DeHashed)",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hunter_io_email",
      description: "Trouve les emails d'un domaine via Hunter.io",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "domain" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "phone_number_lookup_full",
      description: "Lookup complet d'un numéro (carrier, line type)",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "phone" },
        },
        required: ["phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "social_media_checker",
      description: "Vérifie la disponibilité d'un username sur 50+ réseaux",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "username" },
        },
        required: ["username"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gravatar_lookup",
      description: "Récupère l'avatar Gravatar et le profil d'un email",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "email" },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_dorks_search",
      description: "Recherche de secrets leakés sur GitHub via code search",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_commit_history",
      description: "Analyse l'historique des commits d'un repo pour des secrets",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "owner" },
          repo: { type: "string", description: "repo" },
        },
        required: ["owner", "repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "google_dorks_generator",
      description: "Génère des Google dorks pour la reconnaissance",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "domain" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "google_cache_lookup",
      description: "Récupère la version cache Google d'une page",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reverse_image_search",
      description: "Recherche inversée d'image (TinEye / Google Images)",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", description: "imageUrl" },
        },
        required: ["imageUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "exif_extract_full",
      description: "Extrait TOUTES les métadonnées EXIF d'une image",
      parameters: {
        type: "object",
        properties: {
          imagePath: { type: "string", description: "imagePath" },
        },
        required: ["imagePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "metadata_strip",
      description: "Supprime toutes les métadonnées d'un fichier",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "filePath" },
        },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "darkweb_monitor",
      description: "Surveille si un email/domaine apparaît sur le darkweb",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "email" },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "leaked_source_search",
      description: "Recherche dans les bases leakées (IntelligenceX, etc.)",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bitcoin_address_analysis",
      description: "Analyse une adresse Bitcoin (balance, transactions)",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "address" },
        },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ethereum_contract_verify",
      description: "Vérifie et décompile un smart contract Ethereum",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "address" },
        },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "domain_whois_history",
      description: "Historique WHOIS complet d'un domaine",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "domain" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reverse_whois",
      description: "Trouve tous les domaines enregistrés par un email/nom",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "email" },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dns_history_passive",
      description: "Historique DNS passif (SecurityTrails / PassiveDNS)",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "domain" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "breach_parse",
      description: "Parse et structure une base de données leakée",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "filePath" },
          format: { type: "string", description: "format" },
        },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "malware_sample_lookup",
      description: "Lookup d'un hash de malware (VirusTotal, MalwareBazaar)",
      parameters: {
        type: "object",
        properties: {
          hash: { type: "string", description: "hash" },
        },
        required: ["hash"],
      },
    },
  },
  // ── SEC Toolkit ──
  {
    type: "function",
    function: {
      name: "owasp_zap_scan",
      description: "Scan OWASP ZAP d'une URL (active scan) dans Kali",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nuclei_scan",
      description: "Scan Nuclei avec templates pour vulnérabilités connues",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
          templates: { type: "string", description: "templates" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ffuf_fuzz",
      description: "Fuzzing de directories/paramètres avec ffuf",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
          wordlist: { type: "string", description: "wordlist" },
          mode: { type: "string", description: "mode" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wfuzz_scan",
      description: "Fuzzing web avec Wfuzz",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
          wordlist: { type: "string", description: "wordlist" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wpscan_full",
      description: "Scan WordPress complet avec WPScan",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "joomscan",
      description: "Scan Joomla avec JoomScan",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "droopescan",
      description: "Scan Drupal avec Droopescan",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ssl_labs_grade",
      description: "Grade SSL Labs d'un domaine (API)",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "domain" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "security_headers_full",
      description: "Audit complet des security headers (A+ à F)",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cors_misconfig_check",
      description: "Détecte les mauvaises configurations CORS",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_redirect_check",
      description: "Détecte les vulnérabilités d'open redirect",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "xss_payload_generator",
      description: "Génère des payloads XSS (reflected, stored, DOM)",
      parameters: {
        type: "object",
        properties: {
          context: { type: "string", description: "context" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sqli_payload_generator",
      description: "Génère des payloads SQL Injection",
      parameters: {
        type: "object",
        properties: {
          dbType: { type: "string", description: "dbType" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "command_injection_test",
      description: "Teste les injections de commandes (OS command injection)",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
          param: { type: "string", description: "param" },
        },
        required: ["url", "param"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "xxe_vuln_check",
      description: "Vérifie les vulnérabilités XXE (XML External Entity)",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ssrf_check",
      description: "Détecte les vulnérabilités SSRF",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
          param: { type: "string", description: "param" },
        },
        required: ["url", "param"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lfi_rfi_check",
      description: "Vérifie les LFI/RFI (Local/Remote File Inclusion)",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
          param: { type: "string", description: "param" },
        },
        required: ["url", "param"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "csrf_token_check",
      description: "Vérifie la présence et validité des tokens CSRF",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rate_limit_check",
      description: "Vérifie si une API a un rate limiting",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dependency_audit",
      description: "Audit de vulnérabilités des dépendances (npm/pip/cargo)",
      parameters: {
        type: "object",
        properties: {
          projectPath: { type: "string", description: "projectPath" },
          ecosystem: { type: "string", description: "ecosystem" },
        },
        required: ["projectPath"],
      },
    },
  },
  // ── DS Toolkit ──
  {
    type: "function",
    function: {
      name: "csv_analyzer",
      description: "Analyse statistique complète d'un CSV (colonnes, types, corrélations)",
      parameters: {
        type: "object",
        properties: {
          csvData: { type: "string", description: "csvData" },
        },
        required: ["csvData"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "json_path_query",
      description: "Exécute une requête JSONPath sur un JSON complexe",
      parameters: {
        type: "object",
        properties: {
          jsonStr: { type: "string", description: "jsonStr" },
          path: { type: "string", description: "path" },
        },
        required: ["jsonStr", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sql_query_explainer",
      description: "Explique le plan d'exécution d'une requête SQL",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "data_anonymizer",
      description: "Anonymise un dataset (k-anonymity, suppression PII)",
      parameters: {
        type: "object",
        properties: {
          data: { type: "string", description: "data" },
          columnsToAnonymize: { type: "string", description: "columnsToAnonymize" },
        },
        required: ["data", "columnsToAnonymize"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "outlier_detector",
      description: "Détecte les outliers (IQR, Z-score)",
      parameters: {
        type: "object",
        properties: {
          numbers: { type: "string", description: "numbers" },
          method: { type: "string", description: "method" },
        },
        required: ["numbers"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "correlation_matrix",
      description: "Calcule la matrice de corrélation d'un dataset",
      parameters: {
        type: "object",
        properties: {
          data: { type: "string", description: "data" },
        },
        required: ["data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "histogram_generator",
      description: "Génère un histogramme à partir de données numériques",
      parameters: {
        type: "object",
        properties: {
          numbers: { type: "string", description: "numbers" },
          bins: { type: "number", description: "bins" },
        },
        required: ["numbers"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scatter_plot_generator",
      description: "Génère un scatter plot à partir de deux séries",
      parameters: {
        type: "object",
        properties: {
          xValues: { type: "string", description: "xValues" },
          yValues: { type: "string", description: "yValues" },
        },
        required: ["xValues", "yValues"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "time_series_decompose",
      description: "Décompose une série temporelle (tendance, saisonnalité)",
      parameters: {
        type: "object",
        properties: {
          values: { type: "string", description: "values" },
          period: { type: "number", description: "period" },
        },
        required: ["values"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "moving_average_calc",
      description: "Calcule les moyennes mobiles (SMA, EMA, WMA)",
      parameters: {
        type: "object",
        properties: {
          values: { type: "string", description: "values" },
          window: { type: "number", description: "window" },
          type: { type: "string", description: "type" },
        },
        required: ["values"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "linear_regression",
      description: "Régression linéaire simple sur deux séries",
      parameters: {
        type: "object",
        properties: {
          xValues: { type: "string", description: "xValues" },
          yValues: { type: "string", description: "yValues" },
        },
        required: ["xValues", "yValues"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hypothesis_test",
      description: "Test d'hypothèse (t-test, chi-square)",
      parameters: {
        type: "object",
        properties: {
          sample1: { type: "string", description: "sample1" },
          sample2: { type: "string", description: "sample2" },
          testType: { type: "string", description: "testType" },
        },
        required: ["sample1", "sample2"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confidence_interval",
      description: "Calcule l'intervalle de confiance d'un échantillon",
      parameters: {
        type: "object",
        properties: {
          values: { type: "string", description: "values" },
          confidence: { type: "number", description: "confidence" },
        },
        required: ["values"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "permutation_generator",
      description: "Génère toutes les permutations d'un ensemble",
      parameters: {
        type: "object",
        properties: {
          items: { type: "string", description: "items" },
          maxResults: { type: "number", description: "maxResults" },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "combinatorics_calc",
      description: "Calculs combinatoires (arrangements, combinaisons)",
      parameters: {
        type: "object",
        properties: {
          n: { type: "number", description: "n" },
          k: { type: "number", description: "k" },
          type: { type: "string", description: "type" },
        },
        required: ["n", "k"],
      },
    },
  },
  // ── MATH Toolkit ──
  {
    type: "function",
    function: {
      name: "matrix_operations",
      description: "Opérations matricielles (add, multiply, determinant, transpose)",
      parameters: {
        type: "object",
        properties: {
          matrixA: { type: "string", description: "matrixA" },
          matrixB: { type: "string", description: "matrixB" },
          operation: { type: "string", description: "operation" },
        },
        required: ["matrixA", "operation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "vector_calculus",
      description: "Calcul vectoriel (dot, cross, magnitude, angle)",
      parameters: {
        type: "object",
        properties: {
          vectorA: { type: "string", description: "vectorA" },
          vectorB: { type: "string", description: "vectorB" },
          operation: { type: "string", description: "operation" },
        },
        required: ["vectorA", "operation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivative_calculator",
      description: "Calcule la dérivée d'une expression symbolique",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "expression" },
          variable: { type: "string", description: "variable" },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "integral_calculator",
      description: "Calcule l'intégrale d'une expression (Simpson's rule)",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "expression" },
          variable: { type: "string", description: "variable" },
          lower: { type: "number", description: "lower" },
          upper: { type: "number", description: "upper" },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "limit_calculator",
      description: "Calcule la limite d'une fonction en un point",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "expression" },
          variable: { type: "string", description: "variable" },
          point: { type: "number", description: "point" },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "series_sum_calculator",
      description: "Calcule la somme d'une série (arithmétique, géométrique)",
      parameters: {
        type: "object",
        properties: {
          seriesType: { type: "string", description: "seriesType" },
          params: { type: "string", description: "params" },
        },
        required: ["seriesType", "params"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prime_factorization",
      description: "Décompose un nombre en facteurs premiers",
      parameters: {
        type: "object",
        properties: {
          n: { type: "number", description: "n" },
        },
        required: ["n"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gcd_lcm_calculator",
      description: "Calcule PGCD et PPCM de plusieurs nombres",
      parameters: {
        type: "object",
        properties: {
          numbers: { type: "string", description: "numbers" },
          operation: { type: "string", description: "operation" },
        },
        required: ["numbers", "operation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "modular_arithmetic",
      description: "Arithmétique modulaire (power mod, inverse mod, CRT)",
      parameters: {
        type: "object",
        properties: {
          base: { type: "number", description: "base" },
          exponent: { type: "number", description: "exponent" },
          modulus: { type: "number", description: "modulus" },
          operation: { type: "string", description: "operation" },
        },
        required: ["base", "modulus", "operation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "probability_distribution",
      description: "Calcule les probabilités (binomiale, normale, Poisson)",
      parameters: {
        type: "object",
        properties: {
          distribution: { type: "string", description: "distribution" },
          params: { type: "string", description: "params" },
          x: { type: "number", description: "x" },
        },
        required: ["distribution", "params"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bayes_theorem",
      description: "Calcule la probabilité via le théorème de Bayes",
      parameters: {
        type: "object",
        properties: {
          prior: { type: "number", description: "prior" },
          likelihood: { type: "number", description: "likelihood" },
          evidence: { type: "number", description: "evidence" },
        },
        required: ["prior", "likelihood", "evidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trigonometry_solver",
      description: "Résout des équations trigonométriques",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", description: "operation" },
          angle: { type: "number", description: "angle" },
          unit: { type: "string", description: "unit" },
        },
        required: ["operation", "angle"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complex_number_ops",
      description: "Opérations sur nombres complexes",
      parameters: {
        type: "object",
        properties: {
          aReal: { type: "number", description: "aReal" },
          aImag: { type: "number", description: "aImag" },
          bReal: { type: "number", description: "bReal" },
          bImag: { type: "number", description: "bImag" },
          operation: { type: "string", description: "operation" },
        },
        required: ["aReal", "aImag", "operation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "polynomial_solver",
      description: "Trouve les racines d'un polynôme (réelles et complexes)",
      parameters: {
        type: "object",
        properties: {
          coefficients: { type: "string", description: "coefficients" },
        },
        required: ["coefficients"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "number_base_convert_advanced",
      description: "Conversion entre bases (2, 8, 10, 16, 36, 64)",
      parameters: {
        type: "object",
        properties: {
          value: { type: "string", description: "value" },
          fromBase: { type: "number", description: "fromBase" },
          toBase: { type: "number", description: "toBase" },
        },
        required: ["value", "fromBase", "toBase"],
      },
    },
  },
  // ── NLP Toolkit ──
  {
    type: "function",
    function: {
      name: "text_extract_entities",
      description: "Extraction d'entités nommées (NER) — emails, URLs, IPs, phones, dates",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_summarize_advanced",
      description: "Résumé extractif d'un long texte",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
          sentences: { type: "number", description: "sentences" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_keyword_extract",
      description: "Extraction de mots-clés (TF-IDF, YAKE)",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
          numKeywords: { type: "number", description: "numKeywords" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_readability_score",
      description: "Score de lisibilité (Flesch-Kincaid, Gunning Fog, SMOG)",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_language_detect_advanced",
      description: "Détection de langue avec confiance",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_transliterate",
      description: "Translittération (Cyrillique→Latin, Arabe→Latin)",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
          fromScript: { type: "string", description: "fromScript" },
          toScript: { type: "string", description: "toScript" },
        },
        required: ["text", "fromScript", "toScript"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_phonetic_match",
      description: "Correspondance phonétique (Soundex, Metaphone)",
      parameters: {
        type: "object",
        properties: {
          word1: { type: "string", description: "word1" },
          word2: { type: "string", description: "word2" },
        },
        required: ["word1", "word2"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_stem_lemmatize",
      description: "Stemming et lemmatisation d'un texte",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
          operation: { type: "string", description: "operation" },
        },
        required: ["text", "operation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_ngram_generator",
      description: "Génère les n-grams d'un texte",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
          n: { type: "number", description: "n" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_regex_tester",
      description: "Teste une regex avec groupes capturés",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "pattern" },
          flags: { type: "string", description: "flags" },
          testString: { type: "string", description: "testString" },
        },
        required: ["pattern", "testString"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_fuzzy_match",
      description: "Correspondance floue (Levenshtein, Jaro-Winkler)",
      parameters: {
        type: "object",
        properties: {
          s1: { type: "string", description: "s1" },
          s2: { type: "string", description: "s2" },
        },
        required: ["s1", "s2"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_extract_emails",
      description: "Extrait tous les emails d'un texte",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_extract_urls",
      description: "Extrait toutes les URLs d'un texte",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_extract_ips",
      description: "Extrait toutes les adresses IP d'un texte",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_extract_phone_numbers",
      description: "Extrait les numéros de téléphone d'un texte",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_redact_pii",
      description: "Masque les PII dans un texte (emails, téléphones, SSN, CB)",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_markdown_to_plain",
      description: "Convertit Markdown en texte brut",
      parameters: {
        type: "object",
        properties: {
          markdown: { type: "string", description: "markdown" },
        },
        required: ["markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_html_to_markdown",
      description: "Convertit HTML en Markdown",
      parameters: {
        type: "object",
        properties: {
          html: { type: "string", description: "html" },
        },
        required: ["html"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_csv_to_json",
      description: "Convertit CSV en JSON",
      parameters: {
        type: "object",
        properties: {
          csv: { type: "string", description: "csv" },
        },
        required: ["csv"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_json_to_csv",
      description: "Convertit JSON en CSV",
      parameters: {
        type: "object",
        properties: {
          jsonStr: { type: "string", description: "jsonStr" },
        },
        required: ["jsonStr"],
      },
    },
  },
  // ── SYS Toolkit ──
  {
    type: "function",
    function: {
      name: "process_monitor",
      description: "Liste et surveille les processus (CPU, mémoire)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "disk_usage_analyzer",
      description: "Analyse l'utilisation disque par répertoire",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "path" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "network_connections_list",
      description: "Liste toutes les connexions réseau actives",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "firewall_rules_audit",
      description: "Audite les règles firewall (iptables / ufw)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cron_jobs_list",
      description: "Liste tous les cron jobs du système",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "env_vars_inspect",
      description: "Inspecte les variables d'environnement (sans secrets)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_tail",
      description: "Tail les logs système avec filtre",
      parameters: {
        type: "object",
        properties: {
          logPath: { type: "string", description: "logPath" },
          lines: { type: "number", description: "lines" },
        },
        required: ["logPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "service_status_check",
      description: "Vérifie le statut des services systemd",
      parameters: {
        type: "object",
        properties: {
          serviceName: { type: "string", description: "serviceName" },
        },
        required: ["serviceName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docker_ps_audit",
      description: "Audite les containers Docker (ports, volumes, env)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docker_image_vuln_scan",
      description: "Scan de vulnérabilités d'une image Docker (Trivy)",
      parameters: {
        type: "object",
        properties: {
          image: { type: "string", description: "image" },
        },
        required: ["image"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "k8s_pod_inspect",
      description: "Inspecte les pods Kubernetes",
      parameters: {
        type: "object",
        properties: {
          namespace: { type: "string", description: "namespace" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nginx_config_check",
      description: "Valide la configuration Nginx",
      parameters: {
        type: "object",
        properties: {
          configPath: { type: "string", description: "configPath" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apache_config_check",
      description: "Valide la configuration Apache",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ssl_cert_expiry_check",
      description: "Vérifie l'expiration des certificats SSL",
      parameters: {
        type: "object",
        properties: {
          domains: { type: "string", description: "domains" },
        },
        required: ["domains"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dns_propagation_check",
      description: "Vérifie la propagation DNS mondiale",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "domain" },
          recordType: { type: "string", description: "recordType" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "load_average_monitor",
      description: "Surveille la charge système (load average, CPU)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_leak_detect",
      description: "Détecte les fuites mémoire (heap snapshot)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "port_kill",
      description: "Tue le processus qui occupe un port spécifique",
      parameters: {
        type: "object",
        properties: {
          port: { type: "number", description: "port" },
        },
        required: ["port"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "file_permission_audit",
      description: "Audite les permissions de fichiers (SUID, world-writable)",
      parameters: {
        type: "object",
        properties: {
          dirPath: { type: "string", description: "dirPath" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ssh_key_audit",
      description: "Audite les clés SSH (type, bits, known_hosts)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  // ── CLOUD Toolkit ──
  {
    type: "function",
    function: {
      name: "aws_s3_bucket_check",
      description: "Vérifie si un bucket S3 est public/accessible",
      parameters: {
        type: "object",
        properties: {
          bucketName: { type: "string", description: "bucketName" },
        },
        required: ["bucketName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aws_iam_audit",
      description: "Audite les politiques IAM (permissions excessives)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aws_security_groups_audit",
      description: "Audite les security groups AWS",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "azure_ad_enum",
      description: "Énumère les utilisateurs/groups Azure AD",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gcp_project_enum",
      description: "Énumère les projets GCP et leurs APIs",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cloud_metadata_check",
      description: "Vérifie si le cloud metadata endpoint est accessible (SSRF)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "terraform_validate",
      description: "Valide une configuration Terraform",
      parameters: {
        type: "object",
        properties: {
          dirPath: { type: "string", description: "dirPath" },
        },
        required: ["dirPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "terraform_plan_diff",
      description: "Affiche le diff d'un terraform plan",
      parameters: {
        type: "object",
        properties: {
          dirPath: { type: "string", description: "dirPath" },
        },
        required: ["dirPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kubernetes_manifest_validate",
      description: "Valide un manifest Kubernetes",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "filePath" },
        },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docker_compose_validate",
      description: "Valide un docker-compose.yml",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "filePath" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "api_schema_diff",
      description: "Compare deux schémas d'API (OpenAPI)",
      parameters: {
        type: "object",
        properties: {
          schema1: { type: "string", description: "schema1" },
          schema2: { type: "string", description: "schema2" },
        },
        required: ["schema1", "schema2"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "graphql_introspection_check",
      description: "Vérifie si l'introspection GraphQL est activée",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "api_rate_limit_discover",
      description: "Découvre les limites de rate limiting d'une API",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "webhook_signature_verify",
      description: "Vérifie la signature d'un webhook (HMAC)",
      parameters: {
        type: "object",
        properties: {
          payload: { type: "string", description: "payload" },
          signature: { type: "string", description: "signature" },
          secret: { type: "string", description: "secret" },
          algorithm: { type: "string", description: "algorithm" },
        },
        required: ["payload", "signature", "secret"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "oauth_flow_test",
      description: "Teste un flow OAuth2 (authorization code, client credentials)",
      parameters: {
        type: "object",
        properties: {
          authorizationUrl: { type: "string", description: "authorizationUrl" },
          tokenUrl: { type: "string", description: "tokenUrl" },
          clientId: { type: "string", description: "clientId" },
          scope: { type: "string", description: "scope" },
        },
        required: ["authorizationUrl", "tokenUrl", "clientId"],
      },
    },
  },
  // ── GAME Toolkit ──
  {
    type: "function",
    function: {
      name: "riot_account_lookup",
      description: "Lookup d'un compte Riot (LoL, Valorant, TFT)",
      parameters: {
        type: "object",
        properties: {
          gameName: { type: "string", description: "gameName" },
          tagLine: { type: "string", description: "tagLine" },
        },
        required: ["gameName", "tagLine"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lol_match_history",
      description: "Historique de matchs League of Legends",
      parameters: {
        type: "object",
        properties: {
          summonerName: { type: "string", description: "summonerName" },
        },
        required: ["summonerName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lol_rank_check",
      description: "Vérifie le rang LoL d'un joueur",
      parameters: {
        type: "object",
        properties: {
          summonerName: { type: "string", description: "summonerName" },
          region: { type: "string", description: "region" },
        },
        required: ["summonerName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "csgo_stats_fetch",
      description: "Récupère les stats CSGO/CS2 d'un joueur",
      parameters: {
        type: "object",
        properties: {
          steamId: { type: "string", description: "steamId" },
        },
        required: ["steamId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apex_legends_stats",
      description: "Stats Apex Legends d'un joueur",
      parameters: {
        type: "object",
        properties: {
          playerName: { type: "string", description: "playerName" },
          platform: { type: "string", description: "platform" },
        },
        required: ["playerName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rocket_league_stats",
      description: "Stats Rocket League d'un joueur",
      parameters: {
        type: "object",
        properties: {
          playerName: { type: "string", description: "playerName" },
          platform: { type: "string", description: "platform" },
        },
        required: ["playerName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "osu_user_stats",
      description: "Stats Osu! d'un joueur",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "username" },
        },
        required: ["username"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "minecraft_server_status",
      description: "Statut détaillé d'un serveur Minecraft",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "host" },
          port: { type: "number", description: "port" },
        },
        required: ["host"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fortnite_item_shop",
      description: "Récupère l'item shop Fortnite actuel",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "epic_games_free_games",
      description: "Liste les jeux gratuits actuels sur Epic Games",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "twitch_stream_check",
      description: "Vérifie si un streamer est en live + infos",
      parameters: {
        type: "object",
        properties: {
          streamerName: { type: "string", description: "streamerName" },
        },
        required: ["streamerName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "twitch_clip_create",
      description: "Crée un clip d'un stream Twitch",
      parameters: {
        type: "object",
        properties: {
          broadcasterId: { type: "string", description: "broadcasterId" },
        },
        required: ["broadcasterId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spotify_track_search",
      description: "Recherche un morceau sur Spotify",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spotify_playlist_analyze",
      description: "Analyse une playlist Spotify (genres, BPM)",
      parameters: {
        type: "object",
        properties: {
          playlistId: { type: "string", description: "playlistId" },
        },
        required: ["playlistId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "boardgame_geek_search",
      description: "Recherche sur BoardGameGeek",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "query" },
        },
        required: ["query"],
      },
    },
  },
  // ── SCI Toolkit ──
  {
    type: "function",
    function: {
      name: "physics_calculator",
      description: "Calculs physiques (force, énergie, puissance, pression)",
      parameters: {
        type: "object",
        properties: {
          formula: { type: "string", description: "formula" },
          values: { type: "string", description: "values" },
        },
        required: ["formula", "values"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ohms_law_calc",
      description: "Calculs loi d'Ohm (V=IR, P=VI)",
      parameters: {
        type: "object",
        properties: {
          voltage: { type: "number", description: "voltage" },
          current: { type: "number", description: "current" },
          resistance: { type: "number", description: "resistance" },
          power: { type: "number", description: "power" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wavelength_frequency",
      description: "Convertit longueur d'onde ↔ fréquence ↔ énergie",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number", description: "value" },
          type: { type: "string", description: "type" },
        },
        required: ["value", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "radioactive_decay_calc",
      description: "Calcule la décroissance radioactive (demi-vie)",
      parameters: {
        type: "object",
        properties: {
          initialAmount: { type: "number", description: "initialAmount" },
          halfLife: { type: "number", description: "halfLife" },
          time: { type: "number", description: "time" },
        },
        required: ["initialAmount", "halfLife", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unit_convert_scientific",
      description: "Conversions scientifiques (SI, impérial, astronomique)",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number", description: "value" },
          fromUnit: { type: "string", description: "fromUnit" },
          toUnit: { type: "string", description: "toUnit" },
        },
        required: ["value", "fromUnit", "toUnit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "molar_mass_calc",
      description: "Calcule la masse molaire d'une formule chimique",
      parameters: {
        type: "object",
        properties: {
          formula: { type: "string", description: "formula" },
        },
        required: ["formula"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "chemical_equation_balancer",
      description: "Équilibre une équation chimique",
      parameters: {
        type: "object",
        properties: {
          equation: { type: "string", description: "equation" },
        },
        required: ["equation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ph_calculator",
      description: "Calcule le pH à partir de la concentration [H+]",
      parameters: {
        type: "object",
        properties: {
          concentration: { type: "number", description: "concentration" },
          type: { type: "string", description: "type" },
        },
        required: ["concentration", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ideal_gas_law",
      description: "Calculs loi des gaz parfaits (PV=nRT)",
      parameters: {
        type: "object",
        properties: {
          pressure: { type: "number", description: "pressure" },
          volume: { type: "number", description: "volume" },
          moles: { type: "number", description: "moles" },
          temperature: { type: "number", description: "temperature" },
          solveFor: { type: "string", description: "solveFor" },
        },
        required: ["solveFor"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kinematics_calc",
      description: "Calculs cinématiques (vitesse, accélération, distance)",
      parameters: {
        type: "object",
        properties: {
          v0: { type: "number", description: "v0" },
          a: { type: "number", description: "a" },
          t: { type: "number", description: "t" },
        },
        required: ["v0", "a", "t"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "optics_calc",
      description: "Calculs d'optique (lentilles, miroirs, réfraction)",
      parameters: {
        type: "object",
        properties: {
          focalLength: { type: "number", description: "focalLength" },
          objectDistance: { type: "number", description: "objectDistance" },
        },
        required: ["focalLength", "objectDistance"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "electric_field_calc",
      description: "Calcule le champ électrique d'une charge",
      parameters: {
        type: "object",
        properties: {
          charge: { type: "number", description: "charge" },
          distance: { type: "number", description: "distance" },
        },
        required: ["charge", "distance"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "thermal_expansion_calc",
      description: "Calcule la dilatation thermique d'un matériau",
      parameters: {
        type: "object",
        properties: {
          initialLength: { type: "number", description: "initialLength" },
          coefficient: { type: "number", description: "coefficient" },
          tempChange: { type: "number", description: "tempChange" },
        },
        required: ["initialLength", "coefficient", "tempChange"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "astronomical_distance",
      description: "Convertit les distances astronomiques (UA, AL, parsecs)",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number", description: "value" },
          fromUnit: { type: "string", description: "fromUnit" },
          toUnit: { type: "string", description: "toUnit" },
        },
        required: ["value", "fromUnit", "toUnit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "radioactive_decay_calc_2",
      description: "Calcule la demi-vie restante d'un isotope",
      parameters: {
        type: "object",
        properties: {
          initialAmount: { type: "number", description: "initialAmount" },
          halfLife: { type: "number", description: "halfLife" },
          time: { type: "number", description: "time" },
        },
        required: ["initialAmount", "halfLife", "time"],
      },
    },
  },
  // ── GEO Toolkit ──
  {
    type: "function",
    function: {
      name: "geocode_reverse",
      description: "Géocodage inverse (coordonnées → adresse)",
      parameters: {
        type: "object",
        properties: {
          lat: { type: "number", description: "lat" },
          lon: { type: "number", description: "lon" },
        },
        required: ["lat", "lon"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "timezone_convert_advanced",
      description: "Conversion de fuseau horaire avec liste de villes",
      parameters: {
        type: "object",
        properties: {
          datetime: { type: "string", description: "datetime" },
          fromTz: { type: "string", description: "fromTz" },
          toTz: { type: "string", description: "toTz" },
        },
        required: ["datetime", "fromTz", "toTz"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "distance_matrix",
      description: "Matrice de distances entre multiples points",
      parameters: {
        type: "object",
        properties: {
          origins: { type: "string", description: "origins" },
          destinations: { type: "string", description: "destinations" },
        },
        required: ["origins", "destinations"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "elevation_lookup",
      description: "Récupère l'altitude d'un point (Open-Elevation API)",
      parameters: {
        type: "object",
        properties: {
          lat: { type: "number", description: "lat" },
          lon: { type: "number", description: "lon" },
        },
        required: ["lat", "lon"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "country_bordering",
      description: "Liste les pays frontaliers d'un pays donné",
      parameters: {
        type: "object",
        properties: {
          country: { type: "string", description: "country" },
        },
        required: ["country"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "currency_by_country",
      description: "Récupère la devise et le taux de change d'un pays",
      parameters: {
        type: "object",
        properties: {
          country: { type: "string", description: "country" },
        },
        required: ["country"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "language_by_country",
      description: "Liste les langues officielles d'un pays",
      parameters: {
        type: "object",
        properties: {
          country: { type: "string", description: "country" },
        },
        required: ["country"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "capital_lookup",
      description: "Récupère la capitale, population, superficie d'un pays",
      parameters: {
        type: "object",
        properties: {
          country: { type: "string", description: "country" },
        },
        required: ["country"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "iso_country_code",
      description: "Récupère les codes ISO 3166 d'un pays",
      parameters: {
        type: "object",
        properties: {
          country: { type: "string", description: "country" },
        },
        required: ["country"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sunrise_sunset_anywhere",
      description: "Heure de lever/coucher du soleil pour toute position/date",
      parameters: {
        type: "object",
        properties: {
          lat: { type: "number", description: "lat" },
          lon: { type: "number", description: "lon" },
          date: { type: "string", description: "date" },
        },
        required: ["lat", "lon"],
      },
    },
  },
  // ── HEALTH Toolkit ──
  {
    type: "function",
    function: {
      name: "water_intake_calc",
      description: "Calcule l'apport hydrique recommandé selon poids et activité",
      parameters: {
        type: "object",
        properties: {
          weightKg: { type: "number", description: "weightKg" },
          activityMinutes: { type: "number", description: "activityMinutes" },
        },
        required: ["weightKg"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "heart_rate_zone",
      description: "Calcule les zones de fréquence cardiaque pour l'entraînement",
      parameters: {
        type: "object",
        properties: {
          age: { type: "number", description: "age" },
          restingHr: { type: "number", description: "restingHr" },
        },
        required: ["age"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "body_fat_percentage_calc",
      description: "Estime le pourcentage de masse grasse (US Navy method)",
      parameters: {
        type: "object",
        properties: {
          gender: { type: "string", description: "gender" },
          heightCm: { type: "number", description: "heightCm" },
          neckCm: { type: "number", description: "neckCm" },
          waistCm: { type: "number", description: "waistCm" },
          hipCm: { type: "number", description: "hipCm" },
        },
        required: ["gender", "heightCm", "neckCm", "waistCm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ideal_weight_calc",
      description: "Calcule le poids idéal (Devine, Robinson, Miller, Hamwi)",
      parameters: {
        type: "object",
        properties: {
          gender: { type: "string", description: "gender" },
          heightCm: { type: "number", description: "heightCm" },
        },
        required: ["gender", "heightCm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pregnancy_due_date",
      description: "Calcule la date prévue d'accouchement",
      parameters: {
        type: "object",
        properties: {
          lastPeriod: { type: "string", description: "lastPeriod" },
        },
        required: ["lastPeriod"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ovulation_calc",
      description: "Calcule la période d'ovulation",
      parameters: {
        type: "object",
        properties: {
          lastPeriod: { type: "string", description: "lastPeriod" },
          cycleLength: { type: "number", description: "cycleLength" },
        },
        required: ["lastPeriod"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "macro_nutrient_calc",
      description: "Calcule les macros (protéines, glucides, lipides) selon objectifs",
      parameters: {
        type: "object",
        properties: {
          weightKg: { type: "number", description: "weightKg" },
          goal: { type: "string", description: "goal" },
          activityLevel: { type: "string", description: "activityLevel" },
        },
        required: ["weightKg"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sleep_quality_score",
      description: "Score de qualité du sommeil selon durée et cycles",
      parameters: {
        type: "object",
        properties: {
          bedtime: { type: "string", description: "bedtime" },
          wakeTime: { type: "string", description: "wakeTime" },
          awakenings: { type: "number", description: "awakenings" },
          deepSleepPct: { type: "number", description: "deepSleepPct" },
        },
        required: ["bedtime", "wakeTime"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "step_to_calorie",
      description: "Convertit pas en calories brûlées",
      parameters: {
        type: "object",
        properties: {
          steps: { type: "number", description: "steps" },
          weightKg: { type: "number", description: "weightKg" },
        },
        required: ["steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hydration_tracker",
      description: "Suit l'hydratation quotidienne",
      parameters: {
        type: "object",
        properties: {
          glassesToday: { type: "number", description: "glassesToday" },
          weightKg: { type: "number", description: "weightKg" },
        },
        required: ["glassesToday"],
      },
    },
  },
  // ── CODE Toolkit ──
  {
    type: "function",
    function: {
      name: "code_complexity_analyzer",
      description: "Analyse la complexité cyclomatique d'un fichier de code",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "code" },
          language: { type: "string", description: "language" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "code_format_beautifier",
      description: "Formate/beautifie du code (JS, TS, Python, Go, Rust, Java)",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "code" },
          language: { type: "string", description: "language" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "code_minifier",
      description: "Minifie du code (JS, CSS, HTML)",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "code" },
          language: { type: "string", description: "language" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "code_diff_unified",
      description: "Génère un diff unifié entre deux snippets",
      parameters: {
        type: "object",
        properties: {
          code1: { type: "string", description: "code1" },
          code2: { type: "string", description: "code2" },
        },
        required: ["code1", "code2"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "code_linter_check",
      description: "Lint un snippet de code (ESLint, Pylint, tsc)",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "filePath" },
          linter: { type: "string", description: "linter" },
        },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "regex_debugger",
      description: "Debug une regex avec explication étape par étape",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "pattern" },
          testString: { type: "string", description: "testString" },
        },
        required: ["pattern", "testString"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "api_endpoint_tester",
      description: "Teste un endpoint API avec params custom",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "url" },
          method: { type: "string", description: "method" },
          headers: { type: "string", description: "headers" },
          body: { type: "string", description: "body" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "json_schema_validate",
      description: "Valide un JSON contre un schéma JSON",
      parameters: {
        type: "object",
        properties: {
          jsonStr: { type: "string", description: "jsonStr" },
          schemaStr: { type: "string", description: "schemaStr" },
        },
        required: ["jsonStr", "schemaStr"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "yaml_validate",
      description: "Valide un YAML et le convertit en JSON",
      parameters: {
        type: "object",
        properties: {
          yamlStr: { type: "string", description: "yamlStr" },
        },
        required: ["yamlStr"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "xml_to_json",
      description: "Convertit XML en JSON",
      parameters: {
        type: "object",
        properties: {
          xmlStr: { type: "string", description: "xmlStr" },
        },
        required: ["xmlStr"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sql_format_beautify",
      description: "Formate/beautifie une requête SQL",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "sql" },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dockerfile_lint",
      description: "Lint un Dockerfile (best practices)",
      parameters: {
        type: "object",
        properties: {
          dockerfile: { type: "string", description: "dockerfile" },
        },
        required: ["dockerfile"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "changelog_generator",
      description: "Génère un changelog à partir de commits Git",
      parameters: {
        type: "object",
        properties: {
          commits: { type: "string", description: "commits" },
          version: { type: "string", description: "version" },
        },
        required: ["commits"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sql_format_beautify_2",
      description: "Formate une requête SQL (alias)",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "sql" },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dockerfile_lint_2",
      description: "Lint un Dockerfile (alias)",
      parameters: {
        type: "object",
        properties: {
          dockerfile: { type: "string", description: "dockerfile" },
        },
        required: ["dockerfile"],
      },
    },
  },
  // ── MEDIA Toolkit ──
  {
    type: "function",
    function: {
      name: "image_resize_crop",
      description: "Redimensionne/rogne une image (sharp)",
      parameters: {
        type: "object",
        properties: {
          imagePath: { type: "string", description: "imagePath" },
          width: { type: "number", description: "width" },
          height: { type: "number", description: "height" },
          operation: { type: "string", description: "operation" },
        },
        required: ["imagePath", "width", "height"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_format_convert",
      description: "Convertit une image (PNG, JPG, WebP, AVIF, GIF)",
      parameters: {
        type: "object",
        properties: {
          imagePath: { type: "string", description: "imagePath" },
          targetFormat: { type: "string", description: "targetFormat" },
        },
        required: ["imagePath", "targetFormat"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_metadata_strip",
      description: "Supprime les métadonnées d'une image",
      parameters: {
        type: "object",
        properties: {
          imagePath: { type: "string", description: "imagePath" },
        },
        required: ["imagePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_collage_create",
      description: "Crée un collage à partir de plusieurs images",
      parameters: {
        type: "object",
        properties: {
          imagePaths: { type: "string", description: "imagePaths" },
          cols: { type: "number", description: "cols" },
          rows: { type: "number", description: "rows" },
        },
        required: ["imagePaths", "cols", "rows"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "audio_convert",
      description: "Convertit un fichier audio (MP3, WAV, OGG, FLAC) via ffmpeg",
      parameters: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "inputPath" },
          targetFormat: { type: "string", description: "targetFormat" },
          bitrate: { type: "string", description: "bitrate" },
        },
        required: ["inputPath", "targetFormat"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "audio_extract_from_video",
      description: "Extrait l'audio d'une vidéo via ffmpeg",
      parameters: {
        type: "object",
        properties: {
          videoPath: { type: "string", description: "videoPath" },
          targetFormat: { type: "string", description: "targetFormat" },
        },
        required: ["videoPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "video_compress",
      description: "Compresse une vidéo via ffmpeg",
      parameters: {
        type: "object",
        properties: {
          videoPath: { type: "string", description: "videoPath" },
          crf: { type: "number", description: "crf" },
        },
        required: ["videoPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "video_gif_convert",
      description: "Convertit une vidéo en GIF ou inversement",
      parameters: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "inputPath" },
          outputFormat: { type: "string", description: "outputFormat" },
          fps: { type: "number", description: "fps" },
          width: { type: "number", description: "width" },
        },
        required: ["inputPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_to_speech_multi",
      description: "TTS avec choix de voix et langue multiple",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "text" },
          voice: { type: "string", description: "voice" },
          language: { type: "string", description: "language" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_watermark_add",
      description: "Ajoute un watermark à une image",
      parameters: {
        type: "object",
        properties: {
          imagePath: { type: "string", description: "imagePath" },
          watermarkText: { type: "string", description: "watermarkText" },
          opacity: { type: "number", description: "opacity" },
        },
        required: ["imagePath", "watermarkText"],
      },
    },
  },
  // ── Amazon Toolkit ──
  {
    type: "function",
    function: {
      name: "amazon_wishlist_scrape",
      description: "Scrape une wishlist Amazon publique (prix, stock, images)",
      parameters: {
        type: "object",
        properties: {
          wishlistUrl: { type: "string", description: "URL de la wishlist Amazon" },
          domain: { type: "string", description: "Domaine Amazon (com, fr, co.uk, de)" },
        },
        required: ["wishlistUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_price_track",
      description: "Suit le prix d'un produit Amazon via Keepa API ou scraping",
      parameters: {
        type: "object",
        properties: {
          asin: { type: "string", description: "ASIN du produit (10 caractères)" },
          domain: { type: "string", description: "Domaine Amazon (com, fr, co.uk, de)" },
        },
        required: ["asin"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_price_history",
      description: "Historique des prix d'un produit via Keepa API",
      parameters: {
        type: "object",
        properties: {
          asin: { type: "string", description: "ASIN du produit" },
          domain: { type: "string", description: "Domaine Amazon" },
          days: { type: "number", description: "Nombre de jours d'historique (défaut 30)" },
        },
        required: ["asin"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_product_lookup",
      description: "Récupère les détails d'un produit Amazon par ASIN",
      parameters: {
        type: "object",
        properties: {
          asin: { type: "string", description: "ASIN du produit" },
          domain: { type: "string", description: "Domaine Amazon" },
        },
        required: ["asin"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_cart_monitor",
      description: "Surveille le panier Amazon via session Puppeteer (cookies sauvegardés)",
      parameters: {
        type: "object",
        properties: {
          sessionDir: {
            type: "string",
            description: "Dossier de session (défaut /tmp/amazon-session)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_price_alert_create",
      description: "Crée une alerte de baisse de prix pour un ASIN",
      parameters: {
        type: "object",
        properties: {
          asin: { type: "string", description: "ASIN du produit" },
          targetPrice: {
            type: "number",
            description: "Prix cible (notification quand le prix descend en dessous)",
          },
          channelId: {
            type: "string",
            description: "ID du canal Discord pour la notification (optionnel)",
          },
        },
        required: ["asin", "targetPrice"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_price_alert_check",
      description: "Vérifie toutes les alertes de prix actives",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_price_alert_delete",
      description: "Supprime une alerte de prix",
      parameters: {
        type: "object",
        properties: {
          alertId: { type: "string", description: "ID de l'alerte à supprimer" },
        },
        required: ["alertId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_wishlist_diff",
      description: "Compare les snapshots d'une wishlist (ajouts/suppressions/changements de prix)",
      parameters: {
        type: "object",
        properties: {
          wishlistUrl: { type: "string", description: "URL de la wishlist" },
        },
        required: ["wishlistUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_deal_search",
      description: "Recherche les offres en cours sur Amazon",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domaine Amazon" },
          category: { type: "string", description: "Catégorie (optionnel)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_best_sellers",
      description: "Récupère les best-sellers d'une catégorie Amazon",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domaine Amazon" },
          category: { type: "string", description: "Catégorie (electronics, books, etc.)" },
        },
        required: ["category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_coupon_search",
      description: "Recherche des coupons Amazon pour un mot-clé",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domaine Amazon" },
          keyword: { type: "string", description: "Mot-clé de recherche" },
        },
        required: ["keyword"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_subscribe_save_check",
      description: "Vérifie les abonnements Subscribe & Save Amazon",
      parameters: {
        type: "object",
        properties: {
          sessionDir: { type: "string", description: "Dossier de session" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_order_history",
      description: "Récupère l'historique des commandes Amazon via session Puppeteer",
      parameters: {
        type: "object",
        properties: {
          sessionDir: { type: "string", description: "Dossier de session" },
          year: { type: "string", description: "Année (ex: 2026)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "amazon_review_summary",
      description: "Résumé des avis et notes d'un produit Amazon",
      parameters: {
        type: "object",
        properties: {
          asin: { type: "string", description: "ASIN du produit" },
          domain: { type: "string", description: "Domaine Amazon" },
        },
        required: ["asin"],
      },
    },
  },
];

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function executeExtendedTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult | null> {
  logger.info(`[AgentToolsExt] 🔧 ${toolName} args=${JSON.stringify(args).slice(0, 150)}`);

  // ── Guardrails: check user permissions for dangerous actions ──
  const { checkToolPermission } = await import("./toolGuardrails.js");
  const permCheck = await checkToolPermission(ctx.client, ctx.guildId, ctx.userId, toolName);
  if (!permCheck.allowed) {
    logger.warn(
      `[Guardrails] ❌ ${toolName} blocked for ${ctx.userId} (level: ${permCheck.level})`,
    );
    return { success: false, data: permCheck.reason };
  }

  try {
    switch (toolName) {
      // IP Toolkit
      case "ip_ping":
        return await tIpPing(args);
      case "ip_traceroute":
        return await tIpTraceroute(args);
      case "ip_portscan":
        return await tIpPortScan(args);
      case "ip_http_check":
        return await tIpHttpCheck(args);
      case "ip_ssl_check":
        return await tIpSslCheck(args);
      case "ip_full_report":
        return await tIpFullReport(args);
      // Net Toolkit
      case "dns_lookup":
        return await tDnsLookupFull(args);
      case "banner_grab":
        return await tBannerGrab(args);
      case "http_methods_check":
        return await tHttpMethodsCheck(args);
      case "directory_check":
        return await tDirectoryCheck(args);
      case "tech_detect":
        return await tTechDetect(args);
      case "cors_test":
        return await tCorsTest(args);
      case "email_validate":
        return await tEmailValidate(args);
      case "jwt_decode":
        return await tJwtDecode(args);
      case "url_expand":
        return await tUrlExpand(args);
      case "security_score":
        return await tSecurityScore(args);
      // Security Toolkit
      case "hash_crack":
        return await tHashCrack(args);
      case "sqli_detect":
        return await tSqliDetect(args);
      case "xss_detect":
        return await tXssDetect(args);
      case "password_analyze":
        return await tPasswordAnalyze(args);
      case "subdomain_enum":
        return await tSubdomainEnum(args);
      case "reverse_ip":
        return await tReverseIp(args);
      case "cidr_calc":
        return await tCidrCalc(args);
      case "mac_vendor":
        return await tMacVendor(args);
      case "hsts_check":
        return await tHstsCheck(args);
      case "waf_detect":
        return await tWafDetect(args);
      case "robots_parse":
        return await tRobotsParse(args);
      case "sitemap_parse":
        return await tSitemapParse(args);
      case "http_status_ref":
        return await tHttpStatusRef(args);
      case "port_ref":
        return await tPortRef(args);
      // Utility Toolkit
      case "timestamp_convert":
        return await tTimestampConvert(args);
      case "base_convert":
        return await tBaseConvert(args);
      case "uuid_gen":
        return await tUuidGen(args);
      case "regex_test":
        return await tRegexTest(args);
      case "json_format":
        return await tJsonFormat(args);
      case "binary_convert":
        return await tBinaryConvert(args);
      case "hex_convert":
        return await tHexConvert(args);
      case "morse_code":
        return await tMorseCode(args);
      case "caesar_cipher":
        return await tCaesarCipher(args);
      case "rot13":
        return await tRot13(args);
      case "hash_gen":
        return await tHashGen(args);
      case "lorem_gen":
        return await tLoremGen(args);
      case "color_convert":
        return await tColorConvert(args);
      // Pentest Toolkit
      case "metasploit":
        return await tMetasploit(args);
      case "tshark_capture":
        return await tTsharkCapture(args);
      case "hydra_brute":
        return await tHydraBrute(args);
      case "sqlmap_scan":
        return await tSqlmapScan(args);
      case "searchsploit":
        return await tSearchsploit(args);
      case "hashcat_crack":
        return await tHashcatCrack(args);
      case "snmp_walk":
        return await tSnmpWalk(args);
      case "enum4linux_scan":
        return await tEnum4linuxScan(args);
      case "harvester_osint":
        return await tHarvesterOsint(args);
      case "crackmapexec_scan":
        return await tCrackmapexecScan(args);
      case "whatweb_scan":
        return await tWhatwebScan(args);
      case "gobuster_scan":
        return await tGobusterScan(args);
      case "nmap_nse_scan":
        return await tNmapNseScan(args);
      // Forensics Toolkit
      case "base64_codec":
        return await tBase64Codec(args);
      case "url_codec":
        return await tUrlCodec(args);
      case "aes_crypto":
        return await tAesCrypto(args);
      case "file_hash":
        return await tFileHash(args);
      case "file_metadata":
        return await tFileMetadata(args);
      case "pii_scan":
        return await tPiiScan(args);
      case "ioc_parse":
        return await tIocParse(args);
      case "entropy_analyze":
        return await tEntropyAnalyze(args);
      case "hex_dump":
        return await tHexDump(args);
      case "string_extract":
        return await tStringExtract(args);
      case "pe_header":
        return await tPeHeader(args);
      case "elf_header":
        return await tElfHeader(args);
      case "apk_info":
        return await tApkInfo(args);
      case "dep_vuln_check":
        return await tDepVulnCheck(args);
      case "stego_detect":
        return await tStegoDetect(args);
      // Data & Text Toolkit
      case "unit_convert":
        return await tUnitConvert(args);
      case "temp_convert":
        return await tTempConvert(args);
      case "math_eval":
        return await tMathEval(args);
      case "stats_calc":
        return await tStatsCalc(args);
      case "sentiment_analyze":
        return await tSentimentAnalyze(args);
      case "language_detect":
        return await tLanguageDetect(args);
      case "word_freq":
        return await tWordFreq(args);
      case "case_convert":
        return await tCaseConvert(args);
      case "slug_gen":
        return await tSlugGen(args);
      case "qr_gen":
        return await tQrGen(args);
      case "cron_parse":
        return await tCronParse(args);
      case "ip_range_gen":
        return await tIpRangeGen(args);
      case "num_to_words":
        return await tNumToWords(args);
      case "password_gen":
        return await tPasswordGen(args);
      case "data_size_format":
        return await tDataSizeFormat(args);
      case "text_diff":
        return await tTextDiff(args);
      // Fun
      case "getJoke":
        return await tGetJoke();
      case "getDadJoke":
        return await tGetDadJoke();
      case "getAdvice":
        return await tGetAdvice();
      case "getQuote":
        return await tGetQuote();
      case "getTrivia":
        return await tGetTrivia();
      case "getMeme":
        return await tGetMeme();
      case "getDogImage":
        return await tGetDogImage();
      case "getCatImage":
        return await tGetCatImage();
      // Info
      case "getCountryInfo":
        return await tGetCountryInfo(args);
      case "getCurrencyRate":
        return await tGetCurrencyRate(args);
      case "getDateTime":
        return await tGetDateTime(args);
      case "getIpInfo":
        return await tGetIpInfo(args);
      // Finance
      case "getStockPrice":
        return await tGetStockPrice(args);
      // Social
      case "getRedditPosts":
        return await tGetRedditPosts(args);
      case "getUrbanDict":
        return await tGetUrbanDict(args);
      // Books & Science
      case "getBookInfo":
        return await tGetBookInfo(args);
      case "getNasaApod":
        return await tGetNasaApod();
      // Gaming
      case "getPokemon":
        return await tGetPokemon(args);
      case "getSteamGame":
        return await tGetSteamGame(args);
      case "getSteamDeals":
        return await tGetSteamDeals();
      case "getGameNews":
        return await tGetGameNews(args);
      case "getSpeedrunRecord":
        return await tGetSpeedrunRecord(args);
      case "getGameReleases":
        return await tGetGameReleases(args);
      case "getSteamPlayerCount":
        return await tGetSteamPlayerCount(args);
      // Utilities Advanced
      case "generatePassword":
        return await tGeneratePassword(args);
      case "solveMath":
        return await tSolveMath(args);
      case "dnsLookup":
        return await tDnsLookup(args);
      case "getHttpStatus":
        return await tGetHttpStatus(args);
      case "testRegex":
        return await tTestRegex(args);
      case "convertUnits":
        return await tConvertUnits(args);
      case "getColorInfo":
        return await tGetColorInfo(args);
      case "getRandomFact":
        return await tGetRandomFact(args);
      case "getHoroscope":
        return await tGetHoroscope(args);
      case "getUvIndex":
        return await tGetUvIndex(args);
      case "getGithubRepoInfo":
        return await tGetGithubRepoInfo(args);
      case "getCryptoInfo":
        return await tGetCryptoInfo(args);
      // Dev
      case "getNpmPackage":
        return await tGetNpmPackage(args);
      case "getPypiPackage":
        return await tGetPypiPackage(args);
      case "getGithubUser":
        return await tGetGithubUser(args);
      // Utilities
      case "shortenUrl":
        return await tShortenUrl(args);
      case "getQrCode":
        return await tGetQrCode(args);
      case "getRandomUser":
        return await tGetRandomUser();
      // Discord
      case "kickUser":
        return await tKickUser(args, ctx);
      case "banUser":
        return await tBanUser(args, ctx);
      case "addRole":
        return await tAddRole(args, ctx);
      case "removeRole":
        return await tRemoveRole(args, ctx);
      case "createChannel":
        return await tCreateChannel(args, ctx);
      case "deleteChannel":
        return await tDeleteChannel(args, ctx);
      case "setChannelTopic":
        return await tSetChannelTopic(args, ctx);
      case "createInvite":
        return await tCreateInvite(args, ctx);
      case "getMemberInfo":
        return await tGetMemberInfo(args, ctx);
      case "getServerRoles":
        return await tGetServerRoles(ctx);
      case "setNickname":
        return await tSetNickname(args, ctx);
      case "sendDM":
        return await tSendDM(args, ctx);
      case "createEmbed":
        return await tCreateEmbed(args, ctx);
      case "getVoiceChannels":
        return await tGetVoiceChannels(ctx);
      case "lockChannel":
        return await tLockChannel(args, ctx);
      case "unlockChannel":
        return await tUnlockChannel(args, ctx);
      case "getEmojis":
        return await tGetEmojis(ctx);
      case "getAuditLog":
        return await tGetAuditLog(args, ctx);
      // Bot features
      case "searchGifs":
        return await tSearchGifs(args);
      case "checkToxicity":
        return await tCheckToxicity(args);
      case "getRiskProfile":
        return await tGetRiskProfile(args, ctx);
      case "checkPhishing":
        return await tCheckPhishing(args);
      case "analyze_image":
        return await tAnalyzeImage(args);
      case "analyze_sentiment":
        return await tAnalyzeSentiment(args);
      case "triggerGarbageCollection":
        return await tTriggerGC();
      case "summarize_conversation":
        return await tSummarizeConversation(args, ctx);
      case "detect_language":
        return await tDetectLanguage(args);
      case "get_server_insights":
        return await tGetServerInsights(ctx);
      // Screenshot (Playwright)
      case "take_screenshot":
        return await handleScreenshotTool(args, ctx);
      // OpenRouter MCP Tools
      case "or_list_models":
        return await tOrListModels(args);
      case "or_model_info":
        return await tOrModelInfo(args);
      case "or_benchmarks":
        return await tOrBenchmarks(args);
      case "or_rankings":
        return await tOrRankings();
      case "or_chat_test":
        return await tOrChatTest(args);
      case "or_docs_search":
        return await tOrDocsSearch(args);
      case "or_credits":
        return await tOrCredits();
      case "generate_wifi_qr":
        return await tGenerateWifiQr(args, ctx);
      // New Tools (Part A)
      case "solveMathAdvanced":
        return await tSolveMathAdvanced(args);
      case "translateTextDeepL":
        return await tTranslateTextDeepL(args);
      // ── Google Calendar ──
      case "listUpcomingEvents": {
        const max = Number(args.maxResults) || 10;
        const events = await listUpcomingEvents(max);
        if (!events)
          return {
            success: false,
            data: "Google Calendar non configuré (GOOGLE_CALENDAR_ID ou credentials manquants)",
          };
        if (events.length === 0) return { success: true, data: "Aucun événement à venir" };
        const formatted = events
          .map(
            (e) =>
              `📅 ${e.summary}\n${e.start} → ${e.end}${e.location ? `\n📍 ${e.location}` : ""}`,
          )
          .join("\n\n");
        return { success: true, data: formatted };
      }
      case "createCalendarEvent": {
        const summary = String(args.summary ?? "").trim();
        const start = String(args.start ?? "").trim();
        const end = String(args.end ?? "").trim();
        if (!summary || !start || !end)
          return { success: false, data: "summary, start et end sont requis" };
        const event = await createCalendarEvent({
          summary,
          description: args.description ? String(args.description) : undefined,
          start,
          end,
          location: args.location ? String(args.location) : undefined,
        });
        if (!event)
          return { success: false, data: "Google Calendar non configuré ou erreur de création" };
        return {
          success: true,
          data: `✅ Événement créé: ${event.summary} (${event.start} → ${event.end})`,
        };
      }
      // Amazon Toolkit
      case "amazon_wishlist_scrape":
        return await tAmazonWishlistScrape(args);
      case "amazon_price_track":
        return await tAmazonPriceTrack(args);
      case "amazon_price_history":
        return await tAmazonPriceHistory(args);
      case "amazon_product_lookup":
        return await tAmazonProductLookup(args);
      case "amazon_cart_monitor":
        return await tAmazonCartMonitor(args);
      case "amazon_price_alert_create":
        return tAmazonPriceAlertCreate(args);
      case "amazon_price_alert_check":
        return await tAmazonPriceAlertCheck();
      case "amazon_price_alert_delete":
        return tAmazonPriceAlertDelete(args);
      case "amazon_wishlist_diff":
        return tAmazonWishlistDiff(args);
      case "amazon_deal_search":
        return await tAmazonDealSearch(args);
      case "amazon_best_sellers":
        return await tAmazonBestSellers(args);
      case "amazon_coupon_search":
        return await tAmazonCouponSearch(args);
      case "amazon_subscribe_save_check":
        return await tAmazonSubscribeSaveCheck(args);
      case "amazon_order_history":
        return await tAmazonOrderHistory(args);
      case "amazon_review_summary":
        return await tAmazonReviewSummary(args);
      default:
        return null;
    }
  } catch (error) {
    logger.error(
      `[AgentToolsExt] Erreur ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      success: false,
      data: `Erreur: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ─── Fun & Entertainment ─────────────────────────────────────────────────────

async function tGetJoke(): Promise<ToolCallResult> {
  try {
    const res = await fetchRetry("https://official-joke-api.appspot.com/random_joke", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Blague indisponible" };
    const d = (await res.json()) as { setup: string; punchline: string };
    return { success: true, data: JSON.stringify({ setup: d.setup, punchline: d.punchline }) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetDadJoke(): Promise<ToolCallResult> {
  try {
    const res = await fetchRetry("https://icanhazdadjoke.com/", {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Dad joke indisponible" };
    const text = await res.text();
    return { success: true, data: text };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetAdvice(): Promise<ToolCallResult> {
  try {
    const res = await fetchRetry("https://api.adviceslip.com/advice", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Conseil indisponible" };
    const d = (await res.json()) as { slip: { advice: string } };
    return { success: true, data: d.slip.advice };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetQuote(): Promise<ToolCallResult> {
  try {
    const res = await fetchRetry("https://zenquotes.io/api/random", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Citation indisponible" };
    const d = (await res.json()) as Array<{ q: string; a: string }>;
    if (!d[0]) return { success: false, data: "Pas de citation" };
    return { success: true, data: JSON.stringify({ quote: d[0].q, author: d[0].a }) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetTrivia(): Promise<ToolCallResult> {
  try {
    const res = await fetchRetry("https://opentdb.com/api.php?amount=1&type=multiple", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Trivia indisponible" };
    const d = (await res.json()) as {
      results: Array<{
        question: string;
        correct_answer: string;
        incorrect_answers: string[];
        category: string;
        difficulty: string;
      }>;
    };
    if (!d.results[0]) return { success: false, data: "Pas de question" };
    const q = d.results[0];
    return {
      success: true,
      data: JSON.stringify({
        category: q.category,
        difficulty: q.difficulty,
        question: stripAllHtml(q.question),
        correctAnswer: stripAllHtml(q.correct_answer),
        options: [q.correct_answer, ...q.incorrect_answers].map(stripAllHtml).sort(),
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetMeme(): Promise<ToolCallResult> {
  try {
    const res = await fetchRetry("https://api.imgflip.com/get_memes", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Meme indisponible" };
    const d = (await res.json()) as {
      data: {
        memes: Array<{ id: string; name: string; url: string; width: number; height: number }>;
      };
    };
    const memes = d.data.memes;
    if (!memes?.length) return { success: false, data: "Pas de meme" };
    const random = memes[Math.floor(Math.random() * Math.min(10, memes.length))];
    return { success: true, data: JSON.stringify({ name: random.name, url: random.url }) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetDogImage(): Promise<ToolCallResult> {
  try {
    const res = await fetchRetry("https://dog.ceo/api/breeds/image/random", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Photo indisponible" };
    const d = (await res.json()) as { message: string };
    return { success: true, data: d.message };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetCatImage(): Promise<ToolCallResult> {
  try {
    const res = await fetchRetry("https://cataas.com/cat?json=true", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Photo indisponible" };
    const d = (await res.json()) as { url: string };
    return { success: true, data: `https://cataas.com${d.url}` };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Info & Reference ────────────────────────────────────────────────────────

async function tGetCountryInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const country = String(args.country);
  const ck = `country:${country.toLowerCase()}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetchRetry(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=name,capital,population,flag,currencies,languages,region,subregion,maps`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { success: false, data: `Pays "${country}" introuvable` };
    const data = (await res.json()) as Array<{
      name: { common: string };
      capital: string[];
      population: number;
      flag: string;
      currencies: Record<string, { name: string; symbol: string }>;
      languages: Record<string, string>;
      region: string;
      subregion: string;
    }>;
    const c = data[0];
    if (!c) return { success: false, data: "Pays introuvable" };
    const output = JSON.stringify({
      name: c.name.common,
      capital: c.capital?.[0] || "N/A",
      population: c.population.toLocaleString(),
      region: c.region,
      subregion: c.subregion,
      flag: c.flag,
      currencies: Object.values(c.currencies || {})
        .map((cur) => `${cur.name} (${cur.symbol})`)
        .join(", "),
      languages: Object.values(c.languages || {}).join(", "),
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetCurrencyRate(args: Record<string, unknown>): Promise<ToolCallResult> {
  const amount = Number(args.amount);
  const from = String(args.from).toUpperCase();
  const to = String(args.to).toUpperCase();
  try {
    const res = await fetchRetry(
      `https://api.exchangerate.host/convert?from=${from}&to=${to}&amount=${amount}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { success: false, data: "Conversion indisponible" };
    const d = (await res.json()) as { result: number; date: string };
    return {
      success: true,
      data: JSON.stringify({
        amount,
        from,
        to,
        result: d.result,
        rate: d.result / amount,
        date: d.date,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetDateTime(args: Record<string, unknown>): Promise<ToolCallResult> {
  const tz = String(args.timezone);
  try {
    const res = await fetchRetry(
      `https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`,
      {
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return { success: false, data: `Timezone "${tz}" introuvable` };
    const d = (await res.json()) as { datetime: string; timezone: string; utc_datetime: string };
    return {
      success: true,
      data: JSON.stringify({ timezone: d.timezone, datetime: d.datetime, utc: d.utc_datetime }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetIpInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ip = String(args.ip);
  try {
    const res = await fetchRetry(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "IP indisponible" };
    const d = (await res.json()) as {
      city: string;
      region: string;
      country_name: string;
      org: string;
      timezone: string;
      latitude: number;
      longitude: number;
    };
    return {
      success: true,
      data: JSON.stringify({
        ip,
        city: d.city,
        region: d.region,
        country: d.country_name,
        isp: d.org,
        timezone: d.timezone,
        lat: d.latitude,
        lon: d.longitude,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Finance ─────────────────────────────────────────────────────────────────

async function tGetStockPrice(args: Record<string, unknown>): Promise<ToolCallResult> {
  const symbol = String(args.symbol).toUpperCase();
  const ck = `stock:${symbol}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetchRetry(
      `https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { success: false, data: "Bourse indisponible" };
    const text = await res.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return { success: false, data: `Action "${symbol}" introuvable` };
    const cols = lines[1].split(",");
    const output = JSON.stringify({
      symbol,
      open: cols[2],
      high: cols[3],
      low: cols[4],
      close: cols[5],
      volume: cols[6],
      date: cols[1],
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Social & Content ────────────────────────────────────────────────────────

async function tGetRedditPosts(args: Record<string, unknown>): Promise<ToolCallResult> {
  const subreddit = String(args.subreddit).replace(/^r\//, "");
  const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
  const ck = `reddit:${subreddit}:${limit}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetchRetry(
      `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?limit=${limit}&t=day`,
      {
        headers: { "User-Agent": "DiscordBot/1.0" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return { success: false, data: `Subreddit r/${subreddit} introuvable` };
    const d = (await res.json()) as {
      data: {
        children: Array<{
          data: {
            title: string;
            url: string;
            score: number;
            author: string;
            num_comments: number;
            permalink: string;
          };
        }>;
      };
    };
    const posts = d.data.children.map((c) => ({
      title: c.data.title,
      url: c.data.url,
      score: c.data.score,
      author: c.data.author,
      comments: c.data.num_comments,
      permalink: `https://reddit.com${c.data.permalink}`,
    }));
    const output = JSON.stringify(posts);
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetUrbanDict(args: Record<string, unknown>): Promise<ToolCallResult> {
  const term = String(args.term);
  try {
    const res = await fetchRetry(
      `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { success: false, data: "Urban Dictionary indisponible" };
    const d = (await res.json()) as {
      list: Array<{ definition: string; example: string; author: string; thumbs_up: number }>;
    };
    if (!d.list[0]) return { success: false, data: `Terme "${term}" introuvable` };
    const def = d.list[0];
    return {
      success: true,
      data: JSON.stringify({
        term,
        definition: stripAllHtml(def.definition).slice(0, 1000),
        example: stripAllHtml(def.example).slice(0, 500),
        author: def.author,
        likes: def.thumbs_up,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Books & Science ─────────────────────────────────────────────────────────

async function tGetBookInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  try {
    const res = await fetchRetry(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=1`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { success: false, data: "Open Library indisponible" };
    const d = (await res.json()) as {
      docs: Array<{
        title: string;
        author_name: string[];
        first_publish_year: number;
        cover_i: number;
        subject: string[];
      }>;
    };
    if (!d.docs[0]) return { success: false, data: `Livre "${query}" introuvable` };
    const b = d.docs[0];
    return {
      success: true,
      data: JSON.stringify({
        title: b.title,
        authors: b.author_name?.join(", ") || "Inconnu",
        firstPublished: b.first_publish_year || "N/A",
        cover: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : null,
        subjects: b.subject?.slice(0, 5).join(", ") || [],
        url: `https://openlibrary.org/search?q=${encodeURIComponent(query)}`,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetNasaApod(): Promise<ToolCallResult> {
  const ck = "nasa:apod";
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetchRetry("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "NASA APOD indisponible" };
    const d = (await res.json()) as {
      title: string;
      explanation: string;
      url: string;
      hdurl: string;
      date: string;
      media_type: string;
    };
    const output = JSON.stringify({
      title: d.title,
      explanation: d.explanation.slice(0, 1000),
      url: d.url,
      hdUrl: d.hdurl,
      date: d.date,
      type: d.media_type,
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Gaming ──────────────────────────────────────────────────────────────────

async function tGetPokemon(args: Record<string, unknown>): Promise<ToolCallResult> {
  const name = String(args.name).toLowerCase();
  const ck = `pokemon:${name}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetchRetry(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Pokémon "${name}" introuvable` };
    const d = (await res.json()) as {
      name: string;
      id: number;
      height: number;
      weight: number;
      types: Array<{ type: { name: string } }>;
      stats: Array<{ base_stat: number; stat: { name: string } }>;
      abilities: Array<{ ability: { name: string } }>;
      sprites: { front_default: string };
    };
    const output = JSON.stringify({
      name: d.name,
      id: d.id,
      height: `${d.height / 10}m`,
      weight: `${d.weight / 10}kg`,
      types: d.types.map((t) => t.type.name),
      stats: d.stats.map((s) => `${s.stat.name}: ${s.base_stat}`),
      abilities: d.abilities.map((a) => a.ability.name),
      sprite: d.sprites.front_default,
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetSteamGame(args: Record<string, unknown>): Promise<ToolCallResult> {
  const appid = Number(args.appid);
  const ck = `steam:${appid}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetchRetry(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&l=fr`,
      {
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return { success: false, data: "Steam Store indisponible" };
    const d = (await res.json()) as Record<
      string,
      {
        success: boolean;
        data: {
          name: string;
          short_description: string;
          header_image: string;
          price_overview?: { final_formatted: string };
          metacritic?: { score: number };
          developers: string[];
          publishers: string[];
          genres: Array<{ description: string }>;
        };
      }
    >;
    const info = d[appid];
    if (!info?.success) return { success: false, data: `Jeu Steam ${appid} introuvable` };
    const g = info.data;
    const output = JSON.stringify({
      name: g.name,
      description: g.short_description?.slice(0, 800),
      price: g.price_overview?.final_formatted || "Gratuit",
      metacritic: g.metacritic?.score || null,
      developers: g.developers?.join(", "),
      publishers: g.publishers?.join(", "),
      genres: g.genres?.map((x) => x.description).join(", "),
      image: g.header_image,
      url: `https://store.steampowered.com/app/${appid}`,
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetSteamDeals(): Promise<ToolCallResult> {
  try {
    const res = await fetchRetry("https://store.steampowered.com/api/featuredcategories", {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return { success: false, data: "Steam API indisponible" };
    const data = (await res.json()) as Record<string, unknown>;
    const specials = data.specials as
      | {
          items: Array<{
            id: number;
            name: string;
            discount_block?: string;
            discount_original_price?: number;
            discount_final_price?: number;
          }>;
        }
      | undefined;
    if (!specials?.items) return { success: false, data: "Aucune promo trouvée" };
    const deals = specials.items.slice(0, 10).map((item) => {
      const discountMatch = item.discount_block?.match(/(\d+)%/);
      return {
        name: item.name,
        originalPrice: item.discount_original_price
          ? (item.discount_original_price / 100).toFixed(2) + "€"
          : "N/A",
        finalPrice: item.discount_final_price
          ? (item.discount_final_price / 100).toFixed(2) + "€"
          : "GRATUIT",
        discount: discountMatch ? discountMatch[1] + "%" : "N/A",
        url: `https://store.steampowered.com/app/${item.id}`,
      };
    });
    return { success: true, data: JSON.stringify(deals) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetGameNews(args: Record<string, unknown>): Promise<ToolCallResult> {
  const appid = Number(args.appid);
  const count = Math.min(Number(args.count) || 5, 20);
  try {
    const res = await fetchRetry(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appid}&count=${count}&maxlength=500&format=json`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: "Steam News API indisponible" };
    const data = (await res.json()) as {
      appnews: {
        newsitems: Array<{
          title: string;
          url: string;
          contents: string;
          date: number;
          author: string;
        }>;
      };
    };
    const news = data.appnews.newsitems.map((n) => ({
      title: n.title,
      url: n.url,
      author: n.author,
      date: new Date(n.date * 1000).toISOString(),
      excerpt: n.contents?.slice(0, 300),
    }));
    return { success: true, data: JSON.stringify(news) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetSpeedrunRecord(args: Record<string, unknown>): Promise<ToolCallResult> {
  const game = String(args.game).toLowerCase().trim();
  try {
    const res = await fetchRetry(
      `https://www.speedrun.com/api/v1/games?name=${encodeURIComponent(game)}&max=1`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: "speedrun.com API indisponible" };
    const data = (await res.json()) as {
      data: Array<{ id: string; names: { international: string }; abbreviation: string }>;
    };
    if (!data.data?.length)
      return { success: false, data: `Jeu "${game}" introuvable sur speedrun.com` };
    const g = data.data[0];
    const recordsRes = await fetchRetry(
      `https://www.speedrun.com/api/v1/games/${g.abbreviation}/records?top=1&max=1`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!recordsRes.ok)
      return {
        success: true,
        data: JSON.stringify({ game: g.names.international, message: "Aucun record trouvé" }),
      };
    const recordsData = (await recordsRes.json()) as {
      data: Array<{
        runs: Array<{
          run: { times: { primary_t: number }; weblink: string; status: { status: string } };
        }>;
      }>;
    };
    if (!recordsData.data?.length || !recordsData.data[0].runs?.length) {
      return {
        success: true,
        data: JSON.stringify({ game: g.names.international, message: "Aucun record trouvé" }),
      };
    }
    const run = recordsData.data[0].runs[0].run;
    const time = run.times.primary_t;
    const minutes = Math.floor(time / 60);
    const seconds = (time % 60).toFixed(0);
    return {
      success: true,
      data: JSON.stringify({
        game: g.names.international,
        worldRecord: `${minutes}m ${seconds}s`,
        url: run.weblink,
        status: run.status.status,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetGameReleases(args: Record<string, unknown>): Promise<ToolCallResult> {
  const platform = String(args.platform || "all").toLowerCase();
  const count = Math.min(Number(args.count) || 10, 20);
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return { success: false, data: "IGDB non configuré (clés manquantes)" };
  try {
    const tokenRes = await fetchRetry(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: "POST", signal: AbortSignal.timeout(10000) },
    );
    if (!tokenRes.ok) return { success: false, data: "IGDB auth échouée" };
    const token = (await tokenRes.json()) as { access_token: string };
    const platformMap: Record<string, number> = {
      pc: 6,
      playstation: 48,
      xbox: 49,
      switch: 130,
      all: -1,
    };
    const platformId = platformMap[platform] ?? -1;
    const body =
      platformId >= 0
        ? `fields name,first_release_date,summary,platforms.name,cover.image_id,genres.name; where first_release_date > ${Math.floor(Date.now() / 1000)} & platforms = (${platformId}); sort first_release_date asc; limit ${count};`
        : `fields name,first_release_date,summary,platforms.name,cover.image_id,genres.name; where first_release_date > ${Math.floor(Date.now() / 1000)}; sort first_release_date asc; limit ${count};`;
    const res = await fetchRetry("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "text/plain",
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { success: false, data: "IGDB API erreur" };
    const games = (await res.json()) as Array<{
      name: string;
      first_release_date: number;
      summary?: string;
      platforms: Array<{ name: string }>;
      cover?: { image_id: string };
      genres?: Array<{ name: string }>;
    }>;
    const releases = games.map((g) => ({
      name: g.name,
      releaseDate: g.first_release_date
        ? new Date(g.first_release_date * 1000).toLocaleDateString("fr-FR")
        : "TBA",
      platforms: g.platforms?.map((p) => p.name).join(", ") || "N/A",
      cover: g.cover
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
        : null,
      summary: g.summary?.slice(0, 500) || null,
      genres: g.genres?.map((g2) => g2.name).join(", ") || null,
    }));
    return { success: true, data: JSON.stringify(releases) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetSteamPlayerCount(args: Record<string, unknown>): Promise<ToolCallResult> {
  const appid = Number(args.appid);
  try {
    const res = await fetchRetry(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: "Steam API indisponible" };
    const data = (await res.json()) as { response: { player_count: number; result: number } };
    if (data.response.result !== 1) return { success: false, data: "Jeu introuvable" };
    return {
      success: true,
      data: JSON.stringify({
        appid,
        currentPlayers: data.response.player_count.toLocaleString("fr-FR"),
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Utilities Advanced ──────────────────────────────────────────────────────

async function tGeneratePassword(args: Record<string, unknown>): Promise<ToolCallResult> {
  const length = Math.min(Number(args.length) || 16, 64);
  const useSymbols = args.symbols !== false;
  const useNumbers = args.numbers !== false;
  let chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (useNumbers) chars += "0123456789";
  if (useSymbols) chars += "!@#$%^&*()_+-=[]{}|;:,.<>?";
  const crypto = await import("node:crypto");
  const password = Array.from(crypto.randomBytes(length))
    .map((b) => chars[b % chars.length])
    .join("");
  const strength = length >= 16 ? "fort" : length >= 12 ? "moyen" : "faible";
  return {
    success: true,
    data: JSON.stringify({
      password,
      length,
      strength,
      hasSymbols: useSymbols,
      hasNumbers: useNumbers,
    }),
  };
}

async function tSolveMath(args: Record<string, unknown>): Promise<ToolCallResult> {
  const expr = String(args.expression).replace(/[^0-9+\-*/().^a-z\s,]/gi, "");
  const safe = expr
    .replace(/\^/g, "**")
    .replace(/sqrt\(/g, "Math.sqrt(")
    .replace(/sin\(/g, "Math.sin(")
    .replace(/cos\(/g, "Math.cos(")
    .replace(/tan\(/g, "Math.tan(")
    .replace(/log\(/g, "Math.log(")
    .replace(/pi/gi, "Math.PI")
    .replace(/(?<![a-zA-Z])e(?![a-zA-Z])/g, "Math.E");
  try {
    const result = Function(`"use strict"; return (${safe})`)();
    if (typeof result !== "number" || !isFinite(result)) {
      return { success: false, data: "Résultat invalide" };
    }
    return {
      success: true,
      data: JSON.stringify({ expression: args.expression, result: Number(result.toFixed(10)) }),
    };
  } catch (e) {
    return {
      success: false,
      data: `Expression invalide: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tDnsLookup(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain)
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const type = String(args.type || "A").toUpperCase();
  try {
    const res = await fetchRetry(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
      {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: "DNS lookup échoué" };
    const data = (await res.json()) as {
      Answer: Array<{ name: string; type: number; TTL: number; data: string }>;
      Status: number;
    };
    if (data.Status !== 0 || !data.Answer)
      return { success: false, data: `Aucun enregistrement ${type} pour ${domain}` };
    const records = data.Answer.map((a) => ({
      name: a.name,
      type: a.type,
      ttl: a.TTL,
      data: a.data,
    }));
    return { success: true, data: JSON.stringify({ domain, type, records }) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetHttpStatus(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  const ssrfCheck = await checkUrlForSsrf(url, "tGetHttpStatus");
  if (!ssrfCheck.allowed)
    return { success: false, data: `URL bloquée (SSRF): ${ssrfCheck.reason}` };
  try {
    const start = Date.now();
    const res = await fetchRetry(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    const elapsed = Date.now() - start;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return {
      success: true,
      data: JSON.stringify({
        url,
        status: res.status,
        statusText: res.statusText,
        responseTimeMs: elapsed,
        finalUrl: res.url,
        server: headers["server"] || "N/A",
        contentType: headers["content-type"] || "N/A",
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tTestRegex(args: Record<string, unknown>): Promise<ToolCallResult> {
  const pattern = String(args.pattern);
  const text = String(args.text);
  const flags = String(args.flags || "g");
  try {
    const regex = new RegExp(pattern, flags);
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    if (flags.includes("g")) {
      while ((m = regex.exec(text)) !== null) {
        matches.push(m[0]);
        if (m.index === regex.lastIndex) regex.lastIndex++;
      }
    } else {
      m = regex.exec(text);
      if (m) matches.push(m[0]);
    }
    return {
      success: true,
      data: JSON.stringify({
        pattern,
        flags,
        matchCount: matches.length,
        matches: matches.slice(0, 20),
      }),
    };
  } catch (e) {
    return {
      success: false,
      data: `Regex invalide: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tConvertUnits(args: Record<string, unknown>): Promise<ToolCallResult> {
  const value = Number(args.value);
  const from = String(args.from).toLowerCase();
  const to = String(args.to).toLowerCase();

  const conversions: Record<string, number> = {
    // Length (to meters)
    m: 1,
    km: 1000,
    cm: 0.01,
    mm: 0.001,
    mi: 1609.344,
    ft: 0.3048,
    in: 0.0254,
    yd: 0.9144,
    // Weight (to grams)
    g: 1,
    kg: 1000,
    mg: 0.001,
    lb: 453.592,
    oz: 28.3495,
    ton: 1000000,
    // Volume (to liters)
    l: 1,
    ml: 0.001,
    gal: 3.78541,
    qt: 0.946353,
    pt: 0.473176,
    cup: 0.236588,
    floz: 0.0295735,
    // Data (to bytes)
    b: 1,
    kb: 1024,
    mb: 1048576,
    gb: 1073741824,
    tb: 1099511627776,
    // Speed (to m/s)
    mps: 1,
    kmh: 0.277778,
    mph: 0.44704,
    knot: 0.514444,
  };

  // Temperature special case
  const tempUnits = ["c", "f", "k"];
  if (tempUnits.includes(from) && tempUnits.includes(to)) {
    let celsius: number;
    if (from === "c") celsius = value;
    else if (from === "f") celsius = ((value - 32) * 5) / 9;
    else celsius = value - 273.15;
    let result: number;
    if (to === "c") result = celsius;
    else if (to === "f") result = (celsius * 9) / 5 + 32;
    else result = celsius + 273.15;
    return {
      success: true,
      data: JSON.stringify({
        value,
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        result: Number(result.toFixed(4)),
      }),
    };
  }

  const fromFactor = conversions[from];
  const toFactor = conversions[to];
  if (!fromFactor || !toFactor)
    return {
      success: false,
      data: `Unités non supportées. Disponibles: ${Object.keys(conversions).join(", ")} + C, F, K`,
    };

  const result = (value * fromFactor) / toFactor;
  return {
    success: true,
    data: JSON.stringify({
      value,
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      result: Number(result.toFixed(6)),
    }),
  };
}

async function tGetColorInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.color).trim();
  let r: number, g: number, b: number;
  if (input.startsWith("#")) {
    const hex = input.slice(1);
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    const parts = input.split(",").map((p) => parseInt(p.trim()));
    [r, g, b] = parts;
  }
  if (isNaN(r) || isNaN(g) || isNaN(b))
    return { success: false, data: "Format invalide. Utilisez HEX (#FF5733) ou RGB (255,87,51)" };

  const toHSL = (r: number, g: number, b: number) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    let h = 0,
      s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  };

  const hsl = toHSL(r, g, b);
  const complement = `#${(((255 - r) << 16) | ((255 - g) << 8) | (255 - b)).toString(16).padStart(6, "0")}`;
  const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

  return {
    success: true,
    data: JSON.stringify({
      hex: hex.toUpperCase(),
      rgb: `${r}, ${g}, ${b}`,
      hsl: `${hsl.h}°, ${hsl.s}%, ${hsl.l}%`,
      complementary: complement.toUpperCase(),
      brightness: Math.round((r * 299 + g * 587 + b * 114) / 1000),
    }),
  };
}

async function tGetRandomFact(args: Record<string, unknown>): Promise<ToolCallResult> {
  const type = String(args.type || "trivia").toLowerCase();
  const number = args.number !== undefined ? Number(args.number) : "random";
  try {
    const url = `http://numbersapi.com/${number}/${type}`;
    const res = await fetchRetry(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { success: false, data: "Numbers API indisponible" };
    const text = await res.text();
    return {
      success: true,
      data: JSON.stringify({
        type,
        number: number === "random" ? "aléatoire" : number,
        fact: text,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetHoroscope(args: Record<string, unknown>): Promise<ToolCallResult> {
  const sign = String(args.sign).toLowerCase().trim();
  try {
    const res = await fetchRetry(
      `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${sign}&day=TODAY`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: "Horoscope API indisponible" };
    const data = (await res.json()) as { data: { horoscope_data: string; date: string } };
    return {
      success: true,
      data: JSON.stringify({
        sign,
        date: data.data?.date || "aujourd'hui",
        horoscope: data.data?.horoscope_data || "N/A",
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetUvIndex(args: Record<string, unknown>): Promise<ToolCallResult> {
  const lat = Number(args.lat);
  const lon = Number(args.lon);
  try {
    const res = await fetchRetry(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=uv_index_max,temperature_2m_max,temperature_2m_min&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: "Open-Meteo API indisponible" };
    const data = (await res.json()) as {
      current: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number };
      daily: { uv_index_max: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
    };
    const uv = data.daily.uv_index_max[0];
    const uvLevel =
      uv <= 2
        ? "Faible"
        : uv <= 5
          ? "Modéré"
          : uv <= 7
            ? "Élevé"
            : uv <= 10
              ? "Très élevé"
              : "Extrême";
    return {
      success: true,
      data: JSON.stringify({
        uvIndex: uv,
        uvLevel,
        currentTemp: data.current.temperature_2m + "°C",
        humidity: data.current.relative_humidity_2m + "%",
        windSpeed: data.current.wind_speed_10m + " km/h",
        maxTemp: data.daily.temperature_2m_max[0] + "°C",
        minTemp: data.daily.temperature_2m_min[0] + "°C",
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetGithubRepoInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const owner = String(args.owner);
  const repo = String(args.repo);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "DiscordBot",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetchRetry(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { success: false, data: `Repo ${owner}/${repo} introuvable` };
    const data = (await res.json()) as {
      full_name: string;
      description: string;
      stargazers_count: number;
      forks_count: number;
      open_issues_count: number;
      language: string;
      license: { name: string } | null;
      created_at: string;
      updated_at: string;
      homepage: string;
      topics: string[];
      size: number;
      default_branch: string;
      archived: boolean;
    };
    return {
      success: true,
      data: JSON.stringify({
        name: data.full_name,
        description: data.description || "N/A",
        stars: data.stargazers_count,
        forks: data.forks_count,
        issues: data.open_issues_count,
        language: data.language || "N/A",
        license: data.license?.name || "N/A",
        topics: data.topics?.slice(0, 10) || [],
        homepage: data.homepage || "N/A",
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        size: (data.size / 1024).toFixed(1) + " MB",
        branch: data.default_branch,
        archived: data.archived,
        url: `https://github.com/${owner}/${repo}`,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetCryptoInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  let coin = String(args.coin).toLowerCase().trim();
  const symbolMap: Record<string, string> = {
    btc: "bitcoin",
    eth: "ethereum",
    sol: "solana",
    ada: "cardano",
    dot: "polkadot",
    doge: "dogecoin",
    xrp: "ripple",
    matic: "matic-network",
    link: "chainlink",
    avax: "avalanche-2",
  };
  coin = symbolMap[coin] || coin;
  try {
    const res = await fetchRetry(
      `https://api.coingecko.com/api/v3/coins/${coin}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
      {
        signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json" },
      },
    );
    if (!res.ok) return { success: false, data: `Crypto "${coin}" introuvable sur CoinGecko` };
    const data = (await res.json()) as {
      name: string;
      symbol: string;
      market_cap_rank: number;
      market_data: {
        current_price: { usd: number; eur: number };
        market_cap: { usd: number; eur: number };
        total_volume: { usd: number };
        price_change_percentage_24h: number;
        price_change_percentage_7d: number;
        high_24h: { usd: number };
        low_24h: { usd: number };
        circulating_supply: number;
        total_supply: number | null;
      };
      description: { en: string };
      image: { small: string };
    };
    const md = data.market_data;
    return {
      success: true,
      data: JSON.stringify({
        name: data.name,
        symbol: data.symbol.toUpperCase(),
        rank: data.market_cap_rank,
        priceUSD: md.current_price.usd,
        priceEUR: md.current_price.eur,
        marketCapEUR: md.market_cap.eur?.toLocaleString("fr-FR"),
        volume24h: md.total_volume.usd?.toLocaleString("fr-FR"),
        change24h: md.price_change_percentage_24h?.toFixed(2) + "%",
        change7d: md.price_change_percentage_7d?.toFixed(2) + "%",
        high24h: md.high_24h.usd,
        low24h: md.low_24h.usd,
        circulating: md.circulating_supply?.toLocaleString("fr-FR"),
        total: md.total_supply?.toLocaleString("fr-FR") || "N/A",
        description: data.description?.en?.slice(0, 500) || "N/A",
        image: data.image?.small,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Dev Tools ───────────────────────────────────────────────────────────────

async function tGetNpmPackage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const name = String(args.name);
  try {
    const res = await fetchRetry(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Paquet npm "${name}" introuvable` };
    const d = (await res.json()) as {
      name: string;
      version: string;
      description: string;
      license: string;
      homepage: string;
      dependencies: Record<string, string>;
    };
    return {
      success: true,
      data: JSON.stringify({
        name: d.name,
        version: d.version,
        description: d.description || "N/A",
        license: d.license || "N/A",
        homepage: d.homepage || `https://npmjs.com/package/${name}`,
        dependencies: Object.keys(d.dependencies || {}).length,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetPypiPackage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const name = String(args.name);
  try {
    const res = await fetchRetry(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Paquet PyPI "${name}" introuvable` };
    const d = (await res.json()) as {
      info: {
        name: string;
        version: string;
        summary: string;
        author: string;
        license: string;
        home_page: string;
        requires_python: string;
      };
    };
    const i = d.info;
    return {
      success: true,
      data: JSON.stringify({
        name: i.name,
        version: i.version,
        summary: i.summary || "N/A",
        author: i.author || "N/A",
        license: i.license || "N/A",
        homepage: i.home_page || `https://pypi.org/project/${name}/`,
        python: i.requires_python || "N/A",
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetGithubUser(args: Record<string, unknown>): Promise<ToolCallResult> {
  const username = String(args.username);
  const ck = `ghuser:${username}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetchRetry(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: { "User-Agent": "DiscordBot/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Utilisateur GitHub "${username}" introuvable` };
    const d = (await res.json()) as {
      login: string;
      name: string;
      bio: string;
      public_repos: number;
      followers: number;
      following: number;
      html_url: string;
      avatar_url: string;
      company: string;
      location: string;
      created_at: string;
    };
    const output = JSON.stringify({
      username: d.login,
      name: d.name || d.login,
      bio: d.bio || "Pas de bio",
      repos: d.public_repos,
      followers: d.followers,
      following: d.following,
      url: d.html_url,
      avatar: d.avatar_url,
      company: d.company || "N/A",
      location: d.location || "N/A",
      joined: d.created_at,
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

async function tShortenUrl(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url.startsWith("http")) return { success: false, data: "URL invalide" };
  try {
    const res = await fetchRetry(
      `https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`,
      {
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return { success: false, data: "Raccourcissement indisponible" };
    const d = (await res.json()) as { shorturl?: string; errormessage?: string };
    if (d.errormessage) return { success: false, data: d.errormessage };
    return { success: true, data: d.shorturl || "Échec" };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetQrCode(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text);
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=300`;
  return { success: true, data: JSON.stringify({ qrUrl, content: text }) };
}

async function tGetRandomUser(): Promise<ToolCallResult> {
  try {
    const res = await fetchRetry("https://randomuser.me/api/?nat=fr", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "RandomUser indisponible" };
    const d = (await res.json()) as {
      results: Array<{
        name: { first: string; last: string };
        email: string;
        phone: string;
        gender: string;
        picture: { large: string };
        location: { city: string; country: string };
      }>;
    };
    if (!d.results[0]) return { success: false, data: "Pas de profil" };
    const u = d.results[0];
    return {
      success: true,
      data: JSON.stringify({
        name: `${u.name.first} ${u.name.last}`,
        email: u.email,
        phone: u.phone,
        gender: u.gender,
        city: u.location.city,
        country: u.location.country,
        avatar: u.picture.large,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Discord Native Tools ────────────────────────────────────────────────────

async function tKickUser(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const reason = String(args.reason || "Expulsion par agent IA");
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Utilisateur introuvable" };
  await member.kick(`[Agent IA] ${reason}`.slice(0, 512));
  await prisma.sanction
    .create({
      data: { guildId: ctx.guildId, userId, moderatorId: "AI_AGENT", type: "KICK", reason },
    })
    .catch(() => {});
  return { success: true, data: `Utilisateur <@${userId}> expulsé. Raison: ${reason}` };
}

async function tBanUser(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const reason = String(args.reason || "Bannissement par agent IA");
  const deleteDays = Math.min(7, Number(args.deleteMessageDays) || 7);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  await guild.members.ban(userId, {
    reason: `[Agent IA] ${reason}`.slice(0, 512),
    deleteMessageSeconds: deleteDays * 86400,
  });
  await prisma.sanction
    .create({
      data: { guildId: ctx.guildId, userId, moderatorId: "AI_AGENT", type: "BAN", reason },
    })
    .catch(() => {});
  return { success: true, data: `Utilisateur <@${userId}> banni. Raison: ${reason}` };
}

async function tAddRole(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const roleId = String(args.roleId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Utilisateur introuvable" };
  await member.roles.add(roleId).catch(() => {
    throw new Error("Impossible d'ajouter le rôle (permissions?)");
  });
  return { success: true, data: `Rôle ${roleId} ajouté à <@${userId}>` };
}

async function tRemoveRole(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const roleId = String(args.roleId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Utilisateur introuvable" };
  await member.roles.remove(roleId).catch(() => {
    throw new Error("Impossible de retirer le rôle (permissions?)");
  });
  return { success: true, data: `Rôle ${roleId} retiré de <@${userId}>` };
}

async function tCreateChannel(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const name = String(args.name).toLowerCase().replace(/\s+/g, "-").slice(0, 100);
  const topic = args.topic ? String(args.topic) : undefined;
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = await guild.channels.create({ name, type: ChannelType.GuildText, topic });
  return {
    success: true,
    data: JSON.stringify({ name: channel.name, id: channel.id, topic: topic || null }),
  };
}

async function tDeleteChannel(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return { success: false, data: "Salon introuvable" };
  await channel.delete("[Agent IA] Suppression demandée").catch(() => {
    throw new Error("Permissions insuffisantes");
  });
  return { success: true, data: `Salon ${channelId} supprimé` };
}

async function tSetChannelTopic(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  const topic = String(args.topic);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildText)
    return { success: false, data: "Salon textuel introuvable" };
  await (channel as import("discord.js").TextChannel).setTopic(topic);
  return { success: true, data: `Topic du salon ${channelId} mis à jour` };
}

async function tCreateInvite(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channelId = args.channelId ? String(args.channelId) : ctx.channelId;
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return { success: false, data: "Salon introuvable" };
  if (!("createInvite" in channel))
    return { success: false, data: "Ce salon ne supporte pas les invitations" };
  const maxAgeNum = Number(args.maxAge);
  const maxAge = Number.isNaN(maxAgeNum) ? 86400 : maxAgeNum;
  const maxUsesNum = Number(args.maxUses);
  const maxUses = Number.isNaN(maxUsesNum) ? 0 : maxUsesNum;
  const invite = await (channel as import("discord.js").TextChannel).createInvite({
    maxAge,
    maxUses,
    unique: true,
  });
  return {
    success: true,
    data: JSON.stringify({
      url: `https://discord.gg/${invite.code}`,
      code: invite.code,
      maxAge,
      maxUses,
    }),
  };
}

async function tGetMemberInfo(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Membre introuvable" };
  return {
    success: true,
    data: JSON.stringify({
      username: member.user.username,
      displayName: member.displayName,
      id: member.id,
      joinedAt: member.joinedAt?.toISOString(),
      createdAt: member.user.createdAt.toISOString(),
      roles: member.roles.cache
        .map((r) => ({ id: r.id, name: r.name, color: r.color }))
        .filter((r) => r.name !== "@everyone"),
      nickname: member.nickname || null,
      isBot: member.user.bot,
      premiumSince: member.premiumSince?.toISOString() || null,
    }),
  };
}

async function tGetServerRoles(ctx: ToolContext): Promise<ToolCallResult> {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const roles = guild.roles.cache
    .sorted((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      members: r.members.size,
      hoist: r.hoist,
      mentionable: r.mentionable,
    }))
    .filter((r) => r.name !== "@everyone");
  return { success: true, data: JSON.stringify(roles.slice(0, 30)) };
}

async function tSetNickname(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const nickname = String(args.nickname);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Membre introuvable" };
  await member.setNickname(nickname || null, "[Agent IA]").catch(() => {
    throw new Error("Permissions insuffisantes");
  });
  return { success: true, data: `Surnom de <@${userId}> changé en "${nickname}"` };
}

async function tSendDM(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const message = String(args.message).slice(0, 2000);
  const user = await ctx.client.users.fetch(userId).catch(() => null);
  if (!user) return { success: false, data: "Utilisateur introuvable" };
  await user.send(message).catch(() => {
    throw new Error("MP bloqués par l'utilisateur");
  });
  return { success: true, data: `Message privé envoyé à <@${userId}>` };
}

async function tCreateEmbed(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const { EmbedBuilder } = await import("discord.js");
  const title = String(args.title);
  const description = String(args.description);
  const color = Number(args.color) || 0x4285f4;
  const embed = new EmbedBuilder()
    .setTitle(title.slice(0, 256))
    .setDescription(description.slice(0, 4096))
    .setColor(color);
  if (args.fields) {
    try {
      const fields = JSON.parse(String(args.fields)) as Array<{
        name: string;
        value: string;
        inline?: boolean;
      }>;
      for (const f of fields.slice(0, 25))
        embed.addFields({
          name: f.name.slice(0, 256),
          value: f.value.slice(0, 1024),
          inline: f.inline || false,
        });
    } catch {
      /* ignore bad fields */
    }
  }
  const channel = ctx.client.channels.cache.get(ctx.channelId);
  if (!channel || !channel.isTextBased()) return { success: false, data: "Salon introuvable" };
  await (channel as import("discord.js").TextChannel).send({ embeds: [embed] });
  return { success: true, data: "Embed envoyé" };
}

async function tGetVoiceChannels(ctx: ToolContext): Promise<ToolCallResult> {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const voiceChannels = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
    .map((c) => {
      const vc = c as import("discord.js").VoiceBasedChannel;
      return {
        id: vc.id,
        name: vc.name,
        members: vc.members.size,
        memberNames: vc.members.map((m) => m.displayName),
      };
    });
  return { success: true, data: JSON.stringify(voiceChannels) };
}

async function tLockChannel(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = guild.channels.cache.get(channelId) as
    import("discord.js").TextChannel | undefined;
  if (!channel) return { success: false, data: "Salon introuvable" };
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
  return { success: true, data: `Salon ${channel.name} verrouillé` };
}

async function tUnlockChannel(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = guild.channels.cache.get(channelId) as
    import("discord.js").TextChannel | undefined;
  if (!channel) return { success: false, data: "Salon introuvable" };
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
  return { success: true, data: `Salon ${channel.name} déverrouillé` };
}

async function tGetEmojis(ctx: ToolContext): Promise<ToolCallResult> {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const emojis = guild.emojis.cache.map((e) => ({
    name: e.name,
    id: e.id,
    animated: e.animated,
    url: e.imageURL(),
  }));
  return { success: true, data: JSON.stringify(emojis.slice(0, 50)) };
}

async function tGetAuditLog(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const limit = Math.min(25, Math.max(1, Number(args.limit) || 5));
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const logs = await guild.fetchAuditLogs({ limit }).catch(() => null);
  if (!logs) return { success: false, data: "Logs d'audit indisponibles (permissions?)" };
  const { User } = await import("discord.js");
  const entries = logs.entries.map((e) => ({
    action: e.action,
    executor: e.executor?.tag,
    target: e.target instanceof User ? e.target.tag : String(e.targetId ?? "unknown"),
    reason: e.reason,
    createdAt: e.createdAt.toISOString(),
  }));
  return { success: true, data: JSON.stringify(entries) };
}

// ─── Bot Feature Tools ───────────────────────────────────────────────────────

async function tSearchGifs(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  try {
    const { searchGifs } = await import("./externalApis.js");
    const gifs = await searchGifs(query, 5);
    if (gifs.length === 0) return { success: false, data: "Aucun GIF trouvé" };
    return {
      success: true,
      data: JSON.stringify(gifs.map((g) => ({ url: g.url, title: g.title }))),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tCheckToxicity(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text);
  try {
    const { analyzeToxicity } = await import("./ai-moderation.js");
    const result = await analyzeToxicity(text);
    return { success: true, data: JSON.stringify(result) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetRiskProfile(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  try {
    const profile = await prisma.riskProfile.findUnique({
      where: { userId_guildId: { userId, guildId: ctx.guildId } },
    });
    if (!profile)
      return {
        success: true,
        data: JSON.stringify({ userId, riskScore: 0, riskLevel: "INCONNU", underWatch: false }),
      };
    return {
      success: true,
      data: JSON.stringify({
        userId,
        riskScore: profile.riskScore,
        riskLevel: profile.riskLevel,
        underWatch: profile.underWatch,
        lastUpdated: profile.updatedAt.toISOString(),
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tCheckPhishing(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  try {
    const { checkSuspiciousLinksDetailed } = await import("../commands/security.js");
    const result = await checkSuspiciousLinksDetailed(url);
    return { success: true, data: JSON.stringify(result) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Agent Autonome Tools ────────────────────────────────────────────────────

async function tAnalyzeImage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imageUrl = String(args.image_url);
  const question = args.question ? String(args.question) : "Décris cette image en détail.";

  try {
    const { getOpenAIClient } = await import("./ai.js");
    const { config } = await import("../config.js");
    const client = getOpenAIClient();

    const response = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: question },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      },
      { timeout: 15_000 },
    );

    const description = response.choices[0]?.message?.content || "Analyse impossible";
    return {
      success: true,
      data: JSON.stringify({ imageUrl, question, analysis: description.slice(0, 1500) }),
    };
  } catch (e) {
    return {
      success: false,
      data: `Erreur analyse image: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tAnalyzeSentiment(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text).slice(0, 1000);

  try {
    const { analyzeToxicity } = await import("./ai-moderation.js");
    const toxicityResult = await analyzeToxicity(text);

    const score = toxicityResult?.confidence ?? 0;
    let mood = "neutre";
    let riskLevel = "faible";

    if (score > 0.8) {
      mood = "très agressif";
      riskLevel = "critique";
    } else if (score > 0.6) {
      mood = "agressif";
      riskLevel = "élevé";
    } else if (score > 0.4) {
      mood = "négatif";
      riskLevel = "moyen";
    } else if (score > 0.2) {
      mood = "légèrement négatif";
      riskLevel = "faible";
    } else {
      mood = "positif/neutre";
      riskLevel = "aucun";
    }

    return {
      success: true,
      data: JSON.stringify({
        text: text.slice(0, 200),
        toxicityScore: score,
        mood,
        riskLevel,
        details: toxicityResult,
      }),
    };
  } catch (_e) {
    const lower = text.toLowerCase();
    const negativeWords = [
      "merde",
      "putain",
      "connard",
      "salope",
      "nul",
      "déteste",
      "haine",
      "stupide",
    ];
    const positiveWords = ["bien", "super", "génial", "merci", "j'aime", "excellent", "parfait"];
    const negCount = negativeWords.filter((w) => lower.includes(w)).length;
    const posCount = positiveWords.filter((w) => lower.includes(w)).length;
    const score = negCount / Math.max(1, negCount + posCount);
    const mood = score > 0.5 ? "négatif" : score < 0.3 ? "positif" : "neutre";

    return {
      success: true,
      data: JSON.stringify({
        text: text.slice(0, 200),
        toxicityScore: score,
        mood,
        riskLevel: score > 0.5 ? "élevé" : "faible",
        method: "fallback",
      }),
    };
  }
}

async function tTriggerGC(): Promise<ToolCallResult> {
  try {
    const memBefore = process.memoryUsage();
    if (global.gc) {
      global.gc();
      const memAfter = process.memoryUsage();
      const savedMB = Math.round((memBefore.heapUsed - memAfter.heapUsed) / 1024 / 1024);
      return {
        success: true,
        data: JSON.stringify({
          triggered: true,
          heapBeforeMB: Math.round(memBefore.heapUsed / 1024 / 1024),
          heapAfterMB: Math.round(memAfter.heapUsed / 1024 / 1024),
          savedMB,
        }),
      };
    } else {
      return {
        success: true,
        data: JSON.stringify({
          triggered: false,
          reason: "GC non forcé (lancer avec --expose-gc)",
          heapUsedMB: Math.round(memBefore.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memBefore.heapTotal / 1024 / 1024),
          rssMB: Math.round(memBefore.rss / 1024 / 1024),
        }),
      };
    }
  } catch (e) {
    return { success: false, data: `Erreur GC: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Agent Proactive Tools ───────────────────────────────────────────────────

async function tSummarizeConversation(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const channelId = String(args.channel_id);
  const messageCount = Math.min(Number(args.message_count) || 50, 100);

  try {
    const channel = await ctx.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      return { success: false, data: "Salon introuvable ou non textuel" };
    }

    const messages = await (channel as any).messages.fetch({ limit: messageCount });
    if (messages.size === 0) {
      return {
        success: true,
        data: JSON.stringify({ summary: "Aucun message à résumer.", messageCount: 0 }),
      };
    }

    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const { sanitizePromptInput } = await import("../utils/promptSanitizer.js");
    const conversationText = sorted
      .map((m) => `[${m.author.username}]: ${sanitizePromptInput(m.content.slice(0, 200))}`)
      .join("\n")
      .slice(0, 3000);

    const { getOpenAIClient } = await import("./ai.js");
    const { config } = await import("../config.js");
    const client = getOpenAIClient();

    const response = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "system",
            content:
              "Tu es un assistant qui résume des conversations Discord. Fais un résumé concis en français avec: 1) Les sujets principaux discutés 2) Les décisions prises 3) Les points en suspens. Format: bullet points.",
          },
          { role: "user", content: `Résume cette conversation:\n\n${conversationText}` },
        ],
        max_tokens: 500,
        temperature: 0.3,
      },
      { timeout: 15_000 },
    );

    const summary = response.choices[0]?.message?.content || "Résumé impossible";
    return {
      success: true,
      data: JSON.stringify({
        summary: summary.slice(0, 1500),
        messageCount: sorted.length,
        channelId,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur résumé: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tDetectLanguage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text).slice(0, 500);

  const languagePatterns: Record<string, RegExp[]> = {
    fr: [
      /\b(le|la|les|du|de|des|et|ou|ne|pas|que|qui|dans|pour|avec|sans|sur|une|un|ce|cette|mon|ton|son|nous|vous|ils|elles|sont|avoir|être|fait|fois|toujours|jamais|encore)\b/gi,
    ],
    en: [
      /\b(the|and|or|not|that|who|in|for|with|without|on|a|an|this|my|your|his|we|you|they|are|have|be|do|does|did|always|never|still|again)\b/gi,
    ],
    es: [
      /\b(el|la|los|las|de|del|y|o|no|que|quien|en|para|con|sin|sobre|un|una|este|esta|mi|tu|su|nosotros|vosotros|ellos|son|tener|ser|hace|vez|siempre|nunca)\b/gi,
    ],
    de: [
      /\b(der|die|das|und|oder|nicht|dass|wer|in|für|mit|ohne|auf|ein|eine|dieser|diese|mein|dein|sein|wir|ihr|sie|sind|haben|sein|macht|mal|immer|nie)\b/gi,
    ],
    it: [
      /\b(il|la|i|le|di|del|e|o|non|che|chi|in|per|con|senza|su|un|una|questo|questa|mio|tuo|suo|noi|voi|loro|sono|avere|essere|fa|volta|sempre|mai)\b/gi,
    ],
    pt: [
      /\b(o|a|os|as|de|do|da|e|ou|não|que|quem|em|para|com|sem|sobre|um|uma|este|esta|meu|teu|seu|nós|vós|eles|são|ter|ser|faz|vez|sempre|nunca)\b/gi,
    ],
    ru: [/[\u0400-\u04FF]/g],
    ja: [/[\u3040-\u309F\u30A0-\u30FF]/g],
    ko: [/[\uAC00-\uD7AF]/g],
    zh: [/[\u4E00-\u9FFF]/g],
    ar: [/[\u0600-\u06FF]/g],
  };

  const scores: Record<string, number> = {};
  for (const [lang, patterns] of Object.entries(languagePatterns)) {
    let count = 0;
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) count += matches.length;
    }
    if (count > 0) scores[lang] = count;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const detected = sorted[0]?.[0] || "unknown";
  const confidence = sorted[0]
    ? Math.round((sorted[0][1] / Math.max(1, text.split(/\s+/).length)) * 100)
    : 0;

  return {
    success: true,
    data: JSON.stringify({
      detectedLanguage: detected,
      confidence: Math.min(confidence, 100),
      textPreview: text.slice(0, 100),
      allScores: scores,
    }),
  };
}

async function tGetServerInsights(ctx: ToolContext): Promise<ToolCallResult> {
  try {
    const guild = ctx.client.guilds.cache.get(ctx.guildId);
    if (!guild) {
      return { success: false, data: "Aucun serveur disponible" };
    }

    const members = guild.members.cache;
    const channels = guild.channels.cache;
    const roles = guild.roles.cache;

    const botCount = members.filter((m: { user: { bot: boolean } }) => m.user.bot).size;
    const humanCount = members.size - botCount;

    const textChannels = channels.filter((c: { type: number }) => c.type === 0).size;
    const voiceChannels = channels.filter((c: { type: number }) => c.type === 2).size;
    const categories = channels.filter((c: { type: number }) => c.type === 4).size;

    const roleDistribution = roles
      .filter(
        (r: { name: string; members: { size: number } }) =>
          r.name !== "@everyone" && r.members.size > 0,
      )
      .sort(
        (a: { members: { size: number } }, b: { members: { size: number } }) =>
          b.members.size - a.members.size,
      )
      .first(10)
      .map((r: { name: string; members: { size: number }; hexColor: string }) => ({
        name: r.name,
        memberCount: r.members.size,
        color: r.hexColor,
      }));

    const createdAt = guild.createdAt.toISOString();
    const ageDays = Math.floor((Date.now() - guild.createdAt.getTime()) / (1000 * 60 * 60 * 24));

    return {
      success: true,
      data: JSON.stringify({
        guildName: guild.name,
        guildId: guild.id,
        totalMembers: members.size,
        humanMembers: humanCount,
        botMembers: botCount,
        textChannels,
        voiceChannels,
        categories,
        totalRoles: roles.size,
        topRoles: roleDistribution,
        createdAt,
        ageDays,
        memberGrowthPerDay: Math.round((members.size / Math.max(1, ageDays)) * 100) / 100,
        verificationLevel: guild.verificationLevel,
        premiumTier: guild.premiumTier,
      }),
    };
  } catch (e) {
    return {
      success: false,
      data: `Erreur server insights: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ─── OpenRouter MCP Tools ────────────────────────────────────────────────────

async function tOrListModels(args: Record<string, unknown>): Promise<ToolCallResult> {
  const models = await mcpListModels({
    modality: args.modality as string | undefined,
    provider: args.provider as string | undefined,
    min_context: args.min_context as number | undefined,
    free_only: args.free_only as boolean | undefined,
  });
  if (models.length === 0)
    return { success: false, data: "Aucun modèle trouvé ou MCP indisponible" };
  const summary = models
    .slice(0, 20)
    .map((m) => `${m.id} | ctx: ${m.context_length} | $${m.pricing?.prompt || "?"}/1M prompt`)
    .join("\n");
  return { success: true, data: `${models.length} modèles trouvés (top 20):\n${summary}` };
}

async function tOrModelInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const modelId = String(args.model_id || "");
  if (!modelId) return { success: false, data: "model_id requis" };
  const model = await mcpGetModel(modelId);
  if (!model) return { success: false, data: `Modèle ${modelId} introuvable` };
  return {
    success: true,
    data: JSON.stringify({
      id: model.id,
      name: model.name,
      context_length: model.context_length,
      pricing: model.pricing,
      modality: model.architecture?.modality,
      supported_parameters: model.supported_parameters,
    }),
  };
}

async function tOrBenchmarks(args: Record<string, unknown>): Promise<ToolCallResult> {
  const benchmarks = await mcpGetBenchmarks(args.category as string | undefined);
  if (benchmarks.length === 0) return { success: false, data: "Aucun benchmark disponible" };
  const summary = benchmarks
    .slice(0, 15)
    .map((b) => `${b.model_id}: ${b.score} (${b.category}, source: ${b.source})`)
    .join("\n");
  return { success: true, data: `Benchmarks (${benchmarks.length}):\n${summary}` };
}

async function tOrRankings(): Promise<ToolCallResult> {
  const rankings = await mcpGetRankings();
  if (rankings.length === 0) return { success: false, data: "Classement indisponible" };
  const summary = rankings
    .slice(0, 10)
    .map((r) => `#${r.rank}: ${r.model_id} (${r.token_volume} tokens)`)
    .join("\n");
  return { success: true, data: `Top 10 modèles aujourd'hui:\n${summary}` };
}

async function tOrChatTest(args: Record<string, unknown>): Promise<ToolCallResult> {
  const model = String(args.model || "");
  const prompt = String(args.prompt || "");
  const maxTokens = (args.max_tokens as number) || 500;
  if (!model || !prompt) return { success: false, data: "model et prompt requis" };
  const result = await mcpChatSend(model, prompt, maxTokens);
  if (!result) return { success: false, data: `Échec du test sur ${model}` };
  return {
    success: true,
    data: JSON.stringify({
      model: result.model,
      content: result.content.slice(0, 500),
      cost: result.cost,
      tokens: result.tokens,
      provider: result.provider,
    }),
  };
}

async function tOrDocsSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "");
  if (!query) return { success: false, data: "query requis" };
  const results = await mcpSearchDocs(query);
  if (results.length === 0) return { success: false, data: "Aucun résultat dans la doc" };
  const summary = results
    .slice(0, 5)
    .map((r) => `${r.title}: ${r.snippet.slice(0, 150)}${r.url ? ` (${r.url})` : ""}`)
    .join("\n");
  return { success: true, data: `Résultats doc:\n${summary}` };
}

async function tOrCredits(): Promise<ToolCallResult> {
  const credits = await mcpGetCredits();
  if (credits === null) return { success: false, data: "Crédits indisponibles (MCP non connecté)" };
  return { success: true, data: `Crédits restants: $${credits.toFixed(2)}` };
}

// ─── Secure DM-Exclusive: Wi-Fi QR Generator ─────────────────────────────────

async function tGenerateWifiQr(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  // ─── CHANNEL GUARD: DM-only enforcement ───
  if (!ctx.message.channel.isDMBased()) {
    logger.warn(
      `[AgentToolsExt] 🚫 generate_wifi_qr blocked — channel is not DM (type: ${ctx.message.channel.type})`,
    );
    return {
      success: false,
      data: "🚫 Security Violation: This network provisioning tool can only be executed within private Direct Messages (DMs) to protect sensitive environment credentials.",
    };
  }

  const ssid = String(args.ssid ?? "").trim();
  const password = String(args.password ?? "").trim();
  const encryptionType = String(args.encryptionType ?? "WPA")
    .trim()
    .toUpperCase();

  if (!ssid) return { success: false, data: "SSID requis" };
  if (!password && encryptionType !== "nopass")
    return { success: false, data: "Mot de passe requis" };

  const validEncryptions = ["WPA", "WEP", "nopass"];
  if (!validEncryptions.includes(encryptionType)) {
    return { success: false, data: "Type de chiffrement invalide. Utilisez: WPA, WEP, ou nopass" };
  }

  // Build WiFi QR string: WIFI:T:WPA;S:mynetwork;P:mypass;;
  const escapedSsid = ssid.replace(/([\\;,:"])/g, "\\$1");
  const escapedPass = password.replace(/([\\;,:"])/g, "\\$1");
  const wifiString = `WIFI:T:${encryptionType};S:${escapedSsid};P:${escapedPass};;`;

  // Generate QR code via public API (qrcode.monster — free, no key)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(wifiString)}`;

  logger.info(
    `[AgentToolsExt] 📶 WiFi QR generated for SSID: ${ssid} (encryption: ${encryptionType})`,
  );

  return {
    success: true,
    data: `📶 QR Code WiFi généré pour "${ssid}" (${encryptionType})\n\nScanne ce QR code avec ton téléphone pour te connecter automatiquement:\n${qrUrl}\n\n⚠️ Ce lien contient vos identifiants — ne le partage pas.`,
  };
}

// ─── New Tools (Part A) ──────────────────────────────────────────────────────

async function tSolveMathAdvanced(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "").trim();
  if (!query) {
    return {
      success: false,
      data: "Requête vide. Ex: 'derive x^2 + 3x', 'integrate sin(x)', 'convert 5 km to miles'",
    };
  }

  const appId = process.env.WOLFRAM_APP_ID || "";
  if (!appId) {
    return {
      success: false,
      data: "Wolfram Alpha non configuré (WOLFRAM_APP_ID manquant dans .env)",
    };
  }

  try {
    const url = `https://api.wolframalpha.com/v2/query?input=${encodeURIComponent(query)}&format=plaintext&output=JSON&appid=${appId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      return { success: false, data: `Wolfram Alpha erreur HTTP ${res.status}` };
    }

    const data = (await res.json()) as {
      queryresult?: {
        success?: boolean;
        pods?: Array<{ title?: string; subpods?: Array<{ plaintext?: string }> }>;
        error?: string;
      };
    };
    const qr = data.queryresult;
    if (!qr || !qr.success) {
      return { success: false, data: `Wolfram Alpha n'a pas pu interpréter: "${query}"` };
    }

    const pods = qr.pods || [];
    const resultPod = pods.find((p) => p.title === "Result" || p.title === "Résultat");
    const inputPod = pods.find((p) => p.title === "Input" || p.title === "Input interpretation");

    let output = "";
    if (inputPod?.subpods?.[0]?.plaintext) {
      output += `**Input:** ${inputPod.subpods[0].plaintext}\n`;
    }
    if (resultPod?.subpods?.[0]?.plaintext) {
      output += `**Result:** ${resultPod.subpods[0].plaintext}\n`;
    }
    // Fallback: show all pods
    if (!output) {
      for (const pod of pods.slice(0, 5)) {
        const text = pod.subpods?.[0]?.plaintext;
        if (text) output += `**${pod.title}:** ${text}\n`;
      }
    }

    return { success: true, data: output || "Aucun résultat exploitable de Wolfram Alpha." };
  } catch (err) {
    return {
      success: false,
      data: `Erreur Wolfram Alpha: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function tTranslateTextDeepL(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "").trim();
  const targetLang = String(args.targetLang || "FR").toUpperCase() as
    "FR" | "EN" | "DE" | "ES" | "IT" | "PT" | "NL" | "PL" | "RU" | "JA" | "KO" | "ZH";
  const sourceLang = args.sourceLang
    ? (String(args.sourceLang).toUpperCase() as
        | "FR"
        | "EN"
        | "DE"
        | "ES"
        | "IT"
        | "PT"
        | "NL"
        | "PL"
        | "RU"
        | "JA"
        | "KO"
        | "ZH"
        | undefined)
    : undefined;

  if (!text) {
    return { success: false, data: "Texte vide à traduire." };
  }
  if (text.length > 5000) {
    return { success: false, data: "Texte trop long (max 5000 caractères pour DeepL)." };
  }

  const result = await deeplTranslate(text, targetLang, sourceLang);
  if (result === text) {
    return {
      success: false,
      data: "DeepL non configuré (DEEPL_API_KEY manquant) ou erreur. Texte retourné inchangé.",
    };
  }

  return {
    success: true,
    data: `🌐 Traduction DeepL (${sourceLang || "auto"} → ${targetLang}):\n\n${result}`,
  };
}

// ─── IP Toolkit Handlers ─────────────────────────────────────────────────────

async function tIpPing(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ip = String(args.ip);
  const count = typeof args.count === "number" ? args.count : 4;
  const validation = validateTargetIP(ip);
  if (!validation.valid) {
    return { success: false, data: `❌ ${validation.reason}` };
  }
  const result = await pingIP(ip, count);
  if (result.alive) {
    return {
      success: true,
      data: `📡 Ping ${ip}: ✅ Actif — Latence: ${result.latencyMs ?? "N/A"}ms — Paquets: ${result.packetsReceived}/${result.packetsSent}`,
    };
  }
  return { success: false, data: `📡 Ping ${ip}: ❌ Inactif ou ne répond pas` };
}

async function tIpTraceroute(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ip = String(args.ip);
  const maxHops = typeof args.maxHops === "number" ? args.maxHops : 15;
  const validation = validateTargetIP(ip);
  if (!validation.valid) {
    return { success: false, data: `❌ ${validation.reason}` };
  }
  const result = await tracerouteIP(ip, maxHops);
  if (!result.success) {
    return { success: false, data: `📡 Traceroute ${ip}: ❌ Échec — ${result.raw.slice(0, 200)}` };
  }
  const hopsStr = result.hops.map((h) => `${h.hop}. ${h.ip} (${h.latencyMs})`).join("\n");
  return { success: true, data: `📡 Traceroute ${ip} (${result.hops.length} hops):\n${hopsStr}` };
}

async function tIpPortScan(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ip = String(args.ip);
  const ports = Array.isArray(args.ports) ? args.ports.map(Number) : undefined;
  const validation = validateTargetIP(ip);
  if (!validation.valid) {
    return { success: false, data: `❌ ${validation.reason}` };
  }
  const result = await portScanIP(ip, ports);
  if (result.openPorts.length === 0) {
    return {
      success: true,
      data: `🚪 Port scan ${ip}: Aucun port ouvert trouvé (${result.scannedPorts} ports scannés en ${result.durationMs}ms)`,
    };
  }
  const portsStr = result.openPorts.map((p) => `${p.port} (${p.service})`).join(", ");
  return {
    success: true,
    data: `🚪 Port scan ${ip}: ${result.openPorts.length} ports ouverts — ${portsStr} (${result.durationMs}ms)`,
  };
}

async function tIpHttpCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ip = String(args.ip);
  const port = typeof args.port === "number" ? args.port : 80;
  const useSSL = args.useSSL === true;
  const validation = validateTargetIP(ip);
  if (!validation.valid) {
    return { success: false, data: `❌ ${validation.reason}` };
  }
  const result = await checkHttpHeaders(ip, port, useSSL);
  if (!result.success) {
    return {
      success: false,
      data: `🌐 HTTP ${ip}:${port}: ❌ ${result.error || "Connexion échouée"}`,
    };
  }
  const sec = result.securityHeaders;
  const secStr = `HSTS:${sec.hasHSTS ? "✅" : "❌"} CSP:${sec.hasCSP ? "✅" : "❌"} X-Frame:${sec.hasXFrameOptions ? "✅" : "❌"} X-CTO:${sec.hasXContentTypeOptions ? "✅" : "❌"}`;
  return {
    success: true,
    data: `🌐 HTTP ${result.url}: ${result.statusCode} — Server: ${result.server || "N/A"} — ${result.responseTimeMs}ms\nSecurity: ${secStr}`,
  };
}

async function tIpSslCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ip = String(args.ip);
  const port = typeof args.port === "number" ? args.port : 443;
  const validation = validateTargetIP(ip);
  if (!validation.valid) {
    return { success: false, data: `❌ ${validation.reason}` };
  }
  const result = await checkSSL(ip, port);
  if (!result.hasCertificate) {
    return {
      success: false,
      data: `📜 SSL ${ip}:${port}: ❌ ${result.error || "Aucun certificat"}`,
    };
  }
  return {
    success: true,
    data: `📜 SSL ${ip}:${port}: Subject: ${result.subject} — Issuer: ${result.issuer} — Expire: ${result.validTo ? new Date(result.validTo).toLocaleDateString("fr-FR") : "N/A"} (${result.daysUntilExpiry}j restants) — ${result.isExpired ? "⚠️ Expiré" : "✅ Valide"}${result.selfSigned ? " — ⚠️ Self-signed" : ""}`,
  };
}

async function tIpFullReport(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ip = String(args.ip);
  const validation = validateTargetIP(ip);
  if (!validation.valid) {
    return { success: false, data: `❌ ${validation.reason}` };
  }
  const report = await fullIPReport(ip);
  const formatted = formatIPReport(report);
  return { success: true, data: formatted.slice(0, 4000) };
}

// ─── Net Toolkit Handlers ────────────────────────────────────────────────────

async function tDnsLookupFull(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain);
  const types = Array.isArray(args.types) ? args.types.map(String) : undefined;
  if (!domain) return { success: false, data: "❌ Domaine requis" };
  const result = await dnsLookup(domain, types);
  if (!result.success) {
    return {
      success: false,
      data: `🔍 DNS ${domain}: ❌ ${result.error || "Aucun record trouvé"}`,
    };
  }
  const recordsStr = result.records.map((r) => `${r.type}: ${r.value}`).join("\n");
  return {
    success: true,
    data: `🔍 DNS ${domain} (${result.records.length} records):\n${recordsStr}`,
  };
}

async function tBannerGrab(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ip = String(args.ip);
  const port = typeof args.port === "number" ? args.port : 80;
  const validation = validateTargetIP(ip);
  if (!validation.valid) {
    return { success: false, data: `❌ ${validation.reason}` };
  }
  const result = await grabBanner(ip, port);
  if (!result.success) {
    return {
      success: false,
      data: `🚩 Banner ${ip}:${port}: ❌ ${result.error || "Pas de réponse"}`,
    };
  }
  return {
    success: true,
    data: `🚩 Banner ${ip}:${port}:\n\`\`\`\n${result.banner?.slice(0, 300) || "vide"}\n\`\`\``,
  };
}

async function tHttpMethodsCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url) return { success: false, data: "❌ URL requise" };
  const result = await checkHttpMethods(url);
  return {
    success: result.success,
    data: `🔧 HTTP Methods ${url}:\nAutorisées: ${result.allowedMethods.join(", ") || "aucune"}\nTestées: ${result.testedMethods.join(", ")}`,
  };
}

async function tDirectoryCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const baseUrl = String(args.baseUrl);
  const paths = Array.isArray(args.paths) ? args.paths.map(String) : undefined;
  if (!baseUrl) return { success: false, data: "❌ URL de base requise" };
  const result = await checkDirectories(baseUrl, paths);
  if (result.foundPaths.length === 0) {
    return {
      success: true,
      data: `📂 Directory check ${baseUrl}: Aucun chemin trouvé (${result.checkedPaths} testés en ${result.durationMs}ms)`,
    };
  }
  const foundStr = result.foundPaths
    .map((p) => `${p.path} → ${p.status} (${p.contentType.slice(0, 30)})`)
    .join("\n");
  return {
    success: true,
    data: `📂 Directory check ${baseUrl}: ${result.foundPaths.length} chemins trouvés (${result.checkedPaths} testés en ${result.durationMs}ms)\n${foundStr}`,
  };
}

async function tTechDetect(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url) return { success: false, data: "❌ URL requise" };
  const result = await detectTech(url);
  if (!result.success) {
    return { success: false, data: `🔬 Tech detect ${url}: ❌ ${result.error || "Échec"}` };
  }
  const techStr = result.technologies
    .map((t) => `${t.name}${t.version ? ` ${t.version}` : ""} (${t.evidence})`)
    .join("\n");
  return {
    success: true,
    data: `🔬 Tech detect ${url}:\nServer: ${result.server || "N/A"}\nX-Powered-By: ${result.poweredBy || "N/A"}\nTechnologies:\n${techStr || "Aucune détectée"}`,
  };
}

async function tCorsTest(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url) return { success: false, data: "❌ URL requise" };
  const result = await testCors(url);
  if (!result.success) {
    return { success: false, data: `🌐 CORS test ${url}: ❌ ${result.error || "Échec"}` };
  }
  const notesStr = result.notes.length > 0 ? `\n${result.notes.join("\n")}` : "";
  return {
    success: true,
    data: `🌐 CORS test ${url}:\nRating: ${result.rating.toUpperCase()}\nAllow-Origin: ${result.allowedOrigins || "aucun"}\nCredentials: ${result.allowsCredentials ? "✅" : "❌"}\nMethods: ${result.allowsMethods || "N/A"}${notesStr}`,
  };
}

async function tEmailValidate(args: Record<string, unknown>): Promise<ToolCallResult> {
  const email = String(args.email);
  if (!email) return { success: false, data: "❌ Email requis" };
  const result = await validateEmail(email);
  const notesStr = result.notes.length > 0 ? `\n${result.notes.join("\n")}` : "";
  return {
    success: true,
    data: `📧 Email ${email}:\nDomaine: ${result.domain}\nMX: ${result.hasMx ? `✅ ${result.mxRecords.join(", ")}` : "❌"}\nSPF: ${result.hasSpf ? "✅" : "❌"}\nDMARC: ${result.hasDmarc ? "✅" : "❌"}\nDKIM: ${result.hasDkim ? "✅" : "❌"}${notesStr}`,
  };
}

async function tJwtDecode(args: Record<string, unknown>): Promise<ToolCallResult> {
  const token = String(args.token);
  if (!token) return { success: false, data: "❌ Token JWT requis" };
  const result = decodeJwt(token);
  if (!result.valid) {
    return { success: false, data: `🔑 JWT decode: ❌ ${result.error || "Token invalide"}` };
  }
  return {
    success: true,
    data: `🔑 JWT decode:\nAlgorithme: ${result.algorithm}\nIssuer: ${result.issuer || "N/A"}\nSubject: ${result.subject || "N/A"}\nAudience: ${result.audience || "N/A"}\nIssued: ${result.issuedAt || "N/A"}\nExpires: ${result.expiresAt || "N/A"}\nExpiré: ${result.isExpired ? "⚠️ OUI" : "✅ Non"}\nPayload: \`\`\`json\n${JSON.stringify(result.payload, null, 2).slice(0, 500)}\n\`\`\``,
  };
}

async function tUrlExpand(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url) return { success: false, data: "❌ URL requise" };
  const result = await expandUrl(url);
  if (!result.success && result.totalRedirects === 0) {
    return { success: false, data: `🔗 URL expand ${url}: ❌ ${result.error || "Échec"}` };
  }
  const redirectsStr = result.redirects.map((r) => `${r.status} → ${r.url}`).join("\n");
  return {
    success: true,
    data: `🔗 URL expand:\nOriginal: ${result.originalUrl}\nFinal: ${result.finalUrl}\nRedirects (${result.totalRedirects}):\n${redirectsStr || "aucun"}`,
  };
}

async function tSecurityScore(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url) return { success: false, data: "❌ URL requise" };
  const result = await scoreSecurityHeaders(url);
  if (!result.success) {
    return { success: false, data: `🛡️ Security score ${url}: ❌ ${result.error || "Échec"}` };
  }
  const headersStr = result.headers
    .map((h) => `${h.present ? "✅" : "❌"} ${h.name}: ${h.value || "manquant"} (${h.points}pts)`)
    .join("\n");
  const recStr =
    result.recommendations.length > 0
      ? `\n\nRecommandations:\n${result.recommendations.map((r) => `- ${r}`).join("\n")}`
      : "";
  return {
    success: true,
    data: `🛡️ Security score ${url}:\nGrade: **${result.grade}** (${result.score}/100)\n\nHeaders:\n${headersStr}${recStr}`,
  };
}

// ─── Security Toolkit Handlers ───────────────────────────────────────────────

async function tHashCrack(args: Record<string, unknown>): Promise<ToolCallResult> {
  const hash = String(args.hash);
  if (!hash) return { success: false, data: "❌ Hash requis" };
  const algo = detectHashAlgorithm(hash);
  if (!algo) return { success: false, data: "❌ Format de hash non reconnu (MD5/SHA1/SHA256)" };
  if (algo === "bcrypt" || algo === "argon2")
    return { success: false, data: `❌ ${algo} non supporté pour le crack par dictionnaire` };
  const result = await crackHash(hash);
  if (result.found) {
    return {
      success: true,
      data: `🔓 Hash cracké (${result.algorithm}): **${result.plaintext}** — ${result.triedWords} mots testés en ${result.durationMs}ms`,
    };
  }
  return {
    success: false,
    data: `🔒 Hash non cracké (${result.algorithm}) — ${result.triedWords} mots testés en ${result.durationMs}ms`,
  };
}

async function tSqliDetect(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  if (!input) return { success: false, data: "❌ Entrée requise" };
  const result = detectSqli(input);
  if (result.isVulnerable) {
    return {
      success: true,
      data: `🚨 SQLi détecté — Sévérité: ${result.severity.toUpperCase()}\nPatterns: ${result.patterns.join(", ")}`,
    };
  }
  return { success: true, data: "✅ Aucun pattern SQLi détecté" };
}

async function tXssDetect(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  if (!input) return { success: false, data: "❌ Entrée requise" };
  const result = detectXss(input);
  if (result.isVulnerable) {
    return {
      success: true,
      data: `🚨 XSS détecté — Sévérité: ${result.severity.toUpperCase()}\nPatterns: ${result.patterns.join(", ")}`,
    };
  }
  return { success: true, data: "✅ Aucun pattern XSS détecté" };
}

async function tPasswordAnalyze(args: Record<string, unknown>): Promise<ToolCallResult> {
  const password = String(args.password);
  if (!password) return { success: false, data: "❌ Mot de passe requis" };
  const result = analyzePassword(password);
  const recStr =
    result.recommendations.length > 0
      ? `\nRecommandations:\n${result.recommendations.map((r) => `- ${r}`).join("\n")}`
      : "";
  const patternsStr =
    result.commonPatterns.length > 0
      ? `\nPatterns faibles: ${result.commonPatterns.join(", ")}`
      : "";
  return {
    success: true,
    data: `🔑 Analyse: **${result.rating}** (${result.score}/100)\nLongueur: ${result.length} — Entropie: ${result.entropy} bits — Charset: ${result.charsetSize}\nTemps de crack estimé: ${result.estimatedCrackTime}\nMin: ${result.hasLower ? "✅" : "❌"} Maj: ${result.hasUpper ? "✅" : "❌"} Chiffres: ${result.hasNumbers ? "✅" : "❌"} Symboles: ${result.hasSymbols ? "✅" : "❌"}${patternsStr}${recStr}`,
  };
}

async function tSubdomainEnum(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain);
  if (!domain) return { success: false, data: "❌ Domaine requis" };
  const result = await enumerateSubdomains(domain);
  if (result.found.length === 0) {
    return {
      success: true,
      data: `🔍 Sous-domaines ${domain}: Aucun trouvé (${result.tried} testés en ${result.durationMs}ms)`,
    };
  }
  const foundStr = result.found.map((s) => `${s.subdomain} → ${s.ips.join(", ")}`).join("\n");
  return {
    success: true,
    data: `🔍 Sous-domaines ${domain}: ${result.found.length} trouvés (${result.tried} testés en ${result.durationMs}ms)\n${foundStr}`,
  };
}

async function tReverseIp(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ip = String(args.ip);
  if (!ip) return { success: false, data: "❌ IP requise" };
  const result = await reverseIpLookup(ip);
  if (result.success) {
    return { success: true, data: `🔄 Reverse DNS ${ip}: **${result.hostname}**` };
  }
  return { success: false, data: `🔄 Reverse DNS ${ip}: ❌ Aucun hostname trouvé` };
}

async function tCidrCalc(args: Record<string, unknown>): Promise<ToolCallResult> {
  const cidr = String(args.cidr);
  if (!cidr) return { success: false, data: "❌ CIDR requis (ex: 192.168.1.0/24)" };
  const result = calculateCidr(cidr);
  if (!result) return { success: false, data: "❌ Format CIDR invalide" };
  return {
    success: true,
    data: `📊 CIDR ${cidr}:\nRéseau: ${result.networkAddress}\nBroadcast: ${result.broadcastAddress}\nMasque: ${result.subnetMask}\nWildcard: ${result.wildcardMask}\nPremier hôte: ${result.firstHost}\nDernier hôte: ${result.lastHost}\nHôtes total: ${result.totalHosts}\nHôtes utilisables: ${result.usableHosts}\nClasse: ${result.ipClass}`,
  };
}

async function tMacVendor(args: Record<string, unknown>): Promise<ToolCallResult> {
  const mac = String(args.mac);
  if (!mac) return { success: false, data: "❌ MAC requise" };
  const result = lookupMacVendor(mac);
  if (result.vendor) {
    return {
      success: true,
      data: `🏷️ MAC ${result.mac}: **${result.vendor}** (OUI: ${result.oui})`,
    };
  }
  return {
    success: false,
    data: `🏷️ MAC ${result.mac}: ❌ Fabricant inconnu (OUI: ${result.oui})`,
  };
}

async function tHstsCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain);
  if (!domain) return { success: false, data: "❌ Domaine requis" };
  const result = await checkHsts(domain);
  if (!result.success)
    return { success: false, data: `🔒 HSTS ${domain}: ❌ ${result.error || "Échec"}` };
  return {
    success: true,
    data: `🔒 HSTS ${domain}:\nHSTS: ${result.hasHsts ? "✅" : "❌"}\nMax-Age: ${result.maxAge || "N/A"}\nIncludeSubDomains: ${result.includeSubDomains ? "✅" : "❌"}\nPreload: ${result.preload ? "✅" : "❌"}`,
  };
}

async function tWafDetect(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url) return { success: false, data: "❌ URL requise" };
  const result = await detectWaf(url);
  if (!result.success)
    return { success: false, data: `🧱 WAF detect ${url}: ❌ ${result.error || "Échec"}` };
  if (result.detected) {
    return {
      success: true,
      data: `🧱 WAF detect ${url}: **${result.wafName}**\nPreuves: ${result.evidence.join(", ")}`,
    };
  }
  return { success: true, data: `🧱 WAF detect ${url}: Aucun WAF détecté` };
}

async function tRobotsParse(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url) return { success: false, data: "❌ URL requise" };
  const result = await parseRobotsTxt(url);
  if (!result.success)
    return { success: false, data: `🤖 robots.txt ${url}: ❌ ${result.error || "Introuvable"}` };
  const rulesStr = result.rules
    .map(
      (r) =>
        `UA: ${r.userAgent}\n  Disallow: ${r.disallow.join(", ") || "none"}\n  Allow: ${r.allow.join(", ") || "none"}`,
    )
    .join("\n");
  const sitemapsStr = result.sitemaps.length > 0 ? `\nSitemaps: ${result.sitemaps.join(", ")}` : "";
  return {
    success: true,
    data: `🤖 robots.txt ${url}:\n${rulesStr}${sitemapsStr}\nCrawl-delay: ${result.crawlDelay || "N/A"}`,
  };
}

async function tSitemapParse(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url) return { success: false, data: "❌ URL requise" };
  const result = await parseSitemap(url);
  if (!result.success)
    return { success: false, data: `🗺️ sitemap.xml ${url}: ❌ ${result.error || "Introuvable"}` };
  const urlsStr = result.urls.slice(0, 20).join("\n");
  const more = result.urls.length > 20 ? `\n... et ${result.urls.length - 20} autres` : "";
  return { success: true, data: `🗺️ sitemap.xml ${url}: ${result.count} URLs\n${urlsStr}${more}` };
}

async function tHttpStatusRef(args: Record<string, unknown>): Promise<ToolCallResult> {
  const code = typeof args.code === "number" ? args.code : parseInt(String(args.code), 10);
  const info = getHttpStatusInfo(code);
  if (!info) return { success: false, data: `❌ Code ${code} non trouvé dans la référence` };
  return {
    success: true,
    data: `📋 HTTP ${info.code} (${info.category}): **${info.name}** — ${info.description}`,
  };
}

async function tPortRef(args: Record<string, unknown>): Promise<ToolCallResult> {
  const port = typeof args.port === "number" ? args.port : parseInt(String(args.port), 10);
  const info = getPortInfo(port);
  if (!info) return { success: false, data: `❌ Port ${port} non trouvé dans la référence` };
  return {
    success: true,
    data: `🔌 Port ${info.port} (${info.protocol}): **${info.service}** — ${info.description}`,
  };
}

// ─── Utility Toolkit Handlers ────────────────────────────────────────────────

async function tTimestampConvert(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  if (!input) return { success: false, data: "❌ Timestamp ou date requis" };
  const result = convertTimestamp(input);
  return {
    success: true,
    data: `⏰ Timestamp:\nUnix: ${result.unix}\nISO: ${result.iso}\nUTC: ${result.utc}\nLocal: ${result.local}\nRelatif: ${result.relative}`,
  };
}

async function tBaseConvert(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  const fromBase = typeof args.fromBase === "number" ? (args.fromBase as 2 | 8 | 10 | 16) : 10;
  if (!input) return { success: false, data: "❌ Nombre requis" };
  const result = convertBase(input, fromBase);
  if (!result.valid)
    return { success: false, data: `❌ Nombre invalide pour la base ${result.fromBase}` };
  return {
    success: true,
    data: `🔢 Conversion (${result.fromBase}):\nDécimal: ${result.decimal}\nBinaire: ${result.binary}\nOctal: ${result.octal}\nHexadécimal: ${result.hexadecimal}`,
  };
}

async function tUuidGen(args: Record<string, unknown>): Promise<ToolCallResult> {
  const count = typeof args.count === "number" ? args.count : 1;
  const version = typeof args.version === "number" ? (args.version as 4 | 7) : 4;
  const uuids = generateUuids(count, version);
  return { success: true, data: `🆔 UUID v${version} (${count}):\n${uuids.join("\n")}` };
}

async function tRegexTest(args: Record<string, unknown>): Promise<ToolCallResult> {
  const pattern = String(args.pattern);
  const flags = String(args.flags || "");
  const testString = String(args.testString);
  if (!pattern) return { success: false, data: "❌ Pattern regex requis" };
  const result = testRegex(pattern, flags, testString);
  if (!result.isValid) return { success: false, data: `❌ Regex invalide: ${result.error}` };
  if (result.matches.length === 0)
    return { success: true, data: "✅ Regex valide — aucun match trouvé" };
  const matchesStr = result.matches
    .map(
      (m) =>
        `"${m.match}" à l'index ${m.index}${m.groups.length > 0 ? ` (groups: ${m.groups.join(", ")})` : ""}`,
    )
    .join("\n");
  return { success: true, data: `✅ ${result.matches.length} match(s):\n${matchesStr}` };
}

async function tJsonFormat(args: Record<string, unknown>): Promise<ToolCallResult> {
  const json = String(args.json);
  const minify = args.minify === true;
  if (!json) return { success: false, data: "❌ JSON requis" };
  const result = minify ? minifyJson(json) : formatJson(json);
  if (!result.valid) return { success: false, data: `❌ JSON invalide: ${result.error}` };
  return {
    success: true,
    data: `📝 JSON ${minify ? "minifié" : "formaté"}:\n\`\`\`json\n${result.output.slice(0, 2000)}\n\`\`\``,
  };
}

async function tBinaryConvert(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  const mode = String(args.mode || "encode");
  if (!input) return { success: false, data: "❌ Entrée requise" };
  const output = mode === "decode" ? binaryToText(input) : textToBinary(input);
  return { success: true, data: `🔢 Binary ${mode}:\n\`\`\`\n${output.slice(0, 2000)}\n\`\`\`` };
}

async function tHexConvert(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  const mode = String(args.mode || "encode");
  if (!input) return { success: false, data: "❌ Entrée requise" };
  const output = mode === "decode" ? hexToText(input) : textToHex(input);
  return { success: true, data: `🔢 Hex ${mode}:\n\`\`\`\n${output.slice(0, 2000)}\n\`\`\`` };
}

async function tMorseCode(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  const mode = String(args.mode || "encode");
  if (!input) return { success: false, data: "❌ Entrée requise" };
  const output = mode === "decode" ? morseToText(input) : textToMorse(input);
  return { success: true, data: `📡 Morse ${mode}:\n\`\`\`\n${output.slice(0, 2000)}\n\`\`\`` };
}

async function tCaesarCipher(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text);
  const shift = typeof args.shift === "number" ? args.shift : parseInt(String(args.shift), 10) || 0;
  if (!text) return { success: false, data: "❌ Texte requis" };
  const output = caesarCipher(text, shift);
  return {
    success: true,
    data: `🔐 Caesar (shift=${shift}):\n\`\`\`\n${output.slice(0, 2000)}\n\`\`\``,
  };
}

async function tRot13(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text);
  if (!text) return { success: false, data: "❌ Texte requis" };
  const output = rot13(text);
  return { success: true, data: `🔐 ROT13:\n\`\`\`\n${output.slice(0, 2000)}\n\`\`\`` };
}

async function tHashGen(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  if (!input) return { success: false, data: "❌ Entrée requise" };
  const result = generateHashes(input);
  return {
    success: true,
    data: `🔐 Hashes:\nMD5: ${result.md5}\nSHA1: ${result.sha1}\nSHA256: ${result.sha256}\nSHA512: ${result.sha512}`,
  };
}

async function tLoremGen(args: Record<string, unknown>): Promise<ToolCallResult> {
  const paragraphs = typeof args.paragraphs === "number" ? args.paragraphs : 1;
  const output = generateLoremIpsum(paragraphs);
  return {
    success: true,
    data: `📝 Lorem Ipsum (${paragraphs} paragraphe(s)):\n${output.slice(0, 2000)}`,
  };
}

async function tColorConvert(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  if (!input) return { success: false, data: "❌ Couleur requise" };
  const result = convertColor(input);
  if (!result.valid) return { success: false, data: "❌ Format de couleur invalide (HEX ou RGB)" };
  return {
    success: true,
    data: `🎨 Couleur:\nHEX: ${result.hex}\nRGB: ${result.rgb.r}, ${result.rgb.g}, ${result.rgb.b}\nHSL: ${result.hsl.h}°, ${result.hsl.s}%, ${result.hsl.l}%`,
  };
}

// ─── Pentest Toolkit Handlers ────────────────────────────────────────────────

async function tMetasploit(args: Record<string, unknown>): Promise<ToolCallResult> {
  const moduleType = String(args.moduleType || "auxiliary") as "auxiliary" | "exploit" | "post";
  const moduleName = String(args.moduleName || "");
  const target = String(args.target || "");
  const options = args.options as Record<string, string> | undefined;
  if (!moduleName || !target) return { success: false, data: "❌ Module et target requis" };
  const result = await runMetasploit(moduleType, moduleName, target, options);
  if (!result.success)
    return {
      success: false,
      data: `💥 Metasploit ${result.module}: ❌ ${result.error || "Échec"}`,
    };
  return {
    success: true,
    data: `💥 Metasploit ${result.module} → ${target}:\n\`\`\`\n${result.output.slice(0, 3000)}\n\`\`\``,
  };
}

async function tTsharkCapture(args: Record<string, unknown>): Promise<ToolCallResult> {
  const iface = String(args.interface || "eth0");
  const duration = typeof args.duration === "number" ? args.duration : 10;
  const filter = args.filter ? String(args.filter) : undefined;
  const result = await captureTraffic(iface, duration, filter);
  if (!result.success)
    return { success: false, data: `🦈 tshark ${iface}: ❌ ${result.error || "Échec"}` };
  const protoStr = result.protocols.join(", ") || "N/A";
  const talkerStr = result.topTalkers.map((t) => `${t.ip}: ${t.packets} pkts`).join("\n") || "N/A";
  return {
    success: true,
    data: `🦈 tshark ${iface} (${duration}s):\nPackets: ${result.packetCount}\nProtocoles: ${protoStr}\nTop talkers:\n${talkerStr}`,
  };
}

async function tHydraBrute(args: Record<string, unknown>): Promise<ToolCallResult> {
  const target = String(args.target || "");
  const service = String(args.service || "");
  const userlist = args.userlist ? String(args.userlist) : undefined;
  const passlist = args.passlist ? String(args.passlist) : undefined;
  if (!target || !service) return { success: false, data: "❌ Target et service requis" };
  const result = await runHydra(target, service, userlist, passlist);
  if (!result.success)
    return {
      success: false,
      data: `🔐 Hydra ${service}://${target}: ❌ ${result.error || "Échec"}`,
    };
  if (result.found) {
    const credsStr = result.credentials.map((c) => `${c.username}:${c.password}`).join("\n");
    return { success: true, data: `🔐 Hydra ${service}://${target}: ✅ CRACKÉ\n${credsStr}` };
  }
  return { success: true, data: `🔐 Hydra ${service}://${target}: ❌ Aucun credential trouvé` };
}

async function tSqlmapScan(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  if (!url) return { success: false, data: "❌ URL requise" };
  const opts: { data?: string; cookie?: string; level?: number; risk?: number } = {};
  if (args.data) opts.data = String(args.data);
  if (args.cookie) opts.cookie = String(args.cookie);
  if (typeof args.level === "number") opts.level = args.level;
  if (typeof args.risk === "number") opts.risk = args.risk;
  const result = await runSqlmap(url, opts);
  if (!result.success)
    return { success: false, data: `💉 SQLmap ${url}: ❌ ${result.error || "Échec"}` };
  if (result.vulnerable) {
    return {
      success: true,
      data: `💉 SQLmap ${url}: 🚨 VULNÉRABLE\nDBMS: ${result.dbms || "N/A"}\nInjections: ${result.injectionPoints.join(", ")}`,
    };
  }
  return { success: true, data: `💉 SQLmap ${url}: ✅ Non vulnérable` };
}

async function tSearchsploit(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "");
  if (!query) return { success: false, data: "❌ Requête requise" };
  const result = await searchExploit(query);
  if (!result.success || result.exploits.length === 0)
    return { success: true, data: `🔍 searchsploit "${query}": Aucun exploit trouvé` };
  const exploitsStr = result.exploits.map((e) => `#${e.id} [${e.type}] ${e.title}`).join("\n");
  return {
    success: true,
    data: `🔍 searchsploit "${query}": ${result.count} résultat(s)\n${exploitsStr}`,
  };
}

async function tHashcatCrack(args: Record<string, unknown>): Promise<ToolCallResult> {
  const hash = String(args.hash || "");
  const mode = typeof args.mode === "number" ? args.mode : 0;
  const wordlist = args.wordlist ? String(args.wordlist) : undefined;
  if (!hash) return { success: false, data: "❌ Hash requis" };
  const result = await runHashcat(hash, mode, wordlist);
  if (result.cracked) {
    return {
      success: true,
      data: `🔓 Hashcat (mode ${mode}): ✅ CRACKÉ → **${result.plaintext}**`,
    };
  }
  return { success: false, data: `🔒 Hashcat (mode ${mode}): ❌ Non cracké` };
}

async function tSnmpWalk(args: Record<string, unknown>): Promise<ToolCallResult> {
  const target = String(args.target || "");
  const community = args.community ? String(args.community) : "public";
  if (!target) return { success: false, data: "❌ Target IP requise" };
  const result = await snmpWalk(target, community);
  if (!result.success)
    return { success: false, data: `📡 SNMP ${target}: ❌ ${result.error || "Échec"}` };
  const sysStr = result.systemInfo.map((s) => `${s.name}: ${s.value}`).join("\n") || "N/A";
  const ifaceStr = result.interfaces.map((i) => `eth${i.index}: ${i.name}`).join("\n") || "N/A";
  return {
    success: true,
    data: `📡 SNMP ${target} (community: ${community}):\nSystem:\n${sysStr}\nInterfaces:\n${ifaceStr}`,
  };
}

async function tEnum4linuxScan(args: Record<string, unknown>): Promise<ToolCallResult> {
  const target = String(args.target || "");
  if (!target) return { success: false, data: "❌ Target IP requise" };
  const result = await runEnum4linux(target);
  if (!result.success) return { success: false, data: `🖥️ enum4linux ${target}: ❌ Échec` };
  const sharesStr = result.shares.join(", ") || "N/A";
  const usersStr = result.users.join(", ") || "N/A";
  return {
    success: true,
    data: `🖥️ enum4linux ${target}:\nOS: ${result.osInfo || "N/A"}\nShares: ${sharesStr}\nUsers: ${usersStr}`,
  };
}

async function tHarvesterOsint(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "");
  const sources = args.sources ? String(args.sources) : "all";
  if (!domain) return { success: false, data: "❌ Domaine requis" };
  const result = await runHarvester(domain, sources);
  if (!result.success)
    return { success: false, data: `📧 theHarvester ${domain}: ❌ ${result.error || "Échec"}` };
  const emailsStr = result.emails.join("\n") || "N/A";
  const hostsStr = result.hosts.join("\n") || "N/A";
  const ipsStr = result.ips.join(", ") || "N/A";
  return {
    success: true,
    data: `📧 theHarvester ${domain}:\nEmails (${result.emails.length}):\n${emailsStr}\n\nHosts (${result.hosts.length}):\n${hostsStr}\n\nIPs: ${ipsStr}`,
  };
}

async function tCrackmapexecScan(args: Record<string, unknown>): Promise<ToolCallResult> {
  const target = String(args.target || "");
  const service = String(args.service || "smb") as "smb" | "winrm" | "mssql" | "ssh" | "ldap";
  const opts: { username?: string; password?: string; hash?: string } = {};
  if (args.username) opts.username = String(args.username);
  if (args.password) opts.password = String(args.password);
  if (!target) return { success: false, data: "❌ Target requise" };
  const result = await runCrackMapExec(target, service, opts);
  if (!result.success) return { success: false, data: `⚔️ CME ${service}://${target}: ❌ Échec` };
  const findingsStr = result.findings.join("\n") || "N/A";
  return {
    success: true,
    data: `⚔️ CrackMapExec ${service}://${target}:\nHosts actifs: ${result.hostsAlive}\n${findingsStr}`,
  };
}

async function tWhatwebScan(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  if (!url) return { success: false, data: "❌ URL requise" };
  const result = await runWhatWeb(url);
  if (!result.success)
    return { success: false, data: `🌐 WhatWeb ${url}: ❌ ${result.error || "Échec"}` };
  const techStr = result.technologies.join(", ") || "N/A";
  return {
    success: true,
    data: `🌐 WhatWeb ${url}:\nTitle: ${result.title || "N/A"}\nServer: ${result.server || "N/A"}\nTechnologies: ${techStr}`,
  };
}

async function tGobusterScan(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  const wordlist = args.wordlist ? String(args.wordlist) : undefined;
  const extensions = args.extensions ? String(args.extensions) : undefined;
  if (!url) return { success: false, data: "❌ URL requise" };
  const result = await runGobuster(url, wordlist, extensions);
  if (!result.success)
    return { success: false, data: `📂 Gobuster ${url}: ❌ ${result.error || "Échec"}` };
  if (result.foundPaths.length === 0)
    return { success: true, data: `📂 Gobuster ${url}: Aucun chemin trouvé` };
  const pathsStr = result.foundPaths.map((p) => `${p.path} → ${p.status}`).join("\n");
  return {
    success: true,
    data: `📂 Gobuster ${url}: ${result.foundPaths.length} chemins trouvés\n${pathsStr}`,
  };
}

async function tNmapNseScan(args: Record<string, unknown>): Promise<ToolCallResult> {
  const target = String(args.target || "");
  const scriptCategory = args.scriptCategory ? String(args.scriptCategory) : "default";
  const scripts = Array.isArray(args.scripts) ? args.scripts.map(String) : undefined;
  if (!target) return { success: false, data: "❌ Target requise" };
  const result = await runNmapNse(target, scriptCategory, scripts);
  if (!result.success)
    return { success: false, data: `🔍 Nmap NSE ${target}: ❌ ${result.error || "Échec"}` };
  if (result.scripts.length === 0)
    return { success: true, data: `🔍 Nmap NSE ${target}: Aucun résultat de script` };
  const scriptsStr = result.scripts.map((s) => `${s.name}: ${s.output}`).join("\n");
  return { success: true, data: `🔍 Nmap NSE ${target} (${scriptCategory}):\n${scriptsStr}` };
}

// ─── Forensics Toolkit Handlers ──────────────────────────────────────────────

async function tBase64Codec(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  const mode = String(args.mode || "encode");
  if (!input) return { success: false, data: "❌ Entrée requise" };
  const output = mode === "decode" ? base64Decode(input) : base64Encode(input);
  return { success: true, data: `📝 Base64 ${mode}:\n\`\`\`\n${output.slice(0, 2000)}\n\`\`\`` };
}

async function tUrlCodec(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  const mode = String(args.mode || "encode");
  if (!input) return { success: false, data: "❌ Entrée requise" };
  const output = mode === "decode" ? urlDecode(input) : urlEncode(input);
  return { success: true, data: `🔗 URL ${mode}:\n\`\`\`\n${output.slice(0, 2000)}\n\`\`\`` };
}

async function tAesCrypto(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  const password = String(args.password);
  const mode = String(args.mode || "encrypt");
  if (!input || !password) return { success: false, data: "❌ Input et password requis" };
  if (mode === "decrypt") {
    const iv = String(args.iv || "");
    const tag = String(args.tag || "");
    const result = aesDecrypt(input, password, iv, tag);
    if (!result.success) return { success: false, data: `🔒 AES decrypt: ❌ ${result.error}` };
    return {
      success: true,
      data: `🔒 AES decrypt:\n\`\`\`\n${result.output.slice(0, 2000)}\n\`\`\``,
    };
  }
  const result = aesEncrypt(input, password);
  if (!result.success) return { success: false, data: `🔒 AES encrypt: ❌ ${result.error}` };
  return {
    success: true,
    data: `🔒 AES encrypt:\nCiphertext: \`${result.output}\`\nIV: \`${result.iv}\`\nTag: \`${result.tag}\``,
  };
}

async function tFileHash(args: Record<string, unknown>): Promise<ToolCallResult> {
  const filePath = String(args.path);
  if (!filePath) return { success: false, data: "❌ Chemin requis" };
  const result = await hashFile(filePath);
  if (!result.success) return { success: false, data: `📄 Hash: ❌ ${result.error}` };
  return {
    success: true,
    data: `📄 ${result.file} (${result.size} bytes):\nMD5: ${result.md5}\nSHA1: ${result.sha1}\nSHA256: ${result.sha256}`,
  };
}

async function tFileMetadata(args: Record<string, unknown>): Promise<ToolCallResult> {
  const filePath = String(args.path);
  if (!filePath) return { success: false, data: "❌ Chemin requis" };
  const result = await getFileMetadata(filePath);
  if (!result.success) return { success: false, data: `📄 Metadata: ❌ ${result.error}` };
  return {
    success: true,
    data: `📄 ${result.file}:\nTaille: ${result.size} bytes\nType: ${result.mimeType}\nExtension: ${result.extension}\nCréé: ${result.created}\nModifié: ${result.modified}`,
  };
}

async function tPiiScan(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  if (!input) return { success: false, data: "❌ Texte requis" };
  const result = scanPii(input);
  if (result.totalFound === 0) return { success: true, data: "✅ Aucun PII détecté" };
  const findingsStr = result.findings.map((f) => `${f.type}: ${f.value} (x${f.count})`).join("\n");
  return { success: true, data: `🚨 PII détecté (${result.totalFound}):\n${findingsStr}` };
}

async function tIocParse(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  if (!input) return { success: false, data: "❌ Texte requis" };
  const result = parseIocs(input);
  if (result.count === 0) return { success: true, data: "✅ Aucun IOC trouvé" };
  const iocsStr = result.iocs.map((i) => `${i.type}: ${i.value}`).join("\n");
  return { success: true, data: `🔬 IOC extraits (${result.count}):\n${iocsStr}` };
}

async function tEntropyAnalyze(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  if (!input) return { success: false, data: "❌ Entrée requise" };
  const result = analyzeEntropy(input);
  return {
    success: true,
    data: `📊 Entropie: ${result.entropy} bits/char\nCharset: ${result.charsetSize}\nÉvaluation: ${result.rating}`,
  };
}

async function tHexDump(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  if (!input) return { success: false, data: "❌ Entrée requise" };
  const result = hexDump(input);
  return {
    success: true,
    data: `📋 Hex dump (${result.lines} lines):\n\`\`\`\n${result.dump.slice(0, 2000)}\n\`\`\``,
  };
}

async function tStringExtract(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input);
  if (!input) return { success: false, data: "❌ Entrée requise" };
  const result = extractStrings(input);
  if (result.count === 0) return { success: true, data: "🔍 Aucune chaîne trouvée" };
  return {
    success: true,
    data: `🔍 ${result.count} chaînes trouvées:\n${result.strings.join("\n").slice(0, 2000)}`,
  };
}

async function tPeHeader(args: Record<string, unknown>): Promise<ToolCallResult> {
  const filePath = String(args.path);
  if (!filePath) return { success: false, data: "❌ Chemin requis" };
  const result = await parsePeHeader(filePath);
  if (!result.success) return { success: false, data: `🪟 PE Header: ❌ ${result.error}` };
  return {
    success: true,
    data: `🪟 PE Header:\nMachine: ${result.machine}\nSections: ${result.sections}\nTimestamp: ${result.timestamp}\nCharacteristics: ${result.characteristics.join(", ")}`,
  };
}

async function tElfHeader(args: Record<string, unknown>): Promise<ToolCallResult> {
  const filePath = String(args.path);
  if (!filePath) return { success: false, data: "❌ Chemin requis" };
  const result = await parseElfHeader(filePath);
  if (!result.success) return { success: false, data: `🐧 ELF Header: ❌ ${result.error}` };
  return {
    success: true,
    data: `🐧 ELF Header:\nClass: ${result.class}\nEndian: ${result.endian}\nMachine: ${result.machine}\nType: ${result.type}\nEntry: ${result.entry}\nSections: ${result.sections}`,
  };
}

async function tApkInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const filePath = String(args.path);
  if (!filePath) return { success: false, data: "❌ Chemin requis" };
  const result = await getApkInfo(filePath);
  if (!result.success) return { success: false, data: `📱 APK Info: ❌ ${result.error}` };
  const permsStr = result.permissions.length > 0 ? result.permissions.join("\n") : "N/A";
  return {
    success: true,
    data: `📱 APK ${result.file} (${result.size} bytes):\nPackage: ${result.packageName || "N/A"}\nVersion: ${result.version || "N/A"}\nMin SDK: ${result.minSdk || "N/A"}\nPermissions:\n${permsStr}`,
  };
}

async function tDepVulnCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const filePath = String(args.path);
  if (!filePath) return { success: false, data: "❌ Chemin requis" };
  const result = await checkDependencyVulns(filePath);
  if (result.count === 0)
    return { success: true, data: `✅ ${result.file}: Aucune vulnérabilité connue détectée` };
  const vulnsStr = result.vulnerabilities
    .map((v) => `[${v.severity.toUpperCase()}] ${v.pattern}`)
    .join("\n");
  return {
    success: true,
    data: `🚨 ${result.file}: ${result.count} vulnérabilité(s):\n${vulnsStr}`,
  };
}

async function tStegoDetect(args: Record<string, unknown>): Promise<ToolCallResult> {
  const filePath = String(args.path);
  if (!filePath) return { success: false, data: "❌ Chemin requis" };
  const result = await detectSteganography(filePath);
  if (!result.success) return { success: false, data: `🖼️ Stego detect: ❌ ${result.error}` };
  return {
    success: true,
    data: `🖼️ Stego ${result.file}:\nSuspect: ${result.suspicious ? "⚠️ OUI" : "✅ Non"}\nLSB variance: ${result.lsbVariance}\nRaison: ${result.reason}`,
  };
}

// ─── Data & Text Toolkit Handlers ────────────────────────────────────────────

async function tUnitConvert(args: Record<string, unknown>): Promise<ToolCallResult> {
  const value = typeof args.value === "number" ? args.value : parseFloat(String(args.value));
  const fromUnit = String(args.fromUnit || "");
  const category = String(args.category || "");
  if (isNaN(value) || !fromUnit || !category)
    return { success: false, data: "❌ value, fromUnit et category requis" };
  const result = convertUnit(value, fromUnit, category);
  if (!result.success) return { success: false, data: `❌ ${result.error}` };
  const convStr = result.conversions.map((c) => `${c.value} ${c.unit}`).join("\n");
  return { success: true, data: `📏 ${result.input} → ${category}:\n${convStr}` };
}

async function tTempConvert(args: Record<string, unknown>): Promise<ToolCallResult> {
  const value = typeof args.value === "number" ? args.value : parseFloat(String(args.value));
  const from = String(args.from || "C").toUpperCase() as "C" | "F" | "K";
  if (isNaN(value)) return { success: false, data: "❌ Valeur requise" };
  const result = convertTemperature(value, from);
  const convStr = result.conversions.map((c) => `${c.value}${c.unit}`).join(" | ");
  return { success: true, data: `🌡️ ${result.input}:\n${convStr}` };
}

async function tMathEval(args: Record<string, unknown>): Promise<ToolCallResult> {
  const expression = String(args.expression || "");
  if (!expression) return { success: false, data: "❌ Expression requise" };
  const result = evalMath(expression);
  if (!result.success) return { success: false, data: `❌ ${result.error}` };
  return { success: true, data: `🧮 ${result.expression} = **${result.result}**` };
}

async function tStatsCalc(args: Record<string, unknown>): Promise<ToolCallResult> {
  const values = Array.isArray(args.values) ? args.values.map(Number).filter((n) => !isNaN(n)) : [];
  if (values.length === 0) return { success: false, data: "❌ Liste de nombres requise" };
  const result = calculateStats(values);
  return {
    success: true,
    data: `📊 Stats (${result.count} valeurs):\nMean: ${result.mean}\nMedian: ${result.median}\nStd: ${result.std}\nVariance: ${result.variance}\nMin: ${result.min}\nMax: ${result.max}\nRange: ${result.range}\nQ1: ${result.q1}\nQ3: ${result.q3}\nSum: ${result.sum}`,
  };
}

async function tSentimentAnalyze(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  if (!text) return { success: false, data: "❌ Texte requis" };
  const result = analyzeSentiment(text);
  const posStr = result.positiveWords.join(", ") || "N/A";
  const negStr = result.negativeWords.join(", ") || "N/A";
  return {
    success: true,
    data: `💭 Sentiment: **${result.rating}** (score: ${result.score})\nPositif: ${posStr}\nNégatif: ${negStr}`,
  };
}

async function tLanguageDetect(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  if (!text) return { success: false, data: "❌ Texte requis" };
  const result = detectLanguage(text);
  return {
    success: true,
    data: `🌐 Langue détectée: **${result.detected}** (confiance: ${result.confidence * 100}%)`,
  };
}

async function tWordFreq(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  if (!text) return { success: false, data: "❌ Texte requis" };
  const result = wordFrequency(text);
  const topStr = result.topWords.map((w) => `${w.word}: ${w.count}x`).join("\n");
  return {
    success: true,
    data: `📝 ${result.totalWords} mots, ${result.uniqueWords} uniques:\n${topStr}`,
  };
}

async function tCaseConvert(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input || "");
  if (!input) return { success: false, data: "❌ Texte requis" };
  const result = convertCase(input);
  if (!result.success) return { success: false, data: "❌ Conversion impossible" };
  return {
    success: true,
    data: `🔤 Case:\ncamelCase: ${result.camelCase}\nPascalCase: ${result.pascalCase}\nsnake_case: ${result.snakeCase}\nkebab-case: ${result.kebabCase}\nCONSTANT_CASE: ${result.constantCase}\nlower: ${result.lower}\nUPPER: ${result.upper}\nTitle Case: ${result.titleCase}`,
  };
}

async function tSlugGen(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.input || "");
  if (!input) return { success: false, data: "❌ Texte requis" };
  const slug = generateSlug(input);
  return { success: true, data: `🔗 Slug: \`${slug}\`` };
}

async function tQrGen(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  if (!text) return { success: false, data: "❌ Texte requis" };
  const result = generateQrAscii(text);
  return { success: true, data: `📱 QR Code:\n\`\`\`\n${result.qrCode}\n\`\`\`` };
}

async function tCronParse(args: Record<string, unknown>): Promise<ToolCallResult> {
  const expression = String(args.expression || "");
  if (!expression) return { success: false, data: "❌ Expression cron requise" };
  const result = parseCron(expression);
  if (!result.success) return { success: false, data: `❌ ${result.error}` };
  const fieldsStr = result.fields.map((f) => `${f.field}: ${f.value} → ${f.meaning}`).join("\n");
  return {
    success: true,
    data: `⏰ Cron \`${result.expression}\`:\n${result.description}\n\n${fieldsStr}\n\nProchaine exécution: ${result.nextRun}`,
  };
}

async function tIpRangeGen(args: Record<string, unknown>): Promise<ToolCallResult> {
  const cidr = String(args.cidr || "");
  if (!cidr) return { success: false, data: "❌ CIDR requis" };
  const result = generateIpRange(cidr);
  if (!result.success) return { success: false, data: `❌ ${result.error}` };
  return {
    success: true,
    data: `🌐 ${result.cidr}: ${result.count} IPs\n${result.ips.slice(0, 20).join("\n")}${result.count > 20 ? `\n... et ${result.count - 20} autres` : ""}`,
  };
}

async function tNumToWords(args: Record<string, unknown>): Promise<ToolCallResult> {
  const number = typeof args.number === "number" ? args.number : parseInt(String(args.number), 10);
  if (isNaN(number)) return { success: false, data: "❌ Nombre requis" };
  const words = numberToWordsFr(number);
  return { success: true, data: `🔢 ${number} → **${words}**` };
}

async function tPasswordGen(args: Record<string, unknown>): Promise<ToolCallResult> {
  const count = typeof args.count === "number" ? args.count : 1;
  const length = typeof args.length === "number" ? args.length : 16;
  const result = generatePasswords(count, length);
  return {
    success: true,
    data: `🔐 Password (${result.length} chars, ${result.strength}):\n${result.passwords.join("\n")}`,
  };
}

async function tDataSizeFormat(args: Record<string, unknown>): Promise<ToolCallResult> {
  const bytes = typeof args.bytes === "number" ? args.bytes : parseInt(String(args.bytes), 10);
  if (isNaN(bytes)) return { success: false, data: "❌ Taille en bytes requise" };
  const result = formatDataSize(bytes);
  return {
    success: true,
    data: `💾 ${result.bytes} bytes:\nBinaire: ${result.binary}\nDécimal: ${result.decimal}`,
  };
}

async function tTextDiff(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text1 = String(args.text1 || "");
  const text2 = String(args.text2 || "");
  if (!text1 || !text2) return { success: false, data: "❌ text1 et text2 requis" };
  const result = textDiff(text1, text2);
  const diffStr = result.diff.slice(0, 30).join("\n");
  return {
    success: true,
    data: `📋 Diff (similarity: ${result.similarity}%):\n+${result.additions} -${result.deletions} =${result.unchanged}\n\`\`\`diff\n${diffStr}\n\`\`\``,
  };
}

// ─── NEW TOOLKIT HANDLERS (241 tools) ──────────────────────────────────────

function tHashCrackDictionary(args: Record<string, unknown>): ToolCallResult {
  const hash = String(args.hash || "");
  const hashType = String(args.hashType || "");
  const wordlist = String(args.wordlist || "");
  try {
    const result = hashCrackDictionary(hash, hashType, wordlist);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tHashIdentifyAdvanced(args: Record<string, unknown>): ToolCallResult {
  const hash = String(args.hash || "");
  try {
    const result = hashIdentifyAdvanced(hash);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tGenerateHmac(args: Record<string, unknown>): ToolCallResult {
  const message = String(args.message || "");
  const key = String(args.key || "");
  const algorithm = String(args.algorithm || "");
  try {
    const result = generateHmac(message, key, algorithm);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tCryptoAesDecrypt(args: Record<string, unknown>): ToolCallResult {
  const encryptedData = String(args.encryptedData || "");
  const key = String(args.key || "");
  const iv = String(args.iv || "");
  const mode = String(args.mode || "");
  try {
    const result = cryptoAesDecrypt(encryptedData, key, iv, mode);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tRsaKeypairGenerate(args: Record<string, unknown>): ToolCallResult {
  const bits = Number(args.bits || 0);
  try {
    const result = rsaKeypairGenerate(bits);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tRsaEncrypt(args: Record<string, unknown>): ToolCallResult {
  const message = String(args.message || "");
  const publicKeyPem = String(args.publicKeyPem || "");
  try {
    const result = rsaEncrypt(message, publicKeyPem);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tRsaDecrypt(args: Record<string, unknown>): ToolCallResult {
  const encryptedBase64 = String(args.encryptedBase64 || "");
  const privateKeyPem = String(args.privateKeyPem || "");
  try {
    const result = rsaDecrypt(encryptedBase64, privateKeyPem);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tPgpEncrypt(args: Record<string, unknown>): ToolCallResult {
  const message = String(args.message || "");
  const recipientKey = String(args.recipientKey || "");
  try {
    const result = pgpEncrypt(message, recipientKey);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tPgpDecrypt(args: Record<string, unknown>): ToolCallResult {
  const encryptedMessage = String(args.encryptedMessage || "");
  try {
    const result = pgpDecrypt(encryptedMessage);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tStegoExtractLsb(args: Record<string, unknown>): ToolCallResult {
  const imagePath = String(args.imagePath || "");
  try {
    const result = stegoExtractLsb(imagePath);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tStegoHideLsb(args: Record<string, unknown>): ToolCallResult {
  const imagePath = String(args.imagePath || "");
  const message = String(args.message || "");
  const outputFile = String(args.outputFile || "");
  try {
    const result = stegoHideLsb(imagePath, message, outputFile);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSteganalysisZscore(args: Record<string, unknown>): ToolCallResult {
  const imagePath = String(args.imagePath || "");
  try {
    const result = steganalysisZscore(imagePath);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tXorCipher(args: Record<string, unknown>): ToolCallResult {
  const data = String(args.data || "");
  const key = String(args.key || "");
  try {
    const result = xorCipher(data, key);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tFrequencyAnalysis(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  try {
    const result = frequencyAnalysis(text);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tRandomTokenGenerator(args: Record<string, unknown>): ToolCallResult {
  const length = Number(args.length || 0);
  const encoding = String(args.encoding || "");
  try {
    const result = randomTokenGenerator(length, encoding);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tCertificateParse(args: Record<string, unknown>): ToolCallResult {
  const certPem = String(args.certPem || "");
  try {
    const result = certificateParse(certPem);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSmtpRelayTest(args: Record<string, unknown>): ToolCallResult {
  const host = String(args.host || "");
  const port = Number(args.port || 0);
  try {
    const result = smtpRelayTest(host, port);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSmtpEnumVrfy(args: Record<string, unknown>): ToolCallResult {
  const host = String(args.host || "");
  const port = Number(args.port || 0);
  const usernames = String(args.usernames || "");
  try {
    const result = smtpEnumVrfy(host, port, usernames);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tFtpAnonymousCheck(args: Record<string, unknown>): ToolCallResult {
  const host = String(args.host || "");
  const port = Number(args.port || 0);
  try {
    const result = ftpAnonymousCheck(host, port);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSmbEnumShares(args: Record<string, unknown>): ToolCallResult {
  const host = String(args.host || "");
  try {
    const result = smbEnumShares(host);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSmbVersionDetect(args: Record<string, unknown>): ToolCallResult {
  const host = String(args.host || "");
  try {
    const result = smbVersionDetect(host);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tLdapEnum(args: Record<string, unknown>): ToolCallResult {
  const host = String(args.host || "");
  const port = Number(args.port || 0);
  try {
    const result = ldapEnum(host, port);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tKerberosUserEnum(args: Record<string, unknown>): ToolCallResult {
  const host = String(args.host || "");
  const realm = String(args.realm || "");
  const usernames = String(args.usernames || "");
  try {
    const result = kerberosUserEnum(host, realm, usernames);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tRdpCheck(args: Record<string, unknown>): ToolCallResult {
  const host = String(args.host || "");
  const port = Number(args.port || 0);
  try {
    const result = rdpCheck(host, port);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSshVersionScan(args: Record<string, unknown>): ToolCallResult {
  const host = String(args.host || "");
  const port = Number(args.port || 0);
  try {
    const result = sshVersionScan(host, port);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTelnetBannerGrab(args: Record<string, unknown>): ToolCallResult {
  const host = String(args.host || "");
  const port = Number(args.port || 0);
  try {
    const result = telnetBannerGrab(host, port);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tNetSnmpWalk(args: Record<string, unknown>): ToolCallResult {
  const host = String(args.host || "");
  const community = String(args.community || "");
  try {
    const result = netSnmpWalk(host, community);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tNtpMonlist(args: Record<string, unknown>): ToolCallResult {
  const host = String(args.host || "");
  try {
    const result = ntpMonlist(host);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tDnsZoneTransfer(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "");
  try {
    const result = await dnsZoneTransfer(domain);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tDnsSubdomainBrute(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "");
  const wordlist = String(args.wordlist || "");
  try {
    const result = await dnsSubdomainBrute(domain, wordlist);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tDnsRebindingCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "");
  try {
    const result = await dnsRebindingCheck(domain);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tIpv6Scan(args: Record<string, unknown>): ToolCallResult {
  const interfaceName = String(args.interfaceName || "");
  try {
    const result = ipv6Scan(interfaceName);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tVlanHopTest(args: Record<string, unknown>): ToolCallResult {
  const interfaceName = String(args.interfaceName || "");
  try {
    const result = vlanHopTest(interfaceName);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tWifiDeauthDetect(args: Record<string, unknown>): ToolCallResult {
  const interfaceName = String(args.interfaceName || "");
  const duration = Number(args.duration || 0);
  try {
    const result = wifiDeauthDetect(interfaceName, duration);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tArpPoisonDetect(args: Record<string, unknown>): ToolCallResult {
  const interfaceName = String(args.interfaceName || "");
  try {
    const result = arpPoisonDetect(interfaceName);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tNetworkMapGenerate(args: Record<string, unknown>): ToolCallResult {
  const subnet = String(args.subnet || "");
  try {
    const result = networkMapGenerate(subnet);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tWaybackMachineLookup(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  try {
    const result = await waybackMachineLookup(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tWaybackDiff(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  const timestamp1 = String(args.timestamp1 || "");
  const timestamp2 = String(args.timestamp2 || "");
  try {
    const result = await waybackDiff(url, timestamp1, timestamp2);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tCrtshSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "");
  try {
    const result = await crtshSearch(domain);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tHaveibeenpwnedCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const email = String(args.email || "");
  try {
    const result = await haveibeenpwnedCheck(email);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tDehashedSearch(args: Record<string, unknown>): ToolCallResult {
  const query = String(args.query || "");
  try {
    const result = dehashedSearch(query);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tHunterIoEmail(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "");
  try {
    const result = await hunterIoEmail(domain);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tPhoneNumberLookupFull(args: Record<string, unknown>): Promise<ToolCallResult> {
  const phone = String(args.phone || "");
  try {
    const result = await phoneNumberLookupFull(phone);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tSocialMediaChecker(args: Record<string, unknown>): Promise<ToolCallResult> {
  const username = String(args.username || "");
  try {
    const result = await socialMediaChecker(username);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tGravatarLookup(args: Record<string, unknown>): Promise<ToolCallResult> {
  const email = String(args.email || "");
  try {
    const result = await gravatarLookup(email);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tGithubDorksSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "");
  try {
    const result = await githubDorksSearch(query);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tGithubCommitHistory(args: Record<string, unknown>): Promise<ToolCallResult> {
  const owner = String(args.owner || "");
  const repo = String(args.repo || "");
  try {
    const result = await githubCommitHistory(owner, repo);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tGoogleDorksGenerator(args: Record<string, unknown>): ToolCallResult {
  const domain = String(args.domain || "");
  try {
    const result = googleDorksGenerator(domain);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tGoogleCacheLookup(args: Record<string, unknown>): ToolCallResult {
  const url = String(args.url || "");
  try {
    const result = googleCacheLookup(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tReverseImageSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imageUrl = String(args.imageUrl || "");
  try {
    const result = await reverseImageSearch(imageUrl);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tExifExtractFull(args: Record<string, unknown>): ToolCallResult {
  const imagePath = String(args.imagePath || "");
  try {
    const result = exifExtractFull(imagePath);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tMetadataStrip(args: Record<string, unknown>): ToolCallResult {
  const filePath = String(args.filePath || "");
  try {
    const result = metadataStrip(filePath);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tDarkwebMonitor(args: Record<string, unknown>): ToolCallResult {
  const email = String(args.email || "");
  try {
    const result = darkwebMonitor(email);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tLeakedSourceSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "");
  try {
    const result = await leakedSourceSearch(query);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tBitcoinAddressAnalysis(args: Record<string, unknown>): Promise<ToolCallResult> {
  const address = String(args.address || "");
  try {
    const result = await bitcoinAddressAnalysis(address);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tEthereumContractVerify(args: Record<string, unknown>): Promise<ToolCallResult> {
  const address = String(args.address || "");
  try {
    const result = await ethereumContractVerify(address);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tDomainWhoisHistory(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "");
  try {
    const result = await domainWhoisHistory(domain);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tReverseWhois(args: Record<string, unknown>): ToolCallResult {
  const email = String(args.email || "");
  try {
    const result = reverseWhois(email);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tDnsHistoryPassive(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "");
  try {
    const result = await dnsHistoryPassive(domain);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tBreachParse(args: Record<string, unknown>): ToolCallResult {
  const filePath = String(args.filePath || "");
  const format = String(args.format || "");
  try {
    const result = breachParse(filePath, format);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tMalwareSampleLookup(args: Record<string, unknown>): Promise<ToolCallResult> {
  const hash = String(args.hash || "");
  try {
    const result = await malwareSampleLookup(hash);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tOwaspZapScan(args: Record<string, unknown>): ToolCallResult {
  const url = String(args.url || "");
  try {
    const result = owaspZapScan(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tNucleiScan(args: Record<string, unknown>): ToolCallResult {
  const url = String(args.url || "");
  const templates = String(args.templates || "");
  try {
    const result = nucleiScan(url, templates);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tFfufFuzz(args: Record<string, unknown>): ToolCallResult {
  const url = String(args.url || "");
  const wordlist = String(args.wordlist || "");
  const mode = String(args.mode || "");
  try {
    const result = ffufFuzz(url, wordlist, mode);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tWfuzzScan(args: Record<string, unknown>): ToolCallResult {
  const url = String(args.url || "");
  const wordlist = String(args.wordlist || "");
  try {
    const result = wfuzzScan(url, wordlist);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tWpscanFull(args: Record<string, unknown>): ToolCallResult {
  const url = String(args.url || "");
  try {
    const result = wpscanFull(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tJoomscan(args: Record<string, unknown>): ToolCallResult {
  const url = String(args.url || "");
  try {
    const result = joomscan(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tDroopescan(args: Record<string, unknown>): ToolCallResult {
  const url = String(args.url || "");
  try {
    const result = droopescan(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tSslLabsGrade(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "");
  try {
    const result = await sslLabsGrade(domain);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tSecurityHeadersFull(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  try {
    const result = await securityHeadersFull(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tCorsMisconfigCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  try {
    const result = await corsMisconfigCheck(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tOpenRedirectCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  try {
    const result = await openRedirectCheck(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tXssPayloadGenerator(args: Record<string, unknown>): ToolCallResult {
  const context = String(args.context || "");
  try {
    const result = xssPayloadGenerator(context);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSqliPayloadGenerator(args: Record<string, unknown>): ToolCallResult {
  const dbType = String(args.dbType || "");
  try {
    const result = sqliPayloadGenerator(dbType);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tCommandInjectionTest(args: Record<string, unknown>): ToolCallResult {
  const url = String(args.url || "");
  const param = String(args.param || "");
  try {
    const result = commandInjectionTest(url, param);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tXxeVulnCheck(args: Record<string, unknown>): ToolCallResult {
  const url = String(args.url || "");
  try {
    const result = xxeVulnCheck(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSsrfCheck(args: Record<string, unknown>): ToolCallResult {
  const url = String(args.url || "");
  const param = String(args.param || "");
  try {
    const result = ssrfCheck(url, param);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tLfiRfiCheck(args: Record<string, unknown>): ToolCallResult {
  const url = String(args.url || "");
  const param = String(args.param || "");
  try {
    const result = lfiRfiCheck(url, param);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tCsrfTokenCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  try {
    const result = await csrfTokenCheck(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tRateLimitCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  try {
    const result = await rateLimitCheck(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tDependencyAudit(args: Record<string, unknown>): ToolCallResult {
  const projectPath = String(args.projectPath || "");
  const ecosystem = String(args.ecosystem || "");
  try {
    const result = dependencyAudit(projectPath, ecosystem);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tCsvAnalyzer(args: Record<string, unknown>): ToolCallResult {
  const csvData = String(args.csvData || "");
  try {
    const result = csvAnalyzer(csvData);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tJsonPathQuery(args: Record<string, unknown>): ToolCallResult {
  const jsonStr = String(args.jsonStr || "");
  const path = String(args.path || "");
  try {
    const result = jsonPathQuery(jsonStr, path);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSqlQueryExplainer(args: Record<string, unknown>): ToolCallResult {
  const query = String(args.query || "");
  try {
    const result = sqlQueryExplainer(query);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tDataAnonymizer(args: Record<string, unknown>): ToolCallResult {
  const data = String(args.data || "");
  const columnsToAnonymize = String(args.columnsToAnonymize || "");
  try {
    const result = dataAnonymizer(data, columnsToAnonymize);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tOutlierDetector(args: Record<string, unknown>): ToolCallResult {
  const numbers = String(args.numbers || "");
  const method = String(args.method || "");
  try {
    const result = outlierDetector(numbers, method);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tCorrelationMatrix(args: Record<string, unknown>): ToolCallResult {
  const data = String(args.data || "");
  try {
    const result = correlationMatrix(data);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tHistogramGenerator(args: Record<string, unknown>): ToolCallResult {
  const numbers = String(args.numbers || "");
  const bins = Number(args.bins || 0);
  try {
    const result = histogramGenerator(numbers, bins);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tScatterPlotGenerator(args: Record<string, unknown>): ToolCallResult {
  const xValues = String(args.xValues || "");
  const yValues = String(args.yValues || "");
  try {
    const result = scatterPlotGenerator(xValues, yValues);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTimeSeriesDecompose(args: Record<string, unknown>): ToolCallResult {
  const values = String(args.values || "");
  const period = Number(args.period || 0);
  try {
    const result = timeSeriesDecompose(values, period);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tMovingAverageCalc(args: Record<string, unknown>): ToolCallResult {
  const values = String(args.values || "");
  const window = Number(args.window || 0);
  const type = String(args.type || "");
  try {
    const result = movingAverageCalc(values, window, type);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tLinearRegression(args: Record<string, unknown>): ToolCallResult {
  const xValues = String(args.xValues || "");
  const yValues = String(args.yValues || "");
  try {
    const result = linearRegression(xValues, yValues);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tHypothesisTest(args: Record<string, unknown>): ToolCallResult {
  const sample1 = String(args.sample1 || "");
  const sample2 = String(args.sample2 || "");
  const testType = String(args.testType || "");
  try {
    const result = hypothesisTest(sample1, sample2, testType);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tConfidenceInterval(args: Record<string, unknown>): ToolCallResult {
  const values = String(args.values || "");
  const confidence = Number(args.confidence || 0);
  try {
    const result = confidenceInterval(values, confidence);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tPermutationGenerator(args: Record<string, unknown>): ToolCallResult {
  const items = String(args.items || "");
  const maxResults = Number(args.maxResults || 0);
  try {
    const result = permutationGenerator(items, maxResults);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tCombinatoricsCalc(args: Record<string, unknown>): ToolCallResult {
  const n = Number(args.n || 0);
  const k = Number(args.k || 0);
  const type = String(args.type || "");
  try {
    const result = combinatoricsCalc(n, k, type);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tMatrixOperations(args: Record<string, unknown>): ToolCallResult {
  const matrixA = String(args.matrixA || "");
  const matrixB = String(args.matrixB || "");
  const operation = String(args.operation || "");
  try {
    const result = matrixOperations(matrixA, matrixB, operation);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tVectorCalculus(args: Record<string, unknown>): ToolCallResult {
  const vectorA = String(args.vectorA || "");
  const vectorB = String(args.vectorB || "");
  const operation = String(args.operation || "");
  try {
    const result = vectorCalculus(vectorA, vectorB, operation);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tDerivativeCalculator(args: Record<string, unknown>): ToolCallResult {
  const expression = String(args.expression || "");
  const variable = String(args.variable || "");
  try {
    const result = derivativeCalculator(expression, variable);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tIntegralCalculator(args: Record<string, unknown>): ToolCallResult {
  const expression = String(args.expression || "");
  const variable = String(args.variable || "");
  const lower = Number(args.lower || 0);
  const upper = Number(args.upper || 0);
  try {
    const result = integralCalculator(expression, variable, lower, upper);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tLimitCalculator(args: Record<string, unknown>): ToolCallResult {
  const expression = String(args.expression || "");
  const variable = String(args.variable || "");
  const point = Number(args.point || 0);
  try {
    const result = limitCalculator(expression, variable, point);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSeriesSumCalculator(args: Record<string, unknown>): ToolCallResult {
  const seriesType = String(args.seriesType || "");
  const params = String(args.params || "");
  try {
    const result = seriesSumCalculator(seriesType, params);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tPrimeFactorization(args: Record<string, unknown>): ToolCallResult {
  const n = Number(args.n || 0);
  try {
    const result = primeFactorization(n);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tGcdLcmCalculator(args: Record<string, unknown>): ToolCallResult {
  const numbers = String(args.numbers || "");
  const operation = String(args.operation || "");
  try {
    const result = gcdLcmCalculator(numbers, operation);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tModularArithmetic(args: Record<string, unknown>): ToolCallResult {
  const base = Number(args.base || 0);
  const exponent = Number(args.exponent || 0);
  const modulus = Number(args.modulus || 0);
  const operation = String(args.operation || "");
  try {
    const result = modularArithmetic(base, exponent, modulus, operation);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tProbabilityDistribution(args: Record<string, unknown>): ToolCallResult {
  const distribution = String(args.distribution || "");
  const params = String(args.params || "");
  const x = Number(args.x || 0);
  try {
    const result = probabilityDistribution(distribution, params, x);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tBayesTheorem(args: Record<string, unknown>): ToolCallResult {
  const prior = Number(args.prior || 0);
  const likelihood = Number(args.likelihood || 0);
  const evidence = Number(args.evidence || 0);
  try {
    const result = bayesTheorem(prior, likelihood, evidence);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTrigonometrySolver(args: Record<string, unknown>): ToolCallResult {
  const operation = String(args.operation || "");
  const angle = Number(args.angle || 0);
  const unit = String(args.unit || "");
  try {
    const result = trigonometrySolver(operation, angle, unit);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tComplexNumberOps(args: Record<string, unknown>): ToolCallResult {
  const aReal = Number(args.aReal || 0);
  const aImag = Number(args.aImag || 0);
  const bReal = Number(args.bReal || 0);
  const bImag = Number(args.bImag || 0);
  const operation = String(args.operation || "");
  try {
    const result = complexNumberOps(aReal, aImag, bReal, bImag, operation);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tPolynomialSolver(args: Record<string, unknown>): ToolCallResult {
  const coefficients = String(args.coefficients || "");
  try {
    const result = polynomialSolver(coefficients);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tNumberBaseConvertAdvanced(args: Record<string, unknown>): ToolCallResult {
  const value = String(args.value || "");
  const fromBase = Number(args.fromBase || 0);
  const toBase = Number(args.toBase || 0);
  try {
    const result = numberBaseConvertAdvanced(value, fromBase, toBase);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextExtractEntities(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  try {
    const result = textExtractEntities(text);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextSummarizeAdvanced(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  const sentences = Number(args.sentences || 0);
  try {
    const result = textSummarizeAdvanced(text, sentences);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextKeywordExtract(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  const numKeywords = Number(args.numKeywords || 0);
  try {
    const result = textKeywordExtract(text, numKeywords);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextReadabilityScore(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  try {
    const result = textReadabilityScore(text);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextLanguageDetectAdvanced(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  try {
    const result = textLanguageDetectAdvanced(text);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextTransliterate(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  const fromScript = String(args.fromScript || "");
  const toScript = String(args.toScript || "");
  try {
    const result = textTransliterate(text, fromScript, toScript);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextPhoneticMatch(args: Record<string, unknown>): ToolCallResult {
  const word1 = String(args.word1 || "");
  const word2 = String(args.word2 || "");
  try {
    const result = textPhoneticMatch(word1, word2);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextStemLemmatize(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  const operation = String(args.operation || "");
  try {
    const result = textStemLemmatize(text, operation);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextNgramGenerator(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  const n = Number(args.n || 0);
  try {
    const result = textNgramGenerator(text, n);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextRegexTester(args: Record<string, unknown>): ToolCallResult {
  const pattern = String(args.pattern || "");
  const flags = String(args.flags || "");
  const testString = String(args.testString || "");
  try {
    const result = textRegexTester(pattern, flags, testString);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextFuzzyMatch(args: Record<string, unknown>): ToolCallResult {
  const s1 = String(args.s1 || "");
  const s2 = String(args.s2 || "");
  try {
    const result = textFuzzyMatch(s1, s2);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextExtractEmails(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  try {
    const result = textExtractEmails(text);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextExtractUrls(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  try {
    const result = textExtractUrls(text);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextExtractIps(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  try {
    const result = textExtractIps(text);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tTextExtractPhoneNumbers(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  try {
    const result = await textExtractPhoneNumbers(text);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextRedactPii(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  try {
    const result = textRedactPii(text);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextMarkdownToPlain(args: Record<string, unknown>): ToolCallResult {
  const markdown = String(args.markdown || "");
  try {
    const result = textMarkdownToPlain(markdown);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextHtmlToMarkdown(args: Record<string, unknown>): ToolCallResult {
  const html = String(args.html || "");
  try {
    const result = textHtmlToMarkdown(html);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextCsvToJson(args: Record<string, unknown>): ToolCallResult {
  const csv = String(args.csv || "");
  try {
    const result = textCsvToJson(csv);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextJsonToCsv(args: Record<string, unknown>): ToolCallResult {
  const jsonStr = String(args.jsonStr || "");
  try {
    const result = textJsonToCsv(jsonStr);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tProcessMonitor(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = processMonitor();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tDiskUsageAnalyzer(args: Record<string, unknown>): ToolCallResult {
  const path = String(args.path || "");
  try {
    const result = diskUsageAnalyzer(path);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tNetworkConnectionsList(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = networkConnectionsList();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tFirewallRulesAudit(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = firewallRulesAudit();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tCronJobsList(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = cronJobsList();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tEnvVarsInspect(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = envVarsInspect();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tLogTail(args: Record<string, unknown>): ToolCallResult {
  const logPath = String(args.logPath || "");
  const lines = Number(args.lines || 0);
  try {
    const result = logTail(logPath, lines);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tServiceStatusCheck(args: Record<string, unknown>): ToolCallResult {
  const serviceName = String(args.serviceName || "");
  try {
    const result = serviceStatusCheck(serviceName);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tDockerPsAudit(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = dockerPsAudit();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tDockerImageVulnScan(args: Record<string, unknown>): Promise<ToolCallResult> {
  const image = String(args.image || "");
  try {
    const result = await dockerImageVulnScan(image);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tK8sPodInspect(args: Record<string, unknown>): ToolCallResult {
  const namespace = String(args.namespace || "");
  try {
    const result = k8sPodInspect(namespace);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tNginxConfigCheck(args: Record<string, unknown>): ToolCallResult {
  const configPath = String(args.configPath || "");
  try {
    const result = nginxConfigCheck(configPath);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tApacheConfigCheck(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = apacheConfigCheck();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tSslCertExpiryCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domains = String(args.domains || "");
  try {
    const result = await sslCertExpiryCheck(domains);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tDnsPropagationCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "");
  const recordType = String(args.recordType || "");
  try {
    const result = await dnsPropagationCheck(domain, recordType);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tLoadAverageMonitor(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = loadAverageMonitor();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tMemoryLeakDetect(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = memoryLeakDetect();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tPortKill(args: Record<string, unknown>): ToolCallResult {
  const port = Number(args.port || 0);
  try {
    const result = portKill(port);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tFilePermissionAudit(args: Record<string, unknown>): ToolCallResult {
  const dirPath = String(args.dirPath || "");
  try {
    const result = filePermissionAudit(dirPath);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSshKeyAudit(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = sshKeyAudit();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tAwsS3BucketCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const bucketName = String(args.bucketName || "");
  try {
    const result = await awsS3BucketCheck(bucketName);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tAwsIamAudit(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = awsIamAudit();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tAwsSecurityGroupsAudit(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = awsSecurityGroupsAudit();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tAzureAdEnum(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = azureAdEnum();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tGcpProjectEnum(args: Record<string, unknown>): ToolCallResult {
  // No parameters
  try {
    const result = gcpProjectEnum();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tCloudMetadataCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  // No parameters
  try {
    const result = await cloudMetadataCheck();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTerraformValidate(args: Record<string, unknown>): ToolCallResult {
  const dirPath = String(args.dirPath || "");
  try {
    const result = terraformValidate(dirPath);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTerraformPlanDiff(args: Record<string, unknown>): ToolCallResult {
  const dirPath = String(args.dirPath || "");
  try {
    const result = terraformPlanDiff(dirPath);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tKubernetesManifestValidate(args: Record<string, unknown>): ToolCallResult {
  const filePath = String(args.filePath || "");
  try {
    const result = kubernetesManifestValidate(filePath);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tDockerComposeValidate(args: Record<string, unknown>): ToolCallResult {
  const filePath = String(args.filePath || "");
  try {
    const result = dockerComposeValidate(filePath);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tApiSchemaDiff(args: Record<string, unknown>): ToolCallResult {
  const schema1 = String(args.schema1 || "");
  const schema2 = String(args.schema2 || "");
  try {
    const result = apiSchemaDiff(schema1, schema2);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tGraphqlIntrospectionCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  try {
    const result = await graphqlIntrospectionCheck(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tApiRateLimitDiscover(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  try {
    const result = await apiRateLimitDiscover(url);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tWebhookSignatureVerify(args: Record<string, unknown>): Promise<ToolCallResult> {
  const payload = String(args.payload || "");
  const signature = String(args.signature || "");
  const secret = String(args.secret || "");
  const algorithm = String(args.algorithm || "");
  try {
    const result = await webhookSignatureVerify(payload, signature, secret, algorithm);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tOauthFlowTest(args: Record<string, unknown>): ToolCallResult {
  const authorizationUrl = String(args.authorizationUrl || "");
  const tokenUrl = String(args.tokenUrl || "");
  const clientId = String(args.clientId || "");
  const scope = String(args.scope || "");
  try {
    const result = oauthFlowTest(authorizationUrl, tokenUrl, clientId, scope);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tRiotAccountLookup(args: Record<string, unknown>): Promise<ToolCallResult> {
  const gameName = String(args.gameName || "");
  const tagLine = String(args.tagLine || "");
  try {
    const result = await riotAccountLookup(gameName, tagLine);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tLolMatchHistory(args: Record<string, unknown>): Promise<ToolCallResult> {
  const summonerName = String(args.summonerName || "");
  try {
    const result = await lolMatchHistory(summonerName);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tLolRankCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const summonerName = String(args.summonerName || "");
  const region = String(args.region || "");
  try {
    const result = await lolRankCheck(summonerName, region);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tCsgoStatsFetch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const steamId = String(args.steamId || "");
  try {
    const result = await csgoStatsFetch(steamId);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tApexLegendsStats(args: Record<string, unknown>): Promise<ToolCallResult> {
  const playerName = String(args.playerName || "");
  const platform = String(args.platform || "");
  try {
    const result = await apexLegendsStats(playerName, platform);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tRocketLeagueStats(args: Record<string, unknown>): Promise<ToolCallResult> {
  const playerName = String(args.playerName || "");
  const platform = String(args.platform || "");
  try {
    const result = await rocketLeagueStats(playerName, platform);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tOsuUserStats(args: Record<string, unknown>): Promise<ToolCallResult> {
  const username = String(args.username || "");
  try {
    const result = await osuUserStats(username);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tMinecraftServerStatus(args: Record<string, unknown>): Promise<ToolCallResult> {
  const host = String(args.host || "");
  const port = Number(args.port || 0);
  try {
    const result = await minecraftServerStatus(host, port);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tFortniteItemShop(args: Record<string, unknown>): Promise<ToolCallResult> {
  // No parameters
  try {
    const result = await fortniteItemShop();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tEpicGamesFreeGames(args: Record<string, unknown>): Promise<ToolCallResult> {
  // No parameters
  try {
    const result = await epicGamesFreeGames();
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tTwitchStreamCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const streamerName = String(args.streamerName || "");
  try {
    const result = await twitchStreamCheck(streamerName);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tTwitchClipCreate(args: Record<string, unknown>): Promise<ToolCallResult> {
  const broadcasterId = String(args.broadcasterId || "");
  try {
    const result = await twitchClipCreate(broadcasterId);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tSpotifyTrackSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "");
  try {
    const result = await spotifyTrackSearch(query);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tSpotifyPlaylistAnalyze(args: Record<string, unknown>): Promise<ToolCallResult> {
  const playlistId = String(args.playlistId || "");
  try {
    const result = await spotifyPlaylistAnalyze(playlistId);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tBoardgameGeekSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "");
  try {
    const result = await boardgameGeekSearch(query);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tPhysicsCalculator(args: Record<string, unknown>): ToolCallResult {
  const formula = String(args.formula || "");
  const values = String(args.values || "");
  try {
    const result = physicsCalculator(formula, values);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tOhmsLawCalc(args: Record<string, unknown>): ToolCallResult {
  const voltage = Number(args.voltage || 0);
  const current = Number(args.current || 0);
  const resistance = Number(args.resistance || 0);
  const power = Number(args.power || 0);
  try {
    const result = ohmsLawCalc(voltage, current, resistance, power);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tWavelengthFrequency(args: Record<string, unknown>): ToolCallResult {
  const value = Number(args.value || 0);
  const type = String(args.type || "");
  try {
    const result = wavelengthFrequency(value, type);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tRadioactiveDecayCalc(args: Record<string, unknown>): ToolCallResult {
  const initialAmount = Number(args.initialAmount || 0);
  const halfLife = Number(args.halfLife || 0);
  const time = Number(args.time || 0);
  try {
    const result = radioactiveDecayCalc(initialAmount, halfLife, time);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tUnitConvertScientific(args: Record<string, unknown>): ToolCallResult {
  const value = Number(args.value || 0);
  const fromUnit = String(args.fromUnit || "");
  const toUnit = String(args.toUnit || "");
  try {
    const result = unitConvertScientific(value, fromUnit, toUnit);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tMolarMassCalc(args: Record<string, unknown>): ToolCallResult {
  const formula = String(args.formula || "");
  try {
    const result = molarMassCalc(formula);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tChemicalEquationBalancer(args: Record<string, unknown>): ToolCallResult {
  const equation = String(args.equation || "");
  try {
    const result = chemicalEquationBalancer(equation);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tPhCalculator(args: Record<string, unknown>): ToolCallResult {
  const concentration = Number(args.concentration || 0);
  const type = String(args.type || "");
  try {
    const result = phCalculator(concentration, type);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tIdealGasLaw(args: Record<string, unknown>): ToolCallResult {
  const pressure = Number(args.pressure || 0);
  const volume = Number(args.volume || 0);
  const moles = Number(args.moles || 0);
  const temperature = Number(args.temperature || 0);
  const solveFor = String(args.solveFor || "");
  try {
    const result = idealGasLaw(pressure, volume, moles, temperature, solveFor);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tKinematicsCalc(args: Record<string, unknown>): ToolCallResult {
  const v0 = Number(args.v0 || 0);
  const a = Number(args.a || 0);
  const t = Number(args.t || 0);
  try {
    const result = kinematicsCalc(v0, a, t);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tOpticsCalc(args: Record<string, unknown>): ToolCallResult {
  const focalLength = Number(args.focalLength || 0);
  const objectDistance = Number(args.objectDistance || 0);
  try {
    const result = opticsCalc(focalLength, objectDistance);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tElectricFieldCalc(args: Record<string, unknown>): ToolCallResult {
  const charge = Number(args.charge || 0);
  const distance = Number(args.distance || 0);
  try {
    const result = electricFieldCalc(charge, distance);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tThermalExpansionCalc(args: Record<string, unknown>): ToolCallResult {
  const initialLength = Number(args.initialLength || 0);
  const coefficient = Number(args.coefficient || 0);
  const tempChange = Number(args.tempChange || 0);
  try {
    const result = thermalExpansionCalc(initialLength, coefficient, tempChange);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tAstronomicalDistance(args: Record<string, unknown>): ToolCallResult {
  const value = Number(args.value || 0);
  const fromUnit = String(args.fromUnit || "");
  const toUnit = String(args.toUnit || "");
  try {
    const result = astronomicalDistance(value, fromUnit, toUnit);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tRadioactiveDecayCalc2(args: Record<string, unknown>): ToolCallResult {
  const initialAmount = Number(args.initialAmount || 0);
  const halfLife = Number(args.halfLife || 0);
  const time = Number(args.time || 0);
  try {
    const result = radioactiveDecayCalc2(initialAmount, halfLife, time);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tGeocodeReverse(args: Record<string, unknown>): Promise<ToolCallResult> {
  const lat = Number(args.lat || 0);
  const lon = Number(args.lon || 0);
  try {
    const result = await geocodeReverse(lat, lon);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTimezoneConvertAdvanced(args: Record<string, unknown>): ToolCallResult {
  const datetime = String(args.datetime || "");
  const fromTz = String(args.fromTz || "");
  const toTz = String(args.toTz || "");
  try {
    const result = timezoneConvertAdvanced(datetime, fromTz, toTz);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tDistanceMatrix(args: Record<string, unknown>): ToolCallResult {
  const origins = String(args.origins || "");
  const destinations = String(args.destinations || "");
  try {
    const result = distanceMatrix(origins, destinations);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tElevationLookup(args: Record<string, unknown>): Promise<ToolCallResult> {
  const lat = Number(args.lat || 0);
  const lon = Number(args.lon || 0);
  try {
    const result = await elevationLookup(lat, lon);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tCountryBordering(args: Record<string, unknown>): Promise<ToolCallResult> {
  const country = String(args.country || "");
  try {
    const result = await countryBordering(country);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tCurrencyByCountry(args: Record<string, unknown>): Promise<ToolCallResult> {
  const country = String(args.country || "");
  try {
    const result = await currencyByCountry(country);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tLanguageByCountry(args: Record<string, unknown>): Promise<ToolCallResult> {
  const country = String(args.country || "");
  try {
    const result = await languageByCountry(country);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tCapitalLookup(args: Record<string, unknown>): Promise<ToolCallResult> {
  const country = String(args.country || "");
  try {
    const result = await capitalLookup(country);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tIsoCountryCode(args: Record<string, unknown>): Promise<ToolCallResult> {
  const country = String(args.country || "");
  try {
    const result = await isoCountryCode(country);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tSunriseSunsetAnywhere(args: Record<string, unknown>): Promise<ToolCallResult> {
  const lat = Number(args.lat || 0);
  const lon = Number(args.lon || 0);
  const date = String(args.date || "");
  try {
    const result = await sunriseSunsetAnywhere(lat, lon, date);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tWaterIntakeCalc(args: Record<string, unknown>): ToolCallResult {
  const weightKg = Number(args.weightKg || 0);
  const activityMinutes = Number(args.activityMinutes || 0);
  try {
    const result = waterIntakeCalc(weightKg, activityMinutes);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tHeartRateZone(args: Record<string, unknown>): ToolCallResult {
  const age = Number(args.age || 0);
  const restingHr = Number(args.restingHr || 0);
  try {
    const result = heartRateZone(age, restingHr);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tBodyFatPercentageCalc(args: Record<string, unknown>): ToolCallResult {
  const gender = String(args.gender || "");
  const heightCm = Number(args.heightCm || 0);
  const neckCm = Number(args.neckCm || 0);
  const waistCm = Number(args.waistCm || 0);
  const hipCm = Number(args.hipCm || 0);
  try {
    const result = bodyFatPercentageCalc(gender, heightCm, neckCm, waistCm, hipCm);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tIdealWeightCalc(args: Record<string, unknown>): ToolCallResult {
  const gender = String(args.gender || "");
  const heightCm = Number(args.heightCm || 0);
  try {
    const result = idealWeightCalc(gender, heightCm);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tPregnancyDueDate(args: Record<string, unknown>): ToolCallResult {
  const lastPeriod = String(args.lastPeriod || "");
  try {
    const result = pregnancyDueDate(lastPeriod);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tOvulationCalc(args: Record<string, unknown>): ToolCallResult {
  const lastPeriod = String(args.lastPeriod || "");
  const cycleLength = Number(args.cycleLength || 0);
  try {
    const result = ovulationCalc(lastPeriod, cycleLength);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tMacroNutrientCalc(args: Record<string, unknown>): ToolCallResult {
  const weightKg = Number(args.weightKg || 0);
  const goal = String(args.goal || "");
  const activityLevel = String(args.activityLevel || "");
  try {
    const result = macroNutrientCalc(weightKg, goal, activityLevel);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSleepQualityScore(args: Record<string, unknown>): ToolCallResult {
  const bedtime = String(args.bedtime || "");
  const wakeTime = String(args.wakeTime || "");
  const awakenings = Number(args.awakenings || 0);
  const deepSleepPct = Number(args.deepSleepPct || 0);
  try {
    const result = sleepQualityScore(bedtime, wakeTime, awakenings, deepSleepPct);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tStepToCalorie(args: Record<string, unknown>): ToolCallResult {
  const steps = Number(args.steps || 0);
  const weightKg = Number(args.weightKg || 0);
  try {
    const result = stepToCalorie(steps, weightKg);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tHydrationTracker(args: Record<string, unknown>): ToolCallResult {
  const glassesToday = Number(args.glassesToday || 0);
  const weightKg = Number(args.weightKg || 0);
  try {
    const result = hydrationTracker(glassesToday, weightKg);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tCodeComplexityAnalyzer(args: Record<string, unknown>): ToolCallResult {
  const code = String(args.code || "");
  const language = String(args.language || "");
  try {
    const result = codeComplexityAnalyzer(code, language);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tCodeFormatBeautifier(args: Record<string, unknown>): ToolCallResult {
  const code = String(args.code || "");
  const language = String(args.language || "");
  try {
    const result = codeFormatBeautifier(code, language);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tCodeMinifier(args: Record<string, unknown>): ToolCallResult {
  const code = String(args.code || "");
  const language = String(args.language || "");
  try {
    const result = codeMinifier(code, language);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tCodeDiffUnified(args: Record<string, unknown>): ToolCallResult {
  const code1 = String(args.code1 || "");
  const code2 = String(args.code2 || "");
  try {
    const result = codeDiffUnified(code1, code2);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tCodeLinterCheck(args: Record<string, unknown>): ToolCallResult {
  const filePath = String(args.filePath || "");
  const linter = String(args.linter || "");
  try {
    const result = codeLinterCheck(filePath, linter);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tRegexDebugger(args: Record<string, unknown>): ToolCallResult {
  const pattern = String(args.pattern || "");
  const testString = String(args.testString || "");
  try {
    const result = regexDebugger(pattern, testString);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tApiEndpointTester(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "");
  const method = String(args.method || "");
  const headers = String(args.headers || "");
  const body = String(args.body || "");
  try {
    const result = await apiEndpointTester(url, method, headers, body);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tJsonSchemaValidate(args: Record<string, unknown>): ToolCallResult {
  const jsonStr = String(args.jsonStr || "");
  const schemaStr = String(args.schemaStr || "");
  try {
    const result = jsonSchemaValidate(jsonStr, schemaStr);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tYamlValidate(args: Record<string, unknown>): ToolCallResult {
  const yamlStr = String(args.yamlStr || "");
  try {
    const result = yamlValidate(yamlStr);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tXmlToJson(args: Record<string, unknown>): ToolCallResult {
  const xmlStr = String(args.xmlStr || "");
  try {
    const result = xmlToJson(xmlStr);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSqlFormatBeautify(args: Record<string, unknown>): ToolCallResult {
  const sql = String(args.sql || "");
  try {
    const result = sqlFormatBeautify(sql);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tDockerfileLint(args: Record<string, unknown>): ToolCallResult {
  const dockerfile = String(args.dockerfile || "");
  try {
    const result = dockerfileLint(dockerfile);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tChangelogGenerator(args: Record<string, unknown>): ToolCallResult {
  const commits = String(args.commits || "");
  const version = String(args.version || "");
  try {
    const result = changelogGenerator(commits, version);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tSqlFormatBeautify2(args: Record<string, unknown>): ToolCallResult {
  const sql = String(args.sql || "");
  try {
    const result = sqlFormatBeautify2(sql);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tDockerfileLint2(args: Record<string, unknown>): ToolCallResult {
  const dockerfile = String(args.dockerfile || "");
  try {
    const result = dockerfileLint2(dockerfile);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tImageResizeCrop(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imagePath = String(args.imagePath || "");
  const width = Number(args.width || 0);
  const height = Number(args.height || 0);
  const operation = String(args.operation || "");
  try {
    const result = await imageResizeCrop(imagePath, width, height, operation);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tImageFormatConvert(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imagePath = String(args.imagePath || "");
  const targetFormat = String(args.targetFormat || "");
  try {
    const result = await imageFormatConvert(imagePath, targetFormat);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tImageMetadataStrip(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imagePath = String(args.imagePath || "");
  try {
    const result = await imageMetadataStrip(imagePath);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tImageCollageCreate(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imagePaths = String(args.imagePaths || "");
  const cols = Number(args.cols || 0);
  const rows = Number(args.rows || 0);
  try {
    const result = await imageCollageCreate(imagePaths, cols, rows);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tAudioConvert(args: Record<string, unknown>): ToolCallResult {
  const inputPath = String(args.inputPath || "");
  const targetFormat = String(args.targetFormat || "");
  const bitrate = String(args.bitrate || "");
  try {
    const result = audioConvert(inputPath, targetFormat, bitrate);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tAudioExtractFromVideo(args: Record<string, unknown>): ToolCallResult {
  const videoPath = String(args.videoPath || "");
  const targetFormat = String(args.targetFormat || "");
  try {
    const result = audioExtractFromVideo(videoPath, targetFormat);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tVideoCompress(args: Record<string, unknown>): ToolCallResult {
  const videoPath = String(args.videoPath || "");
  const crf = Number(args.crf || 0);
  try {
    const result = videoCompress(videoPath, crf);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tVideoGifConvert(args: Record<string, unknown>): ToolCallResult {
  const inputPath = String(args.inputPath || "");
  const outputFormat = String(args.outputFormat || "");
  const fps = Number(args.fps || 0);
  const width = Number(args.width || 0);
  try {
    const result = videoGifConvert(inputPath, outputFormat, fps, width);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tTextToSpeechMulti(args: Record<string, unknown>): ToolCallResult {
  const text = String(args.text || "");
  const voice = String(args.voice || "");
  const language = String(args.language || "");
  try {
    const result = textToSpeechMulti(text, voice, language);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tImageWatermarkAdd(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imagePath = String(args.imagePath || "");
  const watermarkText = String(args.watermarkText || "");
  const opacity = Number(args.opacity || 0);
  try {
    const result = await imageWatermarkAdd(imagePath, watermarkText, opacity);
    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── Amazon Toolkit Handlers ──────────────────────────────────────────────────

async function tAmazonWishlistScrape(args: Record<string, unknown>): Promise<ToolCallResult> {
  const wishlistUrl = String(args.wishlistUrl || "");
  const domain = String(args.domain || "com");
  if (!wishlistUrl) return { success: false, data: "❌ wishlistUrl requis" };
  try {
    const result = await amazonWishlistScrape(wishlistUrl, domain);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tAmazonPriceTrack(args: Record<string, unknown>): Promise<ToolCallResult> {
  const asin = String(args.asin || "");
  const domain = String(args.domain || "com");
  if (!asin) return { success: false, data: "❌ asin requis" };
  try {
    const result = await amazonPriceTrack(asin, domain);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tAmazonPriceHistory(args: Record<string, unknown>): Promise<ToolCallResult> {
  const asin = String(args.asin || "");
  const domain = String(args.domain || "com");
  const days = Number(args.days || 30);
  if (!asin) return { success: false, data: "❌ asin requis" };
  try {
    const result = await amazonPriceHistory(asin, domain, days);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tAmazonProductLookup(args: Record<string, unknown>): Promise<ToolCallResult> {
  const asin = String(args.asin || "");
  const domain = String(args.domain || "com");
  if (!asin) return { success: false, data: "❌ asin requis" };
  try {
    const result = await amazonProductLookup(asin, domain);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tAmazonCartMonitor(args: Record<string, unknown>): Promise<ToolCallResult> {
  const sessionDir = String(args.sessionDir || "/tmp/amazon-session");
  try {
    const result = await amazonCartMonitor(sessionDir);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tAmazonPriceAlertCreate(args: Record<string, unknown>): ToolCallResult {
  const asin = String(args.asin || "");
  const targetPrice = Number(args.targetPrice || 0);
  const channelId = args.channelId ? String(args.channelId) : undefined;
  if (!asin || !targetPrice) return { success: false, data: "❌ asin et targetPrice requis" };
  try {
    const result = amazonPriceAlertCreate(asin, targetPrice, channelId);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tAmazonPriceAlertCheck(): Promise<ToolCallResult> {
  try {
    const result = await amazonPriceAlertCheck();
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tAmazonPriceAlertDelete(args: Record<string, unknown>): ToolCallResult {
  const alertId = String(args.alertId || "");
  if (!alertId) return { success: false, data: "❌ alertId requis" };
  try {
    const result = amazonPriceAlertDelete(alertId);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

function tAmazonWishlistDiff(args: Record<string, unknown>): ToolCallResult {
  const wishlistUrl = String(args.wishlistUrl || "");
  if (!wishlistUrl) return { success: false, data: "❌ wishlistUrl requis" };
  try {
    const result = amazonWishlistDiff(wishlistUrl);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tAmazonDealSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "com");
  const category = args.category ? String(args.category) : "";
  try {
    const result = await amazonDealSearch(domain, category);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tAmazonBestSellers(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "com");
  const category = String(args.category || "electronics");
  try {
    const result = await amazonBestSellers(domain, category);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tAmazonCouponSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "com");
  const keyword = String(args.keyword || "");
  if (!keyword) return { success: false, data: "❌ keyword requis" };
  try {
    const result = await amazonCouponSearch(domain, keyword);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tAmazonSubscribeSaveCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const sessionDir = String(args.sessionDir || "/tmp/amazon-session");
  try {
    const result = await amazonSubscribeSaveCheck(sessionDir);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tAmazonOrderHistory(args: Record<string, unknown>): Promise<ToolCallResult> {
  const sessionDir = String(args.sessionDir || "/tmp/amazon-session");
  const year = String(args.year || "2026");
  try {
    const result = await amazonOrderHistory(sessionDir, year);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function tAmazonReviewSummary(args: Record<string, unknown>): Promise<ToolCallResult> {
  const asin = String(args.asin || "");
  const domain = String(args.domain || "com");
  if (!asin) return { success: false, data: "❌ asin requis" };
  try {
    const result = await amazonReviewSummary(asin, domain);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}
