/**
 * generate-tool-regs.js — Generates tool definitions, switch cases, and handler functions
 * for the 15 new toolkits and appends them to agentToolsExtended.ts
 * Run: node scripts/generate-tool-regs.js
 */
const fs = require("fs");
const path = require("path");

const toolkits = [
  { file: "cryptoToolkit", prefix: "crypto", tools: [
    { name: "hash_crack_dictionary", desc: "Tente de casser un hash via dictionnaire (hashcat/john) dans le container Kali", params: { hash: "string", hashType: "string", wordlist: "string" }, required: ["hash", "hashType"], risk: "high" },
    { name: "hash_identify_advanced", desc: "Identifie un hash avec précision (bcrypt, argon2, NTLM, etc.)", params: { hash: "string" }, required: ["hash"], risk: "low" },
    { name: "generate_hmac", desc: "Génère un HMAC-SHA256/SHA512 pour vérifier l'intégrité d'un message", params: { message: "string", key: "string", algorithm: "string" }, required: ["message", "key"], risk: "low" },
    { name: "crypto_aes_decrypt", desc: "Déchiffre AES-256-GCM/CBC avec clé + IV fournis", params: { encryptedData: "string", key: "string", iv: "string", mode: "string" }, required: ["encryptedData", "key", "iv"], risk: "medium" },
    { name: "rsa_keypair_generate", desc: "Génère une paire de clés RSA (2048/4096 bits)", params: { bits: "number" }, required: [], risk: "low" },
    { name: "rsa_encrypt", desc: "Chiffre un message avec RSA (clé publique PEM)", params: { message: "string", publicKeyPem: "string" }, required: ["message", "publicKeyPem"], risk: "low" },
    { name: "rsa_decrypt", desc: "Déchiffre un message RSA (clé privée PEM)", params: { encryptedBase64: "string", privateKeyPem: "string" }, required: ["encryptedBase64", "privateKeyPem"], risk: "medium" },
    { name: "pgp_encrypt", desc: "Chiffre un message avec PGP (gpg dans Kali)", params: { message: "string", recipientKey: "string" }, required: ["message", "recipientKey"], risk: "low" },
    { name: "pgp_decrypt", desc: "Déchiffre un message PGP avec clé privée", params: { encryptedMessage: "string" }, required: ["encryptedMessage"], risk: "medium" },
    { name: "stego_extract_lsb", desc: "Extrait un message caché dans une image (LSB steganography)", params: { imagePath: "string" }, required: ["imagePath"], risk: "low" },
    { name: "stego_hide_lsb", desc: "Cache un message dans une image via LSB", params: { imagePath: "string", message: "string", outputFile: "string" }, required: ["imagePath", "message", "outputFile"], risk: "low" },
    { name: "steganalysis_zscore", desc: "Analyse stéganographique avancée (chi-square, z-score)", params: { imagePath: "string" }, required: ["imagePath"], risk: "low" },
    { name: "xor_cipher", desc: "Chiffre/déchiffre XOR avec clé custom", params: { data: "string", key: "string" }, required: ["data", "key"], risk: "low" },
    { name: "frequency_analysis", desc: "Analyse de fréquence pour casser les chiffres classiques", params: { text: "string" }, required: ["text"], risk: "low" },
    { name: "random_token_generator", desc: "Génère un token sécurisé (hex, base64, base32, URL-safe)", params: { length: "number", encoding: "string" }, required: [], risk: "low" },
    { name: "certificate_parse", desc: "Parse un certificat X.509 (PEM/DER) et affiche tous les champs", params: { certPem: "string" }, required: ["certPem"], risk: "low" },
  ]},
  { file: "networkToolkit", prefix: "net", tools: [
    { name: "smtp_relay_test", desc: "Teste si un serveur SMTP accepte le relais ouvert", params: { host: "string", port: "number" }, required: ["host"], risk: "high" },
    { name: "smtp_enum_vrfy", desc: "Énumère les utilisateurs via SMTP VRFY/EXPN", params: { host: "string", port: "number", usernames: "string" }, required: ["host", "usernames"], risk: "high" },
    { name: "ftp_anonymous_check", desc: "Vérifie si un serveur FTP accepte les connexions anonymes", params: { host: "string", port: "number" }, required: ["host"], risk: "medium" },
    { name: "smb_enum_shares", desc: "Énumère les shares SMB via enum4linux", params: { host: "string" }, required: ["host"], risk: "high" },
    { name: "smb_version_detect", desc: "Détecte la version SMB et l'OS distant", params: { host: "string" }, required: ["host"], risk: "medium" },
    { name: "ldap_enum", desc: "Énumère un annuaire LDAP (users, groups, computers)", params: { host: "string", port: "number" }, required: ["host"], risk: "high" },
    { name: "kerberos_user_enum", desc: "Énumère les utilisateurs via Kerberos pre-auth", params: { host: "string", realm: "string", usernames: "string" }, required: ["host", "realm", "usernames"], risk: "high" },
    { name: "rdp_check", desc: "Vérifie si RDP est accessible et récupère les infos", params: { host: "string", port: "number" }, required: ["host"], risk: "medium" },
    { name: "ssh_version_scan", desc: "Scanne la version SSH et les algorithmes supportés", params: { host: "string", port: "number" }, required: ["host"], risk: "medium" },
    { name: "telnet_banner_grab", desc: "Banner grab sur Telnet (port 23)", params: { host: "string", port: "number" }, required: ["host"], risk: "low" },
    { name: "snmp_walk", desc: "SNMP walk complet sur une communauté donnée", params: { host: "string", community: "string" }, required: ["host"], risk: "medium" },
    { name: "ntp_monlist", desc: "Vérifie si NTP est vulnérable à amplification (monlist)", params: { host: "string" }, required: ["host"], risk: "medium" },
    { name: "dns_zone_transfer", desc: "Tente un transfert de zone DNS (AXFR)", params: { domain: "string" }, required: ["domain"], risk: "medium" },
    { name: "dns_subdomain_brute", desc: "Brute-force les sous-domaines avec wordlist", params: { domain: "string", wordlist: "string" }, required: ["domain"], risk: "medium" },
    { name: "dns_rebinding_check", desc: "Vérifie si un domaine est vulnérable au DNS rebinding", params: { domain: "string" }, required: ["domain"], risk: "low" },
    { name: "ipv6_scan", desc: "Scan IPv6 via multicast (ff02::1)", params: { interfaceName: "string" }, required: [], risk: "medium" },
    { name: "vlan_hop_test", desc: "Teste le VLAN hopping", params: { interfaceName: "string" }, required: [], risk: "high" },
    { name: "wifi_deauth_detect", desc: "Détecte les attaques deauthentication WiFi", params: { interfaceName: "string", duration: "number" }, required: [], risk: "medium" },
    { name: "arp_poison_detect", desc: "Détecte l'ARP poisoning sur le réseau local", params: { interfaceName: "string" }, required: [], risk: "low" },
    { name: "network_map_generate", desc: "Génère une carte réseau (topologie) via nmap", params: { subnet: "string" }, required: ["subnet"], risk: "medium" },
  ]},
  { file: "osintToolkit", prefix: "osint", tools: [
    { name: "wayback_machine_lookup", desc: "Recherche les snapshots archivés d'une URL sur Wayback Machine", params: { url: "string" }, required: ["url"], risk: "low" },
    { name: "wayback_diff", desc: "Compare deux versions archivées d'une page web", params: { url: "string", timestamp1: "string", timestamp2: "string" }, required: ["url", "timestamp1", "timestamp2"], risk: "low" },
    { name: "crtsh_search", desc: "Recherche les certificats SSL émis pour un domaine (crt.sh)", params: { domain: "string" }, required: ["domain"], risk: "low" },
    { name: "haveibeenpwned_check", desc: "Vérifie si un email apparaît dans une breach", params: { email: "string" }, required: ["email"], risk: "low" },
    { name: "dehashed_search", desc: "Recherche dans les bases de données leakées (DeHashed)", params: { query: "string" }, required: ["query"], risk: "medium" },
    { name: "hunter_io_email", desc: "Trouve les emails d'un domaine via Hunter.io", params: { domain: "string" }, required: ["domain"], risk: "low" },
    { name: "phone_number_lookup_full", desc: "Lookup complet d'un numéro (carrier, line type)", params: { phone: "string" }, required: ["phone"], risk: "low" },
    { name: "social_media_checker", desc: "Vérifie la disponibilité d'un username sur 50+ réseaux", params: { username: "string" }, required: ["username"], risk: "low" },
    { name: "gravatar_lookup", desc: "Récupère l'avatar Gravatar et le profil d'un email", params: { email: "string" }, required: ["email"], risk: "low" },
    { name: "github_dorks_search", desc: "Recherche de secrets leakés sur GitHub via code search", params: { query: "string" }, required: ["query"], risk: "low" },
    { name: "github_commit_history", desc: "Analyse l'historique des commits d'un repo pour des secrets", params: { owner: "string", repo: "string" }, required: ["owner", "repo"], risk: "low" },
    { name: "google_dorks_generator", desc: "Génère des Google dorks pour la reconnaissance", params: { domain: "string" }, required: ["domain"], risk: "low" },
    { name: "google_cache_lookup", desc: "Récupère la version cache Google d'une page", params: { url: "string" }, required: ["url"], risk: "low" },
    { name: "reverse_image_search", desc: "Recherche inversée d'image (TinEye / Google Images)", params: { imageUrl: "string" }, required: ["imageUrl"], risk: "low" },
    { name: "exif_extract_full", desc: "Extrait TOUTES les métadonnées EXIF d'une image", params: { imagePath: "string" }, required: ["imagePath"], risk: "low" },
    { name: "metadata_strip", desc: "Supprime toutes les métadonnées d'un fichier", params: { filePath: "string" }, required: ["filePath"], risk: "low" },
    { name: "darkweb_monitor", desc: "Surveille si un email/domaine apparaît sur le darkweb", params: { email: "string" }, required: ["email"], risk: "low" },
    { name: "leaked_source_search", desc: "Recherche dans les bases leakées (IntelligenceX, etc.)", params: { query: "string" }, required: ["query"], risk: "medium" },
    { name: "bitcoin_address_analysis", desc: "Analyse une adresse Bitcoin (balance, transactions)", params: { address: "string" }, required: ["address"], risk: "low" },
    { name: "ethereum_contract_verify", desc: "Vérifie et décompile un smart contract Ethereum", params: { address: "string" }, required: ["address"], risk: "low" },
    { name: "domain_whois_history", desc: "Historique WHOIS complet d'un domaine", params: { domain: "string" }, required: ["domain"], risk: "low" },
    { name: "reverse_whois", desc: "Trouve tous les domaines enregistrés par un email/nom", params: { email: "string" }, required: ["email"], risk: "low" },
    { name: "dns_history_passive", desc: "Historique DNS passif (SecurityTrails / PassiveDNS)", params: { domain: "string" }, required: ["domain"], risk: "low" },
    { name: "breach_parse", desc: "Parse et structure une base de données leakée", params: { filePath: "string", format: "string" }, required: ["filePath"], risk: "medium" },
    { name: "malware_sample_lookup", desc: "Lookup d'un hash de malware (VirusTotal, MalwareBazaar)", params: { hash: "string" }, required: ["hash"], risk: "low" },
  ]},
  { file: "securityAuditToolkit", prefix: "sec", tools: [
    { name: "owasp_zap_scan", desc: "Scan OWASP ZAP d'une URL (active scan) dans Kali", params: { url: "string" }, required: ["url"], risk: "high" },
    { name: "nuclei_scan", desc: "Scan Nuclei avec templates pour vulnérabilités connues", params: { url: "string", templates: "string" }, required: ["url"], risk: "high" },
    { name: "ffuf_fuzz", desc: "Fuzzing de directories/paramètres avec ffuf", params: { url: "string", wordlist: "string", mode: "string" }, required: ["url"], risk: "high" },
    { name: "wfuzz_scan", desc: "Fuzzing web avec Wfuzz", params: { url: "string", wordlist: "string" }, required: ["url"], risk: "high" },
    { name: "wpscan_full", desc: "Scan WordPress complet avec WPScan", params: { url: "string" }, required: ["url"], risk: "high" },
    { name: "joomscan", desc: "Scan Joomla avec JoomScan", params: { url: "string" }, required: ["url"], risk: "high" },
    { name: "droopescan", desc: "Scan Drupal avec Droopescan", params: { url: "string" }, required: ["url"], risk: "high" },
    { name: "ssl_labs_grade", desc: "Grade SSL Labs d'un domaine (API)", params: { domain: "string" }, required: ["domain"], risk: "low" },
    { name: "security_headers_full", desc: "Audit complet des security headers (A+ à F)", params: { url: "string" }, required: ["url"], risk: "low" },
    { name: "cors_misconfig_check", desc: "Détecte les mauvaises configurations CORS", params: { url: "string" }, required: ["url"], risk: "low" },
    { name: "open_redirect_check", desc: "Détecte les vulnérabilités d'open redirect", params: { url: "string" }, required: ["url"], risk: "low" },
    { name: "xss_payload_generator", desc: "Génère des payloads XSS (reflected, stored, DOM)", params: { context: "string" }, required: [], risk: "low" },
    { name: "sqli_payload_generator", desc: "Génère des payloads SQL Injection", params: { dbType: "string" }, required: [], risk: "low" },
    { name: "command_injection_test", desc: "Teste les injections de commandes (OS command injection)", params: { url: "string", param: "string" }, required: ["url", "param"], risk: "medium" },
    { name: "xxe_vuln_check", desc: "Vérifie les vulnérabilités XXE (XML External Entity)", params: { url: "string" }, required: ["url"], risk: "medium" },
    { name: "ssrf_check", desc: "Détecte les vulnérabilités SSRF", params: { url: "string", param: "string" }, required: ["url", "param"], risk: "medium" },
    { name: "lfi_rfi_check", desc: "Vérifie les LFI/RFI (Local/Remote File Inclusion)", params: { url: "string", param: "string" }, required: ["url", "param"], risk: "medium" },
    { name: "csrf_token_check", desc: "Vérifie la présence et validité des tokens CSRF", params: { url: "string" }, required: ["url"], risk: "low" },
    { name: "rate_limit_check", desc: "Vérifie si une API a un rate limiting", params: { url: "string" }, required: ["url"], risk: "low" },
    { name: "dependency_audit", desc: "Audit de vulnérabilités des dépendances (npm/pip/cargo)", params: { projectPath: "string", ecosystem: "string" }, required: ["projectPath"], risk: "low" },
  ]},
  { file: "dataScienceToolkit", prefix: "ds", tools: [
    { name: "csv_analyzer", desc: "Analyse statistique complète d'un CSV (colonnes, types, corrélations)", params: { csvData: "string" }, required: ["csvData"], risk: "low" },
    { name: "json_path_query", desc: "Exécute une requête JSONPath sur un JSON complexe", params: { jsonStr: "string", path: "string" }, required: ["jsonStr", "path"], risk: "low" },
    { name: "sql_query_explainer", desc: "Explique le plan d'exécution d'une requête SQL", params: { query: "string" }, required: ["query"], risk: "low" },
    { name: "data_anonymizer", desc: "Anonymise un dataset (k-anonymity, suppression PII)", params: { data: "string", columnsToAnonymize: "string" }, required: ["data", "columnsToAnonymize"], risk: "low" },
    { name: "outlier_detector", desc: "Détecte les outliers (IQR, Z-score)", params: { numbers: "string", method: "string" }, required: ["numbers"], risk: "low" },
    { name: "correlation_matrix", desc: "Calcule la matrice de corrélation d'un dataset", params: { data: "string" }, required: ["data"], risk: "low" },
    { name: "histogram_generator", desc: "Génère un histogramme à partir de données numériques", params: { numbers: "string", bins: "number" }, required: ["numbers"], risk: "low" },
    { name: "scatter_plot_generator", desc: "Génère un scatter plot à partir de deux séries", params: { xValues: "string", yValues: "string" }, required: ["xValues", "yValues"], risk: "low" },
    { name: "time_series_decompose", desc: "Décompose une série temporelle (tendance, saisonnalité)", params: { values: "string", period: "number" }, required: ["values"], risk: "low" },
    { name: "moving_average_calc", desc: "Calcule les moyennes mobiles (SMA, EMA, WMA)", params: { values: "string", window: "number", type: "string" }, required: ["values"], risk: "low" },
    { name: "linear_regression", desc: "Régression linéaire simple sur deux séries", params: { xValues: "string", yValues: "string" }, required: ["xValues", "yValues"], risk: "low" },
    { name: "hypothesis_test", desc: "Test d'hypothèse (t-test, chi-square)", params: { sample1: "string", sample2: "string", testType: "string" }, required: ["sample1", "sample2"], risk: "low" },
    { name: "confidence_interval", desc: "Calcule l'intervalle de confiance d'un échantillon", params: { values: "string", confidence: "number" }, required: ["values"], risk: "low" },
    { name: "permutation_generator", desc: "Génère toutes les permutations d'un ensemble", params: { items: "string", maxResults: "number" }, required: ["items"], risk: "low" },
    { name: "combinatorics_calc", desc: "Calculs combinatoires (arrangements, combinaisons)", params: { n: "number", k: "number", type: "string" }, required: ["n", "k"], risk: "low" },
  ]},
  { file: "mathToolkit", prefix: "math", tools: [
    { name: "matrix_operations", desc: "Opérations matricielles (add, multiply, determinant, transpose)", params: { matrixA: "string", matrixB: "string", operation: "string" }, required: ["matrixA", "operation"], risk: "low" },
    { name: "vector_calculus", desc: "Calcul vectoriel (dot, cross, magnitude, angle)", params: { vectorA: "string", vectorB: "string", operation: "string" }, required: ["vectorA", "operation"], risk: "low" },
    { name: "derivative_calculator", desc: "Calcule la dérivée d'une expression symbolique", params: { expression: "string", variable: "string" }, required: ["expression"], risk: "low" },
    { name: "integral_calculator", desc: "Calcule l'intégrale d'une expression (Simpson's rule)", params: { expression: "string", variable: "string", lower: "number", upper: "number" }, required: ["expression"], risk: "low" },
    { name: "limit_calculator", desc: "Calcule la limite d'une fonction en un point", params: { expression: "string", variable: "string", point: "number" }, required: ["expression"], risk: "low" },
    { name: "series_sum_calculator", desc: "Calcule la somme d'une série (arithmétique, géométrique)", params: { seriesType: "string", params: "string" }, required: ["seriesType", "params"], risk: "low" },
    { name: "prime_factorization", desc: "Décompose un nombre en facteurs premiers", params: { n: "number" }, required: ["n"], risk: "low" },
    { name: "gcd_lcm_calculator", desc: "Calcule PGCD et PPCM de plusieurs nombres", params: { numbers: "string", operation: "string" }, required: ["numbers", "operation"], risk: "low" },
    { name: "modular_arithmetic", desc: "Arithmétique modulaire (power mod, inverse mod, CRT)", params: { base: "number", exponent: "number", modulus: "number", operation: "string" }, required: ["base", "modulus", "operation"], risk: "low" },
    { name: "probability_distribution", desc: "Calcule les probabilités (binomiale, normale, Poisson)", params: { distribution: "string", params: "string", x: "number" }, required: ["distribution", "params"], risk: "low" },
    { name: "bayes_theorem", desc: "Calcule la probabilité via le théorème de Bayes", params: { prior: "number", likelihood: "number", evidence: "number" }, required: ["prior", "likelihood", "evidence"], risk: "low" },
    { name: "trigonometry_solver", desc: "Résout des équations trigonométriques", params: { operation: "string", angle: "number", unit: "string" }, required: ["operation", "angle"], risk: "low" },
    { name: "complex_number_ops", desc: "Opérations sur nombres complexes", params: { aReal: "number", aImag: "number", bReal: "number", bImag: "number", operation: "string" }, required: ["aReal", "aImag", "operation"], risk: "low" },
    { name: "polynomial_solver", desc: "Trouve les racines d'un polynôme (réelles et complexes)", params: { coefficients: "string" }, required: ["coefficients"], risk: "low" },
    { name: "number_base_convert_advanced", desc: "Conversion entre bases (2, 8, 10, 16, 36, 64)", params: { value: "string", fromBase: "number", toBase: "number" }, required: ["value", "fromBase", "toBase"], risk: "low" },
  ]},
  { file: "textNlpToolkit", prefix: "nlp", tools: [
    { name: "text_extract_entities", desc: "Extraction d'entités nommées (NER) — emails, URLs, IPs, phones, dates", params: { text: "string" }, required: ["text"], risk: "low" },
    { name: "text_summarize_advanced", desc: "Résumé extractif d'un long texte", params: { text: "string", sentences: "number" }, required: ["text"], risk: "low" },
    { name: "text_keyword_extract", desc: "Extraction de mots-clés (TF-IDF, YAKE)", params: { text: "string", numKeywords: "number" }, required: ["text"], risk: "low" },
    { name: "text_readability_score", desc: "Score de lisibilité (Flesch-Kincaid, Gunning Fog, SMOG)", params: { text: "string" }, required: ["text"], risk: "low" },
    { name: "text_language_detect_advanced", desc: "Détection de langue avec confiance", params: { text: "string" }, required: ["text"], risk: "low" },
    { name: "text_transliterate", desc: "Translittération (Cyrillique→Latin, Arabe→Latin)", params: { text: "string", fromScript: "string", toScript: "string" }, required: ["text", "fromScript", "toScript"], risk: "low" },
    { name: "text_phonetic_match", desc: "Correspondance phonétique (Soundex, Metaphone)", params: { word1: "string", word2: "string" }, required: ["word1", "word2"], risk: "low" },
    { name: "text_stem_lemmatize", desc: "Stemming et lemmatisation d'un texte", params: { text: "string", operation: "string" }, required: ["text", "operation"], risk: "low" },
    { name: "text_ngram_generator", desc: "Génère les n-grams d'un texte", params: { text: "string", n: "number" }, required: ["text"], risk: "low" },
    { name: "text_regex_tester", desc: "Teste une regex avec groupes capturés", params: { pattern: "string", flags: "string", testString: "string" }, required: ["pattern", "testString"], risk: "low" },
    { name: "text_fuzzy_match", desc: "Correspondance floue (Levenshtein, Jaro-Winkler)", params: { s1: "string", s2: "string" }, required: ["s1", "s2"], risk: "low" },
    { name: "text_extract_emails", desc: "Extrait tous les emails d'un texte", params: { text: "string" }, required: ["text"], risk: "low" },
    { name: "text_extract_urls", desc: "Extrait toutes les URLs d'un texte", params: { text: "string" }, required: ["text"], risk: "low" },
    { name: "text_extract_ips", desc: "Extrait toutes les adresses IP d'un texte", params: { text: "string" }, required: ["text"], risk: "low" },
    { name: "text_extract_phone_numbers", desc: "Extrait les numéros de téléphone d'un texte", params: { text: "string" }, required: ["text"], risk: "low" },
    { name: "text_redact_pii", desc: "Masque les PII dans un texte (emails, téléphones, SSN, CB)", params: { text: "string" }, required: ["text"], risk: "low" },
    { name: "text_markdown_to_plain", desc: "Convertit Markdown en texte brut", params: { markdown: "string" }, required: ["markdown"], risk: "low" },
    { name: "text_html_to_markdown", desc: "Convertit HTML en Markdown", params: { html: "string" }, required: ["html"], risk: "low" },
    { name: "text_csv_to_json", desc: "Convertit CSV en JSON", params: { csv: "string" }, required: ["csv"], risk: "low" },
    { name: "text_json_to_csv", desc: "Convertit JSON en CSV", params: { jsonStr: "string" }, required: ["jsonStr"], risk: "low" },
  ]},
  { file: "systemDevopsToolkit", prefix: "sys", tools: [
    { name: "process_monitor", desc: "Liste et surveille les processus (CPU, mémoire)", params: {}, required: [], risk: "low" },
    { name: "disk_usage_analyzer", desc: "Analyse l'utilisation disque par répertoire", params: { path: "string" }, required: [], risk: "low" },
    { name: "network_connections_list", desc: "Liste toutes les connexions réseau actives", params: {}, required: [], risk: "low" },
    { name: "firewall_rules_audit", desc: "Audite les règles firewall (iptables / ufw)", params: {}, required: [], risk: "medium" },
    { name: "cron_jobs_list", desc: "Liste tous les cron jobs du système", params: {}, required: [], risk: "low" },
    { name: "env_vars_inspect", desc: "Inspecte les variables d'environnement (sans secrets)", params: {}, required: [], risk: "low" },
    { name: "log_tail", desc: "Tail les logs système avec filtre", params: { logPath: "string", lines: "number" }, required: ["logPath"], risk: "low" },
    { name: "service_status_check", desc: "Vérifie le statut des services systemd", params: { serviceName: "string" }, required: ["serviceName"], risk: "low" },
    { name: "docker_ps_audit", desc: "Audite les containers Docker (ports, volumes, env)", params: {}, required: [], risk: "low" },
    { name: "docker_image_vuln_scan", desc: "Scan de vulnérabilités d'une image Docker (Trivy)", params: { image: "string" }, required: ["image"], risk: "medium" },
    { name: "k8s_pod_inspect", desc: "Inspecte les pods Kubernetes", params: { namespace: "string" }, required: [], risk: "low" },
    { name: "nginx_config_check", desc: "Valide la configuration Nginx", params: { configPath: "string" }, required: [], risk: "low" },
    { name: "apache_config_check", desc: "Valide la configuration Apache", params: {}, required: [], risk: "low" },
    { name: "ssl_cert_expiry_check", desc: "Vérifie l'expiration des certificats SSL", params: { domains: "string" }, required: ["domains"], risk: "low" },
    { name: "dns_propagation_check", desc: "Vérifie la propagation DNS mondiale", params: { domain: "string", recordType: "string" }, required: ["domain"], risk: "low" },
    { name: "load_average_monitor", desc: "Surveille la charge système (load average, CPU)", params: {}, required: [], risk: "low" },
    { name: "memory_leak_detect", desc: "Détecte les fuites mémoire (heap snapshot)", params: {}, required: [], risk: "low" },
    { name: "port_kill", desc: "Tue le processus qui occupe un port spécifique", params: { port: "number" }, required: ["port"], risk: "medium" },
    { name: "file_permission_audit", desc: "Audite les permissions de fichiers (SUID, world-writable)", params: { dirPath: "string" }, required: [], risk: "low" },
    { name: "ssh_key_audit", desc: "Audite les clés SSH (type, bits, known_hosts)", params: {}, required: [], risk: "low" },
  ]},
  { file: "cloudApiToolkit", prefix: "cloud", tools: [
    { name: "aws_s3_bucket_check", desc: "Vérifie si un bucket S3 est public/accessible", params: { bucketName: "string" }, required: ["bucketName"], risk: "low" },
    { name: "aws_iam_audit", desc: "Audite les politiques IAM (permissions excessives)", params: {}, required: [], risk: "medium" },
    { name: "aws_security_groups_audit", desc: "Audite les security groups AWS", params: {}, required: [], risk: "medium" },
    { name: "azure_ad_enum", desc: "Énumère les utilisateurs/groups Azure AD", params: {}, required: [], risk: "high" },
    { name: "gcp_project_enum", desc: "Énumère les projets GCP et leurs APIs", params: {}, required: [], risk: "medium" },
    { name: "cloud_metadata_check", desc: "Vérifie si le cloud metadata endpoint est accessible (SSRF)", params: {}, required: [], risk: "low" },
    { name: "terraform_validate", desc: "Valide une configuration Terraform", params: { dirPath: "string" }, required: ["dirPath"], risk: "low" },
    { name: "terraform_plan_diff", desc: "Affiche le diff d'un terraform plan", params: { dirPath: "string" }, required: ["dirPath"], risk: "low" },
    { name: "kubernetes_manifest_validate", desc: "Valide un manifest Kubernetes", params: { filePath: "string" }, required: ["filePath"], risk: "low" },
    { name: "docker_compose_validate", desc: "Valide un docker-compose.yml", params: { filePath: "string" }, required: [], risk: "low" },
    { name: "api_schema_diff", desc: "Compare deux schémas d'API (OpenAPI)", params: { schema1: "string", schema2: "string" }, required: ["schema1", "schema2"], risk: "low" },
    { name: "graphql_introspection_check", desc: "Vérifie si l'introspection GraphQL est activée", params: { url: "string" }, required: ["url"], risk: "low" },
    { name: "api_rate_limit_discover", desc: "Découvre les limites de rate limiting d'une API", params: { url: "string" }, required: ["url"], risk: "low" },
    { name: "webhook_signature_verify", desc: "Vérifie la signature d'un webhook (HMAC)", params: { payload: "string", signature: "string", secret: "string", algorithm: "string" }, required: ["payload", "signature", "secret"], risk: "low" },
    { name: "oauth_flow_test", desc: "Teste un flow OAuth2 (authorization code, client credentials)", params: { authorizationUrl: "string", tokenUrl: "string", clientId: "string", scope: "string" }, required: ["authorizationUrl", "tokenUrl", "clientId"], risk: "low" },
  ]},
  { file: "gamingToolkit", prefix: "game", tools: [
    { name: "riot_account_lookup", desc: "Lookup d'un compte Riot (LoL, Valorant, TFT)", params: { gameName: "string", tagLine: "string" }, required: ["gameName", "tagLine"], risk: "low" },
    { name: "lol_match_history", desc: "Historique de matchs League of Legends", params: { summonerName: "string" }, required: ["summonerName"], risk: "low" },
    { name: "lol_rank_check", desc: "Vérifie le rang LoL d'un joueur", params: { summonerName: "string", region: "string" }, required: ["summonerName"], risk: "low" },
    { name: "csgo_stats_fetch", desc: "Récupère les stats CSGO/CS2 d'un joueur", params: { steamId: "string" }, required: ["steamId"], risk: "low" },
    { name: "apex_legends_stats", desc: "Stats Apex Legends d'un joueur", params: { playerName: "string", platform: "string" }, required: ["playerName"], risk: "low" },
    { name: "rocket_league_stats", desc: "Stats Rocket League d'un joueur", params: { playerName: "string", platform: "string" }, required: ["playerName"], risk: "low" },
    { name: "osu_user_stats", desc: "Stats Osu! d'un joueur", params: { username: "string" }, required: ["username"], risk: "low" },
    { name: "minecraft_server_status", desc: "Statut détaillé d'un serveur Minecraft", params: { host: "string", port: "number" }, required: ["host"], risk: "low" },
    { name: "fortnite_item_shop", desc: "Récupère l'item shop Fortnite actuel", params: {}, required: [], risk: "low" },
    { name: "epic_games_free_games", desc: "Liste les jeux gratuits actuels sur Epic Games", params: {}, required: [], risk: "low" },
    { name: "twitch_stream_check", desc: "Vérifie si un streamer est en live + infos", params: { streamerName: "string" }, required: ["streamerName"], risk: "low" },
    { name: "twitch_clip_create", desc: "Crée un clip d'un stream Twitch", params: { broadcasterId: "string" }, required: ["broadcasterId"], risk: "low" },
    { name: "spotify_track_search", desc: "Recherche un morceau sur Spotify", params: { query: "string" }, required: ["query"], risk: "low" },
    { name: "spotify_playlist_analyze", desc: "Analyse une playlist Spotify (genres, BPM)", params: { playlistId: "string" }, required: ["playlistId"], risk: "low" },
    { name: "boardgame_geek_search", desc: "Recherche sur BoardGameGeek", params: { query: "string" }, required: ["query"], risk: "low" },
  ]},
  { file: "scienceToolkit", prefix: "sci", tools: [
    { name: "physics_calculator", desc: "Calculs physiques (force, énergie, puissance, pression)", params: { formula: "string", values: "string" }, required: ["formula", "values"], risk: "low" },
    { name: "ohms_law_calc", desc: "Calculs loi d'Ohm (V=IR, P=VI)", params: { voltage: "number", current: "number", resistance: "number", power: "number" }, required: [], risk: "low" },
    { name: "wavelength_frequency", desc: "Convertit longueur d'onde ↔ fréquence ↔ énergie", params: { value: "number", type: "string" }, required: ["value", "type"], risk: "low" },
    { name: "radioactive_decay_calc", desc: "Calcule la décroissance radioactive (demi-vie)", params: { initialAmount: "number", halfLife: "number", time: "number" }, required: ["initialAmount", "halfLife", "time"], risk: "low" },
    { name: "unit_convert_scientific", desc: "Conversions scientifiques (SI, impérial, astronomique)", params: { value: "number", fromUnit: "string", toUnit: "string" }, required: ["value", "fromUnit", "toUnit"], risk: "low" },
    { name: "molar_mass_calc", desc: "Calcule la masse molaire d'une formule chimique", params: { formula: "string" }, required: ["formula"], risk: "low" },
    { name: "chemical_equation_balancer", desc: "Équilibre une équation chimique", params: { equation: "string" }, required: ["equation"], risk: "low" },
    { name: "ph_calculator", desc: "Calcule le pH à partir de la concentration [H+]", params: { concentration: "number", type: "string" }, required: ["concentration", "type"], risk: "low" },
    { name: "ideal_gas_law", desc: "Calculs loi des gaz parfaits (PV=nRT)", params: { pressure: "number", volume: "number", moles: "number", temperature: "number", solveFor: "string" }, required: ["solveFor"], risk: "low" },
    { name: "kinematics_calc", desc: "Calculs cinématiques (vitesse, accélération, distance)", params: { v0: "number", a: "number", t: "number" }, required: ["v0", "a", "t"], risk: "low" },
    { name: "optics_calc", desc: "Calculs d'optique (lentilles, miroirs, réfraction)", params: { focalLength: "number", objectDistance: "number" }, required: ["focalLength", "objectDistance"], risk: "low" },
    { name: "electric_field_calc", desc: "Calcule le champ électrique d'une charge", params: { charge: "number", distance: "number" }, required: ["charge", "distance"], risk: "low" },
    { name: "thermal_expansion_calc", desc: "Calcule la dilatation thermique d'un matériau", params: { initialLength: "number", coefficient: "number", tempChange: "number" }, required: ["initialLength", "coefficient", "tempChange"], risk: "low" },
    { name: "astronomical_distance", desc: "Convertit les distances astronomiques (UA, AL, parsecs)", params: { value: "number", fromUnit: "string", toUnit: "string" }, required: ["value", "fromUnit", "toUnit"], risk: "low" },
    { name: "radioactive_decay_calc_2", desc: "Calcule la demi-vie restante d'un isotope", params: { initialAmount: "number", halfLife: "number", time: "number" }, required: ["initialAmount", "halfLife", "time"], risk: "low" },
  ]},
  { file: "geoToolkit", prefix: "geo", tools: [
    { name: "geocode_reverse", desc: "Géocodage inverse (coordonnées → adresse)", params: { lat: "number", lon: "number" }, required: ["lat", "lon"], risk: "low" },
    { name: "timezone_convert_advanced", desc: "Conversion de fuseau horaire avec liste de villes", params: { datetime: "string", fromTz: "string", toTz: "string" }, required: ["datetime", "fromTz", "toTz"], risk: "low" },
    { name: "distance_matrix", desc: "Matrice de distances entre multiples points", params: { origins: "string", destinations: "string" }, required: ["origins", "destinations"], risk: "low" },
    { name: "elevation_lookup", desc: "Récupère l'altitude d'un point (Open-Elevation API)", params: { lat: "number", lon: "number" }, required: ["lat", "lon"], risk: "low" },
    { name: "country_bordering", desc: "Liste les pays frontaliers d'un pays donné", params: { country: "string" }, required: ["country"], risk: "low" },
    { name: "currency_by_country", desc: "Récupère la devise et le taux de change d'un pays", params: { country: "string" }, required: ["country"], risk: "low" },
    { name: "language_by_country", desc: "Liste les langues officielles d'un pays", params: { country: "string" }, required: ["country"], risk: "low" },
    { name: "capital_lookup", desc: "Récupère la capitale, population, superficie d'un pays", params: { country: "string" }, required: ["country"], risk: "low" },
    { name: "iso_country_code", desc: "Récupère les codes ISO 3166 d'un pays", params: { country: "string" }, required: ["country"], risk: "low" },
    { name: "sunrise_sunset_anywhere", desc: "Heure de lever/coucher du soleil pour toute position/date", params: { lat: "number", lon: "number", date: "string" }, required: ["lat", "lon"], risk: "low" },
  ]},
  { file: "healthToolkit", prefix: "health", tools: [
    { name: "water_intake_calc", desc: "Calcule l'apport hydrique recommandé selon poids et activité", params: { weightKg: "number", activityMinutes: "number" }, required: ["weightKg"], risk: "low" },
    { name: "heart_rate_zone", desc: "Calcule les zones de fréquence cardiaque pour l'entraînement", params: { age: "number", restingHr: "number" }, required: ["age"], risk: "low" },
    { name: "body_fat_percentage_calc", desc: "Estime le pourcentage de masse grasse (US Navy method)", params: { gender: "string", heightCm: "number", neckCm: "number", waistCm: "number", hipCm: "number" }, required: ["gender", "heightCm", "neckCm", "waistCm"], risk: "low" },
    { name: "ideal_weight_calc", desc: "Calcule le poids idéal (Devine, Robinson, Miller, Hamwi)", params: { gender: "string", heightCm: "number" }, required: ["gender", "heightCm"], risk: "low" },
    { name: "pregnancy_due_date", desc: "Calcule la date prévue d'accouchement", params: { lastPeriod: "string" }, required: ["lastPeriod"], risk: "low" },
    { name: "ovulation_calc", desc: "Calcule la période d'ovulation", params: { lastPeriod: "string", cycleLength: "number" }, required: ["lastPeriod"], risk: "low" },
    { name: "macro_nutrient_calc", desc: "Calcule les macros (protéines, glucides, lipides) selon objectifs", params: { weightKg: "number", goal: "string", activityLevel: "string" }, required: ["weightKg"], risk: "low" },
    { name: "sleep_quality_score", desc: "Score de qualité du sommeil selon durée et cycles", params: { bedtime: "string", wakeTime: "string", awakenings: "number", deepSleepPct: "number" }, required: ["bedtime", "wakeTime"], risk: "low" },
    { name: "step_to_calorie", desc: "Convertit pas en calories brûlées", params: { steps: "number", weightKg: "number" }, required: ["steps"], risk: "low" },
    { name: "hydration_tracker", desc: "Suit l'hydratation quotidienne", params: { glassesToday: "number", weightKg: "number" }, required: ["glassesToday"], risk: "low" },
  ]},
  { file: "codeDevToolkit", prefix: "code", tools: [
    { name: "code_complexity_analyzer", desc: "Analyse la complexité cyclomatique d'un fichier de code", params: { code: "string", language: "string" }, required: ["code"], risk: "low" },
    { name: "code_format_beautifier", desc: "Formate/beautifie du code (JS, TS, Python, Go, Rust, Java)", params: { code: "string", language: "string" }, required: ["code"], risk: "low" },
    { name: "code_minifier", desc: "Minifie du code (JS, CSS, HTML)", params: { code: "string", language: "string" }, required: ["code"], risk: "low" },
    { name: "code_diff_unified", desc: "Génère un diff unifié entre deux snippets", params: { code1: "string", code2: "string" }, required: ["code1", "code2"], risk: "low" },
    { name: "code_linter_check", desc: "Lint un snippet de code (ESLint, Pylint, tsc)", params: { filePath: "string", linter: "string" }, required: ["filePath"], risk: "low" },
    { name: "regex_debugger", desc: "Debug une regex avec explication étape par étape", params: { pattern: "string", testString: "string" }, required: ["pattern", "testString"], risk: "low" },
    { name: "api_endpoint_tester", desc: "Teste un endpoint API avec params custom", params: { url: "string", method: "string", headers: "string", body: "string" }, required: ["url"], risk: "low" },
    { name: "json_schema_validate", desc: "Valide un JSON contre un schéma JSON", params: { jsonStr: "string", schemaStr: "string" }, required: ["jsonStr", "schemaStr"], risk: "low" },
    { name: "yaml_validate", desc: "Valide un YAML et le convertit en JSON", params: { yamlStr: "string" }, required: ["yamlStr"], risk: "low" },
    { name: "xml_to_json", desc: "Convertit XML en JSON", params: { xmlStr: "string" }, required: ["xmlStr"], risk: "low" },
    { name: "sql_format_beautify", desc: "Formate/beautifie une requête SQL", params: { sql: "string" }, required: ["sql"], risk: "low" },
    { name: "dockerfile_lint", desc: "Lint un Dockerfile (best practices)", params: { dockerfile: "string" }, required: ["dockerfile"], risk: "low" },
    { name: "changelog_generator", desc: "Génère un changelog à partir de commits Git", params: { commits: "string", version: "string" }, required: ["commits"], risk: "low" },
    { name: "sql_format_beautify_2", desc: "Formate une requête SQL (alias)", params: { sql: "string" }, required: ["sql"], risk: "low" },
    { name: "dockerfile_lint_2", desc: "Lint un Dockerfile (alias)", params: { dockerfile: "string" }, required: ["dockerfile"], risk: "low" },
  ]},
  { file: "mediaToolkit", prefix: "media", tools: [
    { name: "image_resize_crop", desc: "Redimensionne/rogne une image (sharp)", params: { imagePath: "string", width: "number", height: "number", operation: "string" }, required: ["imagePath", "width", "height"], risk: "low" },
    { name: "image_format_convert", desc: "Convertit une image (PNG, JPG, WebP, AVIF, GIF)", params: { imagePath: "string", targetFormat: "string" }, required: ["imagePath", "targetFormat"], risk: "low" },
    { name: "image_metadata_strip", desc: "Supprime les métadonnées d'une image", params: { imagePath: "string" }, required: ["imagePath"], risk: "low" },
    { name: "image_collage_create", desc: "Crée un collage à partir de plusieurs images", params: { imagePaths: "string", cols: "number", rows: "number" }, required: ["imagePaths", "cols", "rows"], risk: "low" },
    { name: "audio_convert", desc: "Convertit un fichier audio (MP3, WAV, OGG, FLAC) via ffmpeg", params: { inputPath: "string", targetFormat: "string", bitrate: "string" }, required: ["inputPath", "targetFormat"], risk: "low" },
    { name: "audio_extract_from_video", desc: "Extrait l'audio d'une vidéo via ffmpeg", params: { videoPath: "string", targetFormat: "string" }, required: ["videoPath"], risk: "low" },
    { name: "video_compress", desc: "Compresse une vidéo via ffmpeg", params: { videoPath: "string", crf: "number" }, required: ["videoPath"], risk: "low" },
    { name: "video_gif_convert", desc: "Convertit une vidéo en GIF ou inversement", params: { inputPath: "string", outputFormat: "string", fps: "number", width: "number" }, required: ["inputPath"], risk: "low" },
    { name: "text_to_speech_multi", desc: "TTS avec choix de voix et langue multiple", params: { text: "string", voice: "string", language: "string" }, required: ["text"], risk: "low" },
    { name: "image_watermark_add", desc: "Ajoute un watermark à une image", params: { imagePath: "string", watermarkText: "string", opacity: "number" }, required: ["imagePath", "watermarkText"], risk: "low" },
  ]},
];

