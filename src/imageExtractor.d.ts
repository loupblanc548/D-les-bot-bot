// src/imageExtractor.d.ts
import type { RawgClient } from './rawgClient.js';

export interface ExtractImageContext {
  rawgClient?: RawgClient | null;
  signal?: AbortSignal;
}

export declare function extractImage(
  item: unknown,
  rule?: { channelEnv?: string; name?: string },
  ctx?: ExtractImageContext,
): Promise<string | null>;

export default extractImage;
