import { describe, expect, it } from "vitest";
import { alignFingerprints, fingerprintPcm } from "./songFingerprint.js";

function tone(freqHz: number, seconds: number, rate = 8000): Float32Array {
  const length = Math.floor(seconds * rate);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] =
      Math.sin((2 * Math.PI * freqHz * i) / rate) +
      0.4 * Math.sin((2 * Math.PI * freqHz * 2 * i) / rate);
  }
  return samples;
}

function melody(): Float32Array {
  const rate = 8000;
  const notes = [262, 330, 392, 523, 392, 330, 294, 262];
  const noteLength = Math.floor(rate / 4);
  const samples = new Float32Array(noteLength * notes.length);
  for (let n = 0; n < notes.length; n++) {
    const freq = notes[n];
    for (let i = 0; i < noteLength; i++) {
      const at = n * noteLength + i;
      samples[at] =
        Math.sin((2 * Math.PI * freq * i) / rate) +
        0.35 * Math.sin((2 * Math.PI * freq * 2 * i) / rate);
    }
  }
  return samples;
}

describe("empreinte type Shazam", () => {
  it("retrouve un extrait au milieu de la chanson", () => {
    const song = melody();
    const clip = song.subarray(4000, 10000);
    const aligned = alignFingerprints(fingerprintPcm(clip), fingerprintPcm(song));
    expect(aligned.score).toBeGreaterThan(20);
    expect(aligned.offset).toBeGreaterThan(10);
  });

  it("ne confond pas un autre son", () => {
    const song = melody();
    const other = tone(730, 2);
    const aligned = alignFingerprints(fingerprintPcm(other), fingerprintPcm(song));
    const same = alignFingerprints(fingerprintPcm(song.subarray(0, 8000)), fingerprintPcm(song));
    expect(aligned.score).toBeLessThan(same.score / 2);
  });
});
