import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { unixMsToDatTimestamp } from '../../src/services/ps5TrophyBackup.js';

/**
 * Build synthetic-but-valid PS5 trophy backup files for tests:
 * - buildTrpTitleDat: T2PD v1 user-progress file
 * - buildTrophyUcp: UCP v1 game-catalog file
 * - buildZip: minimal ZIP (deflate) containing arbitrary entries
 */

export interface DatTrophyInput {
  earned: boolean;
  /** Unlock time in unix ms (ignored when earned is false) */
  unlockedAtMs?: number;
}

export interface UcpTrophyInput {
  id: number;
  name: string;
  detail: string;
  grade: string;
  hidden?: boolean;
  iconPng?: Buffer;
}

const NPWR_PLACEHOLDER = Buffer.from('NPWR00000_00\0', 'ascii');

/**
 * Assemble a valid T2PD file with `trophyCount` progress records.
 *
 * Identity fields: account (8 bytes at 0x200), uid (4 bytes at 0x208) and
 * catalog hash (20 bytes at 0x250) live inside block 0's payload, so they are
 * written into the logical buffer at the matching logical offsets and end up
 * in the file automatically when blocks are assembled.
 */
export function buildTrpTitleDat(opts: {
  npwr?: string;
  uid?: string;
  accountHex?: string;
  catalogHashHex?: string;
  trophies: DatTrophyInput[];
}): Buffer {
  const npwr = opts.npwr ?? 'NPWR12345_00';
  const uid = opts.uid ?? '1234abcd';
  const accountHex = opts.accountHex ?? '0123456789abcdef';
  const catalogHashHex = opts.catalogHashHex ?? 'a'.repeat(40);
  const trophyCount = Math.max(opts.trophies.length, 1);

  // --- Logical T2TD buffer -------------------------------------------------
  // 9 records at 0x30, each 96 bytes (size 80 + 16 header) => ends ~0x300.
  // Section 2 must be type 0x100 at 0x200; section 3 type 0x300 at 0x250.
  // Progress records: type 0x800, size 80, placed after the identity area.
  const progressOff = 0x300;
  const logicalSize = progressOff + trophyCount * 96 + 256;
  const d = Buffer.alloc(logicalSize);

  d.write('T2TD', 0, 'ascii');
  d.writeUInt32BE(0x10000, 4);
  d.writeUInt32BE(9, 8);

  const writeSection = (
    index: number,
    type: number,
    size: number,
    count: number,
    off: number,
  ) => {
    const p = 0x30 + index * 32;
    d.writeUInt32BE(type, p);
    d.writeUInt32BE(size, p + 4);
    d.writeUInt32BE(count, p + 12);
    d.writeBigUInt64BE(BigInt(off), p + 16);
    for (let j = 0; j < count; j++) {
      const r = off + j * (size + 16);
      d.writeUInt32BE(type, r);
      d.writeUInt32BE(size, r + 4);
    }
  };

  // Sections 0,1: generic filler sections in free space before 0x200.
  writeSection(0, 0x010, 16, 1, 0x150);
  writeSection(1, 0x050, 16, 1, 0x170);
  // Section 2: identity (type 0x100, must sit at 0x200).
  writeSection(2, 0x100, 80, 1, 0x200);
  // Section 3: catalog info (type 0x300, must sit at 0x250).
  writeSection(3, 0x300, 12, 1, 0x250);
  // Sections 4-7: filler.
  writeSection(4, 0x400, 16, 1, 0x280);
  writeSection(5, 0x500, 16, 1, 0x2a0);
  writeSection(6, 0x600, 16, 1, 0x2c0);
  writeSection(7, 0x700, 16, 1, 0x2e0);
  // Section 8: trophy progress (type 0x800, size 80 => 96-byte records).
  writeSection(8, 0x800, 80, trophyCount, progressOff);

  // NPWR id at logical 0x260 (inside section 3's record data area).
  NPWR_PLACEHOLDER.copy(d, 0x260);
  d.write(npwr, 0x260, 'ascii');
  d[0x26c] = 0;

  // Progress records: tid at +16, flags at +20, FILETIME ticks at +32.
  for (let i = 0; i < trophyCount; i++) {
    const t = opts.trophies[i] ?? { earned: false };
    const p = progressOff + i * 96;
    d.writeUInt32BE(i, p + 16);
    d.writeUInt32BE(t.earned ? 1 : 0, p + 20);
    const ticks = t.earned
      ? unixMsToDatTimestamp(t.unlockedAtMs ?? Date.UTC(2023, 0, 1))
      : 0n;
    d.writeBigUInt64BE(ticks, p + 32);
  }

  // Identity inside logical block-0 payload:
  // file 0x200 → logical 0x1C0, file 0x208 → logical 0x1C8, file 0x250 → logical 0x210.
  Buffer.from(accountHex, 'hex').copy(d, 0x1c0);
  Buffer.from(uid, 'hex').copy(d, 0x1c8);
  Buffer.from(catalogHashHex, 'hex').copy(d, 0x210);

  // --- T2PD file: header (64) + blocks of (payload 1024 + sha256 32) -------
  const blocks = Math.ceil(logicalSize / 1024);
  const file = Buffer.alloc(64 + blocks * 1056);
  file.write('T2PD', 0, 'ascii');
  file.writeUInt32BE(0x10000, 4);
  file.writeBigUInt64BE(1056n, 8);
  file.writeBigUInt64BE(BigInt(blocks), 32);

  for (let i = 0; i < blocks; i++) {
    const p = 64 + i * 1056;
    d.copy(file, p, i * 1024, Math.min((i + 1) * 1024, logicalSize));
    crypto
      .createHash('sha256')
      .update(file.subarray(p, p + 1024))
      .digest()
      .copy(file, p + 1024);
  }

  return file;
}

