/**
 * Empreinte audio du type Shazam (Avery Wang, 2003).
 * Spectrogramme, pics locaux, puis couples de pics hachés.
 * Deux extraits de la même chanson s'alignent sur le même décalage de temps.
 */

export interface AudioPeak {
  time: number;
  freq: number;
}

export interface FingerprintHash {
  hash: number;
  time: number;
}

const FRAME = 256;
const HOP = 128;
const FANOUT = 5;
const MAX_DELTA = 31;

function fftMagnitude(frame: Float32Array): Float32Array {
  const n = frame.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const bits = Math.round(Math.log2(n));
  for (let i = 0; i < n; i++) {
    let reversed = 0;
    for (let b = 0; b < bits; b++) {
      reversed = (reversed << 1) | ((i >> b) & 1);
    }
    re[reversed] = frame[i];
  }

  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const theta = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0; j < half; j++) {
        const wr = Math.cos(theta * j);
        const wi = Math.sin(theta * j);
        const even = i + j;
        const odd = even + half;
        const tr = wr * re[odd] - wi * im[odd];
        const ti = wr * im[odd] + wi * re[odd];
        re[odd] = re[even] - tr;
        im[odd] = im[even] - ti;
        re[even] += tr;
        im[even] += ti;
      }
    }
  }

  const mags = new Float32Array(n / 2);
  for (let i = 0; i < mags.length; i++) {
    mags[i] = Math.hypot(re[i], im[i]);
  }
  return mags;
}

export function peaksToHashes(peaks: AudioPeak[]): FingerprintHash[] {
  const hashes: FingerprintHash[] = [];
  for (let i = 0; i < peaks.length; i++) {
    const anchor = peaks[i];
    let paired = 0;
    for (let j = i + 1; j < peaks.length && paired < FANOUT; j++) {
      const target = peaks[j];
      const delta = target.time - anchor.time;
      if (delta <= 0 || delta > MAX_DELTA) continue;
      const hash = (anchor.freq & 511) | ((target.freq & 511) << 9) | (delta << 18);
      hashes.push({ hash, time: anchor.time });
      paired++;
    }
  }
  return hashes;
}

/** Empreinte un signal mono. `samples` est déjà normalisé autour de 0. */
export function fingerprintPcm(samples: Float32Array): FingerprintHash[] {
  const columns: Float32Array[] = [];
  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    const frame = new Float32Array(FRAME);
    for (let i = 0; i < FRAME; i++) {
      const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FRAME - 1)));
      frame[i] = samples[start + i] * window;
    }
    columns.push(fftMagnitude(frame));
  }
  if (columns.length < 3) return [];

  const bands = 8;
  const peaks: AudioPeak[] = [];
  for (let t = 1; t < columns.length - 1; t++) {
    const column = columns[t];
    const width = Math.floor((column.length - 2) / bands);
    for (let band = 0; band < bands; band++) {
      const startBin = 1 + band * width;
      const endBin = band === bands - 1 ? column.length - 1 : startBin + width;
      let bestFreq = startBin;
      let best = column[startBin];
      for (let f = startBin + 1; f < endBin; f++) {
        if (column[f] > best) {
          best = column[f];
          bestFreq = f;
        }
      }
      if (best <= 0) continue;
      const beatsNeighbors = best >= columns[t - 1][bestFreq] && best >= columns[t + 1][bestFreq];
      if (beatsNeighbors) peaks.push({ time: t, freq: bestFreq });
    }
  }
  return peaksToHashes(peaks);
}

/** Compte les hachures qui tombent sur le même décalage. C'est le score Shazam. */
export function alignFingerprints(
  query: FingerprintHash[],
  track: FingerprintHash[],
): { score: number; offset: number } {
  const timesByHash = new Map<number, number[]>();
  for (const mark of track) {
    const bucket = timesByHash.get(mark.hash);
    if (bucket) bucket.push(mark.time);
    else timesByHash.set(mark.hash, [mark.time]);
  }

  const offsetCounts = new Map<number, number>();
  for (const mark of query) {
    const times = timesByHash.get(mark.hash);
    if (!times) continue;
    for (const time of times) {
      const offset = time - mark.time;
      offsetCounts.set(offset, (offsetCounts.get(offset) ?? 0) + 1);
    }
  }

  let score = 0;
  let offset = 0;
  for (const [candidate, count] of offsetCounts) {
    if (count > score) {
      score = count;
      offset = candidate;
    }
  }
  return { score, offset };
}