// Generate imports
let imports = "";
let defs = "";
let switchCases = "";
let handlers = "";
let registry = "";

// Map of tool names to actual export names (when they differ)
const exportAliases = {
  "crypto_aes_decrypt": "aesDecrypt",
  "radioactive_decay_calc_2": "radioactiveDecayCalc",
  "sql_format_beautify_2": "sqlFormatBeautify",
  "dockerfile_lint_2": "dockerfileLint",
};

// Duplicate imports that need aliasing
const duplicateNames = new Set(["aesDecrypt", "snmpWalk"]);

for (const tk of toolkits) {
  // Import
  const funcNames = tk.tools.map(t => {
    // Convert tool name to function name (camelCase)
    const parts = t.name.split("_");
    return parts.map((p, i) => i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)).join("");
  });
  // Build import with aliases for duplicates
  const importParts = tk.tools.map((t, i) => {
    const fnName = funcNames[i];
    const actualExport = exportAliases[t.name] || fnName;
    if (actualExport !== fnName) {
      return `  ${actualExport} as ${fnName}`;
    }
    if (duplicateNames.has(fnName)) {
      return `  ${fnName} as ${tk.prefix}${fnName.charAt(0).toUpperCase() + fnName.slice(1)}`;
    }
    return `  ${fnName}`;
  });
  // Update funcNames to use aliased names
  tk.tools.forEach((t, i) => {
    const fnName = funcNames[i];
    const actualExport = exportAliases[t.name] || fnName;
    if (actualExport !== fnName) {
      funcNames[i] = fnName; // keep as is, the import aliases it
    }
    if (duplicateNames.has(fnName)) {
      funcNames[i] = `${tk.prefix}${fnName.charAt(0).toUpperCase() + fnName.slice(1)}`;
    }
  });
  imports += `import {\n${importParts.join(",\n")},\n} from "../utils/${tk.file}.js";\n`;

  // Tool definitions
  defs += `  // ── ${tk.prefix.toUpperCase()} Toolkit ──\n`;
  for (const t of tk.tools) {
    const propStr = Object.keys(t.params).length > 0
      ? `{\n${Object.entries(t.params).map(([k, v]) => `        ${k}: { type: "${v}", description: "${k}" }`).join(",\n")},\n      }`
      : `{}`;
    defs += `  {\n    type: "function",\n    function: {\n      name: "${t.name}",\n      description: "${t.desc}",\n      parameters: {\n        type: "object",\n        properties: ${propStr},\n        required: ${JSON.stringify(t.required)},\n      },\n    },\n  },\n`;
  }

  // Switch cases
  for (const t of tk.tools) {
    const fnName = funcNames[tk.tools.indexOf(t)];
    const isAsync = t.name.includes("wayback") || t.name.includes("crtsh") || t.name.includes("haveibeenpwned") ||
      t.name.includes("hunter_io") || t.name.includes("phone_number") || t.name.includes("social_media") ||
      t.name.includes("gravatar") || t.name.includes("github_dorks") || t.name.includes("github_commit") ||
      t.name.includes("bitcoin") || t.name.includes("ethereum") || t.name.includes("domain_whois") ||
      t.name.includes("dns_history") || t.name.includes("leaked_source") || t.name.includes("malware") ||
      t.name.includes("ssl_labs") || t.name.includes("security_headers") || t.name.includes("cors") ||
      t.name.includes("open_redirect") || t.name.includes("csrf") || t.name.includes("rate_limit") ||
      t.name.includes("dns_zone") || t.name.includes("dns_subdomain") || t.name.includes("dns_rebinding") ||
      t.name.includes("ssl_cert") || t.name.includes("dns_propagation") ||
      t.name.includes("aws_s3") || t.name.includes("cloud_metadata") || t.name.includes("graphql") ||
      t.name.includes("api_rate") || t.name.includes("webhook") ||
      t.name.includes("riot") || t.name.includes("lol_") || t.name.includes("csgo") || t.name.includes("apex") ||
      t.name.includes("rocket_league") || t.name.includes("osu_") || t.name.includes("minecraft") ||
      t.name.includes("fortnite") || t.name.includes("epic_games") || t.name.includes("twitch") ||
      t.name.includes("spotify") || t.name.includes("boardgame") ||
      t.name.includes("geocode") || t.name.includes("elevation") || t.name.includes("country") ||
      t.name.includes("currency_by") || t.name.includes("language_by") || t.name.includes("capital") ||
      t.name.includes("iso_country") || t.name.includes("sunrise") ||
      t.name.includes("api_endpoint") ||
      t.name.includes("image_");
    const awaitKw = isAsync ? "await " : "";
    switchCases += `      case "${t.name}":\n        return ${awaitKw}t${fnName.charAt(0).toUpperCase() + fnName.slice(1)}(args);\n`;
  }

  // Handler functions
  for (const t of tk.tools) {
    const fnName = funcNames[tk.tools.indexOf(t)];
    const handlerName = "t" + fnName.charAt(0).toUpperCase() + fnName.slice(1);
    const isAsync = t.name.includes("wayback") || t.name.includes("crtsh") || t.name.includes("haveibeenpwned") ||
      t.name.includes("hunter_io") || t.name.includes("phone_number") || t.name.includes("social_media") ||
      t.name.includes("gravatar") || t.name.includes("github_dorks") || t.name.includes("github_commit") ||
      t.name.includes("bitcoin") || t.name.includes("ethereum") || t.name.includes("domain_whois") ||
      t.name.includes("dns_history") || t.name.includes("leaked_source") || t.name.includes("malware") ||
      t.name.includes("ssl_labs") || t.name.includes("security_headers") || t.name.includes("cors") ||
      t.name.includes("open_redirect") || t.name.includes("csrf") || t.name.includes("rate_limit") ||
      t.name.includes("dns_zone") || t.name.includes("dns_subdomain") || t.name.includes("dns_rebinding") ||
      t.name.includes("ssl_cert") || t.name.includes("dns_propagation") ||
      t.name.includes("aws_s3") || t.name.includes("cloud_metadata") || t.name.includes("graphql") ||
      t.name.includes("api_rate") || t.name.includes("webhook") ||
      t.name.includes("riot") || t.name.includes("lol_") || t.name.includes("csgo") || t.name.includes("apex") ||
      t.name.includes("rocket_league") || t.name.includes("osu_") || t.name.includes("minecraft") ||
      t.name.includes("fortnite") || t.name.includes("epic_games") || t.name.includes("twitch") ||
      t.name.includes("spotify") || t.name.includes("boardgame") ||
      t.name.includes("geocode") || t.name.includes("elevation") || t.name.includes("country") ||
      t.name.includes("currency_by") || t.name.includes("language_by") || t.name.includes("capital") ||
      t.name.includes("iso_country") || t.name.includes("sunrise") ||
      t.name.includes("api_endpoint") ||
      t.name.includes("image_");
    const asyncKw = isAsync ? "async " : "";
    const awaitKw = isAsync ? "await " : "";
    const paramNames = Object.keys(t.params);
    const argExtract = paramNames.length > 0
      ? paramNames.map(p => `const ${p} = ${t.params[p] === "number" ? `Number(args.${p} || 0)` : `String(args.${p} || "")`};`).join("\n  ")
      : "// No parameters";
    const callArgs = paramNames.join(", ");
    const retType = isAsync ? "Promise<ToolCallResult>" : "ToolCallResult";
    handlers += `${asyncKw}function ${handlerName}(args: Record<string, unknown>): ${retType} {\n  ${argExtract}\n  try {\n    const result = ${awaitKw}${fnName}(${callArgs});\n    return { success: true, data: typeof result === "string" ? result : JSON.stringify(result) };\n  } catch (err) {\n    return { success: false, data: \`❌ \${err instanceof Error ? err.message : String(err)}\` };\n  }\n}\n\n`;
  }

  // Risk registry
  for (const t of tk.tools) {
    registry += `  { name: "${t.name}", level: "${t.risk}" },\n`;
  }
}

// Write output files
const outDir = path.join(__dirname, "..", "src", "services");
fs.writeFileSync(path.join(outDir, "_new_imports.txt"), imports);
fs.writeFileSync(path.join(outDir, "_new_defs.txt"), defs);
fs.writeFileSync(path.join(outDir, "_new_switch.txt"), switchCases);
fs.writeFileSync(path.join(outDir, "_new_handlers.txt"), handlers);
fs.writeFileSync(path.join(outDir, "_new_registry.txt"), registry);

console.log("Generated files in src/services/:");
console.log("  _new_imports.txt");
console.log("  _new_defs.txt");
console.log("  _new_switch.txt");
console.log("  _new_handlers.txt");
console.log("  _new_registry.txt");
console.log(`Total tools: ${toolkits.reduce((sum, tk) => sum + tk.tools.length, 0)}`);
