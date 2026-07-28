/**
 * mediaToolkit.ts — Media & Creative utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

// ─── Image resize/crop ──────────────────────────────────────────────────────
export async function imageResizeCrop(
  imagePath: string,
  width: number,
  height: number,
  operation: string,
): Promise<string> {
  try {
    const sharp = await import("sharp");
    const outputPath = path.join(
      os.tmpdir(),
      `img_${Date.now()}_${width}x${height}${path.extname(imagePath)}`,
    );
    if (operation === "resize") {
      await sharp.default(imagePath).resize(width, height).toFile(outputPath);
    } else {
      await sharp.default(imagePath).extract({ left: 0, top: 0, width, height }).toFile(outputPath);
    }
    return `Image ${operation}ed to ${width}x${height}. Output: ${outputPath}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Image format convert ───────────────────────────────────────────────────
export async function imageFormatConvert(imagePath: string, targetFormat: string): Promise<string> {
  try {
    const sharp = await import("sharp");
    const outputPath = path.join(os.tmpdir(), `img_${Date.now()}.${targetFormat}`);
    await sharp
      .default(imagePath)
      .toFormat(targetFormat as any)
      .toFile(outputPath);
    return `Image converted to ${targetFormat}. Output: ${outputPath}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Image metadata strip ───────────────────────────────────────────────────
export async function imageMetadataStrip(imagePath: string): Promise<string> {
  try {
    const sharp = await import("sharp");
    const outputPath = path.join(os.tmpdir(), `img_clean_${Date.now()}${path.extname(imagePath)}`);
    await sharp.default(imagePath).rotate().toFormat("jpeg").toFile(outputPath);
    return `Metadata stripped. Output: ${outputPath}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Image collage create ───────────────────────────────────────────────────
export async function imageCollageCreate(
  imagePaths: string,
  cols: number,
  rows: number,
): Promise<string> {
  try {
    const sharp = await import("sharp");
    const images = imagePaths.split(",").map((s) => s.trim());
    if (images.length < cols * rows)
      return `Need ${cols * rows} images for ${cols}x${rows} grid, got ${images.length}`;
    const cellWidth = 300;
    const cellHeight = 300;
    const totalWidth = cellWidth * cols;
    const totalHeight = cellHeight * rows;
    const composites: any[] = [];
    for (let i = 0; i < images.length && i < cols * rows; i++) {
      const x = (i % cols) * cellWidth;
      const y = Math.floor(i / cols) * cellHeight;
      const buf = await sharp.default(images[i]).resize(cellWidth, cellHeight).toBuffer();
      composites.push({ input: buf, top: y, left: x });
    }
    const outputPath = path.join(os.tmpdir(), `collage_${Date.now()}.jpg`);
    await sharp
      .default({
        create: {
          width: totalWidth,
          height: totalHeight,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
      .composite(composites)
      .jpeg()
      .toFile(outputPath);
    return `Collage created (${cols}x${rows}). Output: ${outputPath}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Audio convert ──────────────────────────────────────────────────────────
export function audioConvert(inputPath: string, targetFormat: string, bitrate: string): string {
  try {
    const br = bitrate || "192k";
    const outputPath = path.join(os.tmpdir(), `audio_${Date.now()}.${targetFormat}`);
    const cmd = `ffmpeg -i "${inputPath}" -b:a ${br} "${outputPath}" -y 2>&1`;
    const output = execSync(cmd, { timeout: 60_000, encoding: "utf8" }).trim();
    return `Audio converted to ${targetFormat} (${br}). Output: ${outputPath}`;
  } catch (err) {
    return `Error: ${(err as Error).message}. Ensure ffmpeg is installed.`;
  }
}

// ─── Audio extract from video ───────────────────────────────────────────────
export function audioExtractFromVideo(videoPath: string, targetFormat: string): string {
  try {
    const fmt = targetFormat || "mp3";
    const outputPath = path.join(os.tmpdir(), `extracted_audio_${Date.now()}.${fmt}`);
    const cmd = `ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 2 "${outputPath}" -y 2>&1`;
    execSync(cmd, { timeout: 60_000, encoding: "utf8" });
    return `Audio extracted as ${fmt}. Output: ${outputPath}`;
  } catch (err) {
    return `Error: ${(err as Error).message}. Ensure ffmpeg is installed.`;
  }
}

// ─── Video compress ─────────────────────────────────────────────────────────
export function videoCompress(videoPath: string, crf: number): string {
  try {
    const quality = crf || 28;
    const outputPath = path.join(os.tmpdir(), `compressed_${Date.now()}.mp4`);
    const cmd = `ffmpeg -i "${videoPath}" -c:v libx264 -crf ${quality} -c:a aac -b:a 128k "${outputPath}" -y 2>&1`;
    execSync(cmd, { timeout: 120_000, encoding: "utf8" });
    const originalSize = fs.statSync(videoPath).size;
    const compressedSize = fs.statSync(outputPath).size;
    const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    return `Video compressed (CRF=${quality}). Output: ${outputPath}\nSize: ${(originalSize / 1e6).toFixed(1)} MB -> ${(compressedSize / 1e6).toFixed(1)} MB (${reduction}% reduction)`;
  } catch (err) {
    return `Error: ${(err as Error).message}. Ensure ffmpeg is installed.`;
  }
}

// ─── Video/GIF convert ──────────────────────────────────────────────────────
export function videoGifConvert(
  inputPath: string,
  outputFormat: string,
  fps: number,
  width: number,
): string {
  try {
    const fmt = outputFormat || "gif";
    const useFps = fps || 10;
    const useWidth = width || 480;
    const outputPath = path.join(os.tmpdir(), `converted_${Date.now()}.${fmt}`);
    let cmd: string;
    if (fmt === "gif") {
      cmd = `ffmpeg -i "${inputPath}" -vf "fps=${useFps},scale=${useWidth}:-1" "${outputPath}" -y 2>&1`;
    } else {
      cmd = `ffmpeg -i "${inputPath}" -vf "fps=${useFps},scale=${useWidth}:-1:flags=lanczos" -c:v libx264 -pix_fmt yuv420p "${outputPath}" -y 2>&1`;
    }
    execSync(cmd, { timeout: 120_000, encoding: "utf8" });
    return `Converted to ${fmt}. Output: ${outputPath}`;
  } catch (err) {
    return `Error: ${(err as Error).message}. Ensure ffmpeg is installed.`;
  }
}

// ─── Text to speech multi ───────────────────────────────────────────────────
export function textToSpeechMulti(text: string, voice: string, language: string): string {
  return `TTS request:\n  Text: "${text.slice(0, 100)}..."\n  Voice: ${voice || "default"}\n  Language: ${language || "en"}\n\nUse the existing generate_tts or elevenLabsTTS tool for actual TTS generation.`;
}

// ─── Image watermark add ────────────────────────────────────────────────────
export async function imageWatermarkAdd(
  imagePath: string,
  watermarkText: string,
  opacity: number,
): Promise<string> {
  try {
    const sharp = await import("sharp");
    const op = opacity || 0.5;
    const svgText = `<svg width="500" height="100"><text x="10" y="50" font-size="40" fill="rgba(255,255,255,${op})" font-family="Arial">${watermarkText}</text></svg>`;
    const outputPath = path.join(os.tmpdir(), `watermarked_${Date.now()}.jpg`);
    await sharp
      .default(imagePath)
      .composite([{ input: Buffer.from(svgText), top: 10, left: 10 }])
      .jpeg()
      .toFile(outputPath);
    return `Watermark added. Output: ${outputPath}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
