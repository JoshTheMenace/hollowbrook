import { SR } from './dsp.js';

// 16-bit PCM stereo WAV encoder — runtime-agnostic (returns Uint8Array).
export function encodeWav([L, R], sr = SR) {
  const n = L.length;
  const bytes = 44 + n * 4;
  const out = new Uint8Array(bytes);
  const dv = new DataView(out.buffer);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    dv.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), true);
    dv.setInt16(o + 2, Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), true);
    o += 4;
  }
  return out;
}