/** Minimal valid 1×1 transparent PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Assemble a valid TROPHY.UCP catalog file.
 */
export function buildTrophyUcp(opts: {
  npwr?: string;
  title?: string;
  language?: string;
  trophies: UcpTrophyInput[];
  gameIconPng?: Buffer;
}): Buffer {
  const npwr = opts.npwr ?? 'NPWR12345_00';
  const title = opts.title ?? 'Test Game';
  const lang = opts.language ?? 'en-US';

  const conf = {
    trophyNpCommId: npwr,
    trophySetVersion: '01.00',
    trophies: opts.trophies.map((t) => ({
      id: t.id,
      grade: t.grade,
      hidden: !!t.hidden,
      groupId: '0000',
    })),
  };
  const meta = {
    metadata: {
      titleMetadata: { name: title },
      trophyMetadata: opts.trophies.map((t) => ({
        id: t.id,
        name: t.name,
        detail: t.detail,
      })),
    },
  };

  const files: Array<{ name: string; data: Buffer }> = [
    { name: 'tropconf.json', data: Buffer.from(JSON.stringify(conf), 'utf8') },
    { name: `tropmeta_${lang}.json`, data: Buffer.from(JSON.stringify(meta), 'utf8') },
  ];
  for (const t of opts.trophies) {
    if (t.iconPng) {
      files.push({
        name: `trop${String(t.id).padStart(4, '0')}.png`,
        data: t.iconPng,
      });
    }
  }
  if (opts.gameIconPng) {
    files.push({ name: `icon0_${lang}.png`, data: opts.gameIconPng });
  }

  const count = files.length;
  const dirStart = 96;
  const dataStart = dirStart + count * 64;
  let dataSize = 0;
  for (const f of files) dataSize += f.data.length;
  const total = dataStart + dataSize;

  const buf = Buffer.alloc(total);
  buf.writeUInt32BE(0xb228c60a, 0);
  buf.writeUInt32BE(1, 4);
  buf.writeBigUInt64BE(BigInt(total), 8);
  buf.writeUInt32BE(count, 16);
  buf.writeUInt32BE(64, 20);

  let off = dataStart;
  files.forEach((f, i) => {
    const p = dirStart + i * 64;
    buf.write(f.name, p, 'utf8');
    buf.writeBigUInt64BE(BigInt(off), p + 32);
    buf.writeBigUInt64BE(BigInt(f.data.length), p + 40);
    f.data.copy(buf, off);
    off += f.data.length;
  });

  // Header SHA-1: hash of the whole file with bytes 28-47 zeroed (they are).
  const hashed = Buffer.from(buf);
  hashed.fill(0, 28, 48);
  crypto.createHash('sha1').update(hashed).digest().copy(buf, 28);

  return buf;
}

/**
 * Minimal ZIP writer (deflate, no extras) for test uploads.
 */
export function buildZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const deflated = zlib.deflateRawSync(f.data);
    const crc = crc32(f.data);
    const nameBuf = Buffer.from(f.name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0, 12); // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    localParts.push(local, nameBuf, deflated);
    centralParts.push(Buffer.concat([central, nameBuf]));
    offset += local.length + nameBuf.length + deflated.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

// --- CRC32 for the ZIP writer ----------------------------------------------

let table: number[] | undefined;
function crc32(buf: Buffer): number {
  if (!table) {
    table = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
  }
  let c = 0xffffffff;
  for (const v of buf) c = table[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
