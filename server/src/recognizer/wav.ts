import { readFileSync, writeFileSync } from 'node:fs';

/** Mono 16-bit PCM WAV, for saving and replaying utterances while tuning. */
export function writeWav(file: string, chunks: readonly Int16Array[], sampleRate: number): void {
  const samples = chunks.reduce((n, c) => n + c.length, 0);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVEfmt ', 8, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(samples * 2, 40);
  let at = 44;
  for (const c of chunks) for (const s of c) at = buf.writeInt16LE(s, at);
  writeFileSync(file, buf);
}

export function readWav(file: string, sampleRate: number): Int16Array {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`${file}: not a WAV file`);
  let at = 12;
  while (at < buf.length) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'fmt ') {
      const channels = buf.readUInt16LE(at + 10);
      const rate = buf.readUInt32LE(at + 12);
      const bits = buf.readUInt16LE(at + 22);
      if (channels !== 1 || rate !== sampleRate || bits !== 16) {
        throw new Error(`${file}: need ${sampleRate} Hz mono 16-bit, got ${rate} Hz ${channels} ch ${bits}-bit`);
      }
    } else if (id === 'data') {
      const data = buf.subarray(at + 8, at + 8 + (size & ~1)); // whole samples only
      return new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    }
    at += 8 + size + (size % 2);
  }
  throw new Error(`${file}: no data chunk`);
}
