/**
 * artifacts.ts — Artifacts: génération de fichiers joints depuis l'IA
 *
 * Détecte les blocs de code/langage dans les réponses de l'agent
 * et génère automatiquement des fichiers joints (.md, .html, .py, .js, .ts, etc.)
 * quand le contenu est substantiel.
 *
 * Aussi expose un tool agent "generate_file" pour générer un fichier à la demande.
 */

import { Message, AttachmentBuilder, TextChannel } from "discord.js";
import logger from "../utils/logger.js";

const MIN_CODE_LENGTH = 200; // Minimum chars to warrant a file attachment

interface DetectedArtifact {
  language: string;
  content: string;
  filename: string;
}

/**
 * Détecte les blocs de code substantiels dans une réponse IA
 * et retourne les artifacts à joindre.
 */
export function detectArtifacts(aiResponse: string): DetectedArtifact[] {
  const artifacts: DetectedArtifact[] = [];

  // Match fenced code blocks: ```lang\n...```
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(aiResponse)) !== null) {
    const language = match[1]?.toLowerCase() ?? "txt";
    const content = match[2].trim();

    if (content.length < MIN_CODE_LENGTH) continue;

    const ext = getExtensionForLanguage(language);
    const filename = `artifact_${language}_${Date.now()}.${ext}`;

    artifacts.push({ language, content, filename });
  }

  // Also detect HTML blocks (even without code fence, if response is mostly HTML)
  if (
    (artifacts.length === 0 && aiResponse.includes("<!DOCTYPE html")) ||
    aiResponse.includes("<html")
  ) {
    const htmlMatch = aiResponse.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
    if (htmlMatch && htmlMatch[1].length > MIN_CODE_LENGTH) {
      artifacts.push({
        language: "html",
        content: htmlMatch[1],
        filename: `artifact_html_${Date.now()}.html`,
      });
    }
  }

  return artifacts;
}

/**
 * Map language name to file extension.
 */
function getExtensionForLanguage(lang: string): string {
  const map: Record<string, string> = {
    javascript: "js",
    js: "js",
    typescript: "ts",
    ts: "ts",
    python: "py",
    py: "py",
    java: "java",
    c: "c",
    cpp: "cpp",
    "c++": "cpp",
    csharp: "cs",
    cs: "cs",
    go: "go",
    rust: "rs",
    rs: "rs",
    ruby: "rb",
    rb: "rb",
    php: "php",
    html: "html",
    css: "css",
    scss: "scss",
    sql: "sql",
    bash: "sh",
    sh: "sh",
    shell: "sh",
    yaml: "yaml",
    yml: "yaml",
    json: "json",
    xml: "xml",
    markdown: "md",
    md: "md",
    text: "txt",
    txt: "txt",
  };
  return map[lang] ?? "txt";
}

/**
 * Envoie les artifacts détectés comme fichiers joints.
 * Retourne true si au moins un artifact a été envoyé.
 */
export async function sendArtifacts(message: Message, aiResponse: string): Promise<boolean> {
  const artifacts = detectArtifacts(aiResponse);
  if (artifacts.length === 0) return false;

  try {
    const attachments = artifacts.map(
      (a) => new AttachmentBuilder(Buffer.from(a.content, "utf-8"), { name: a.filename }),
    );

    await (message.channel as TextChannel).send({
      content: `📎 **Fichier(s) généré(s) par l'IA** (${artifacts.length}):`,
      files: attachments,
    });

    logger.info(`[Artifacts] Sent ${artifacts.length} file(s) for ${message.author.id}`);
    return true;
  } catch (err) {
    logger.debug(`[Artifacts] Send failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Génère un fichier à la demande (utilisé comme tool agent).
 */
export function createFileArtifact(content: string, filename: string): AttachmentBuilder {
  return new AttachmentBuilder(Buffer.from(content, "utf-8"), { name: filename });
}
