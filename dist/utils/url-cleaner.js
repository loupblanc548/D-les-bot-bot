"use strict";
/**
 * Nettoie une URL en retirant les paramètres de tracking et en normalisant
 * les URLs YouTube pour éviter les doublons causés par des liens
 * légèrement différents pointant vers le même contenu.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanUrl = cleanUrl;
const TRACKING_PARAMS = [
    "si", // YouTube source info
    "t", // YouTube timestamp
    "feature", // YouTube feature
    "pp", // YouTube
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid", // Facebook click ID
    "ref", // Generic referral
    "ref_src", // Referral source
    "source", // Generic source tracking
    "ocid", // Microsoft
    "ncid", // Microsoft
    "igshid", // Instagram
    "mc_cid", // Mailchimp
    "mc_eid", // Mailchimp
];
const YOUTUBE_HOSTS = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
];
/**
 * Extrait l'ID d'une vidéo YouTube depuis une URL.
 * Supporte les formats: /watch?v=, /v/, /embed/, youtu.be/
 */
function extractYouTubeVideoId(url) {
    // Format /watch?v=VIDEO_ID
    const watchV = url.searchParams.get("v");
    if (watchV)
        return watchV;
    // Format youtu.be/VIDEO_ID ou /v/VIDEO_ID ou /embed/VIDEO_ID
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        // Vérifie que c'est un ID YouTube valide (11 caractères)
        if (/^[A-Za-z0-9_-]{11}$/.test(lastPart)) {
            return lastPart;
        }
    }
    // Format /shorts/VIDEO_ID
    if (pathParts.length >= 2 && pathParts[0] === "shorts") {
        return pathParts[1];
    }
    return null;
}
/**
 * Normalise une URL YouTube en retirant tous les paramètres de tracking
 * tout en conservant l'ID de la vidéo.
 *
 * Exemple:
 *   https://www.youtube.com/watch?v=abc123&si=xyz&t=120&feature=shared
 *   → https://www.youtube.com/watch?v=abc123
 */
function cleanYouTubeUrl(url) {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
    }
    // Fallback : URL YouTube sans ID vidéo identifiable
    // On retire les paramètres de tracking mais on conserve la structure
    for (const param of TRACKING_PARAMS) {
        url.searchParams.delete(param);
    }
    url.hash = "";
    return url.toString();
}
/**
 * Nettoie une URL en retirant les paramètres de tracking.
 *
 * Pour YouTube : normalise vers le format canonique
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *
 * Pour les autres URLs : retire les paramètres de tracking connus
 *   (utm_*, fbclid, ref, si, t, etc.)
 *
 * Si l'URL est invalide ou vide, retourne la chaîne d'origine.
 */
function cleanUrl(rawUrl) {
    if (!rawUrl)
        return rawUrl;
    try {
        const url = new URL(rawUrl);
        // YouTube : normalisation complète vers format canonique
        if (YOUTUBE_HOSTS.some((h) => url.hostname === h)) {
            return cleanYouTubeUrl(url);
        }
        // xcancel.com (proxy Twitter) : garder le chemin tel quel, retirer les params
        if (url.hostname === "xcancel.com" || url.hostname === "nitter.net") {
            // Les URLs xcancel pointent vers des tweets spécifiques, le pathname suffit
            for (const param of TRACKING_PARAMS) {
                url.searchParams.delete(param);
            }
            return url.toString();
        }
        // URLs générales : retirer les paramètres de tracking
        for (const param of TRACKING_PARAMS) {
            url.searchParams.delete(param);
        }
        // Retirer le hash sauf pour les URLs qui en dépendent
        // (YouTube utilise # pour rien, Twitter non plus)
        url.hash = "";
        return url.toString();
    }
    catch {
        // URL invalide, on retourne l'original
        return rawUrl;
    }
}
//# sourceMappingURL=url-cleaner.js.map