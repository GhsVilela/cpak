import * as crypto from 'crypto';
import * as fs from 'fs';
import * as zlib from 'zlib';
import { Open } from 'unzipper';

/**
 * PS5 trophy backup parser (TRPTITLE.DAT + TROPHY.UCP).
 *
 * Format reverse-engineered from console backups; reference implementation:
 * https://github.com/kiikeep/KIK-Trophy (app/core.cjs). Files are not
 * encrypted — they are structured binaries with integrity hashes.
 *
 * TRPTITLE.DAT (T2PD v1): user progress — earned trophies, timestamps and
 * owner identity. TROPHY.UCP (UCP v1): game catalog — trophy names,
 * descriptions, grades and PNG icons.
 */

export const MAX_DAT_BYTES = 1024 * 1024;
export const MAX_UCP_BYTES = 64 * 1024 * 1024;
export const MAX_ZIP_BYTES = 512 * 1024 * 1024;
export const MAX_ZIP_CONTENT_BYTES = 1024 * 1024 * 1024;

export type TrophyGrade = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface ParsedDatTrophy {
  id: number;
  earned: boolean;
  flags: number;
  unlockedAt: Date | null;
}

export interface ParsedDat {
  npwr: string;
  uid: string;
  accountHex: string;
  accountBase64: string;
  catalogHash: string;
  blocks: number;
  total: number;
  earned: number;
  trophies: ParsedDatTrophy[];
}

export interface ParsedUcpTrophy {
  name: string;
  description: string;
  grade: TrophyGrade;
  hidden: boolean;
  iconPng: Buffer | null;
}

export interface ParsedUcp {
  npwr: string;
  hash: string;
  title: string;
  version: string;
  trophies: Map<number, ParsedUcpTrophy>;
  gameIconPng: Buffer | null;
}

export interface TrophyBackupGame {
  npwr: string;
  title: string;
  catalogHash: string;
  total: number;
  earned: number;
  trophies: Array<{
    id: number;
    name: string;
    description: string;
    grade: TrophyGrade;
    hidden: boolean;
    earned: boolean;
    unlockedAt: Date | null;
  }>;
  gameIconPng: Buffer | null;
  trophyIcons: Map<number, Buffer>;
}

export interface TrophyBackupUploadFile {
  name: string;
  data: Buffer;
}

function assertOk(ok: boolean, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

function readU64(buf: Buffer, offset: number): number {
  assertOk(
    offset >= 0 && offset + 8 <= buf.length,
    'Offset beyond end of file',
  );
  const n = buf.readBigUInt64BE(offset);
  assertOk(n <= BigInt(Number.MAX_SAFE_INTEGER), 'Offset too large');
  return Number(n);
}

function isNpwr(value: string): boolean {
  return /^NPWR\d{5}_\d{2}$/.test(value);
}

/**
 * Convert a DAT progress-record timestamp to a Date.
 * The value is offset from 62135596800000000 and expressed in
 * 1000 ticks per millisecond (matching the KIK-Trophy reference decoder).
 */
function dateFromTicks(ticks: bigint): Date | null {
  if (ticks === 0n) return null;
  const ms = Number((ticks - 62135596800000000n) / 1000n);
  assertOk(
    Number.isFinite(ms) && Math.abs(ms) < 8640000000000000,
    'Timestamp out of range',
  );
  return new Date(ms);
}

/**
 * Encode a Unix timestamp into the DAT progress-record timestamp field.
 * Matches the reference decoder: (field - 62135596800000000) / 1000 = unix ms.
 */
export function unixMsToDatTimestamp(unixMs: number): bigint {
  return BigInt(unixMs) * 1000n + 62135596800000000n;
}

/**
 * Parse a TRPTITLE.DAT (T2PD v1) user-progress file.
 */
export function parseTrpTitleDat(buf: Buffer): ParsedDat {
  assertOk(
    Buffer.isBuffer(buf) && buf.length >= 1120 && buf.length <= MAX_DAT_BYTES,
    'DAT file must be between 1 KB and 1 MB',
  );
  assertOk(
    buf.toString('ascii', 0, 4) === 'T2PD' && buf.readUInt32BE(4) === 0x10000,
    'Not a compatible T2PD v1 TRPTITLE.DAT',
  );
  assertOk(
    readU64(buf, 8) === 1056 && (buf.length - 64) % 1056 === 0,
    'Invalid T2PD block size',
  );
  const blocks = (buf.length - 64) / 1056;
  assertOk(readU64(buf, 32) === blocks, 'Inconsistent block count');

  // Reassemble the logical T2TD buffer from verified 1024-byte block payloads.
  const d = Buffer.alloc(blocks * 1024);
  for (let i = 0; i < blocks; i++) {
    const p = 64 + i * 1056;
    const payload = buf.subarray(p, p + 1024);
    const storedHash = buf.subarray(p + 1024, p + 1056);
    const payloadHash = crypto.createHash('sha256').update(payload).digest();
    if (!payloadHash.equals(storedHash)) {
      // Some console backups leave the hash of trailing zero-padding blocks
      // uninitialized (all zeros). Accept those blocks as padding instead of
      // failing the whole file.
      const isZeroHash = storedHash.every((b) => b === 0);
      const isZeroPayload = payload.every((b) => b === 0);
      assertOk(isZeroHash && isZeroPayload, `Invalid SHA-256 in block ${i + 1}`);
    }
    payload.copy(d, i * 1024);
  }

  assertOk(
    d.toString('ascii', 0, 4) === 'T2TD' &&
      d.readUInt32BE(4) === 0x10000 &&
      d.readUInt32BE(8) === 9,
    'Incompatible T2TD structure',
  );

  const sections: Array<{ type: number; size: number; count: number; off: number }> = [];
  for (let i = 0; i < 9; i++) {
    const p = 0x30 + i * 32;
    const type = d.readUInt32BE(p);
    const size = d.readUInt32BE(p + 4);
    const count = d.readUInt32BE(p + 12);
    const off = readU64(d, p + 16);
    assertOk(
      size > 0 &&
        count > 0 &&
        count <= 512 &&
        off <= d.length &&
        count * (size + 16) <= d.length - off,
      'Section out of bounds',
    );
    for (let j = 0; j < count; j++) {
      const r = off + j * (size + 16);
      assertOk(
        d.readUInt32BE(r) === type && d.readUInt32BE(r + 4) === size,
        'Inconsistent record header',
      );
    }
    sections.push({ type, size, count, off });
  }

  // Identity sections must sit at the locations we know how to read.
  assertOk(
    sections[2].type === 0x100 &&
      sections[2].off === 0x200 &&
      sections[3].type === 0x300 &&
      sections[3].off === 0x250,
    'Incompatible identity layout',
  );

  const npwrStr = d.toString('ascii', 0x260, 0x26c);
  const npwr = npwrStr.replace(/\0+$/, '');
  assertOk(isNpwr(npwr), 'Invalid NPWR title id');

  const state = sections.find((s) => s.type === 0x800);
  assertOk(!!state, 'Missing progress records');
  assertOk(state.size === 80, 'Incompatible progress records');

  const trophies: ParsedDatTrophy[] = [];
  for (let i = 0; i < state.count; i++) {
    const p = state.off + i * 96;
    const tid = d.readUInt32BE(p + 16);
    const flags = d.readUInt32BE(p + 20);
    const ticks = d.readBigUInt64BE(p + 32);
    assertOk(tid === i, 'Inconsistent trophy ids');
    trophies.push({
      id: tid,
      earned: !!(flags & 1),
      flags,
      unlockedAt: flags & 1 ? dateFromTicks(ticks) : null,
    });
  }

  const account = buf.subarray(0x200, 0x208);
  const uid = buf.subarray(0x208, 0x20c).toString('hex');

  return {
    npwr,
    uid,
    accountHex: account.toString('hex'),
    accountBase64: Buffer.from(account).reverse().toString('base64'),
    catalogHash: buf.subarray(0x250, 0x264).toString('hex'),
    blocks,
    total: trophies.length,
    earned: trophies.filter((t) => t.earned).length,
    trophies,
  };
}

/**
 * Preferred catalog language order for TROPHY.UCP metadata.
 */
const UCP_CATALOG_LANGUAGES = [
  'en-US', 'en-GB', 'en', 'es-419', 'es-ES', 'es', 'pt-BR', 'pt', 'fr',
  'de', 'it', 'nl', 'ru', 'pl', 'tr', 'sv', 'da', 'fi', 'no', 'ja',
  'ko', 'zh-CN', 'zh-TW', 'ar',
];

function normalizeGrade(grade: unknown): TrophyGrade {
  if (grade === null || grade === undefined) return 'bronze';
  if (typeof grade === 'number') {
    // Common mappings seen in trophy formats
    if (grade === 0) return 'platinum';
    if (grade === 1) return 'gold';
    if (grade === 2) return 'silver';
    if (grade === 3) return 'bronze';
    if (grade === 4) return 'platinum';
    if (grade === 5) return 'gold';
    if (grade === 6) return 'silver';
    if (grade === 7) return 'bronze';
    if (grade === 100 || grade === 10) return 'platinum';
  }
  const g = String(grade).toLowerCase().replace(/[^a-z]/g, '');
  if (g === 'platinum' || g === 'plat' || g === 'p') return 'platinum';
  if (g === 'gold' || g === 'g') return 'gold';
  if (g === 'silver' || g === 's') return 'silver';
  if (g === 'bronze' || g === 'b') return 'bronze';
  // Some formats use type codes as strings
  if (g === '0') return 'platinum';
  if (g === '1') return 'gold';
  if (g === '2') return 'silver';
  if (g === '3') return 'bronze';
  if (g === '4') return 'platinum';
  if (g === '5') return 'gold';
  if (g === '6') return 'silver';
  if (g === '7') return 'bronze';
  return 'bronze';
}

const PNG_MAGIC = Buffer.from('89504e470d0a1a0a', 'hex');

function pngOrNone(buf: Buffer, off: number, size: number): Buffer | null {
  if (size <= 0 || size > 4 * 1024 * 1024) return null;
  if (off + size > buf.length) return null;
  const b = buf.subarray(off, off + size);
  if (!b.subarray(0, 8).equals(PNG_MAGIC)) return null;
  return Buffer.from(b);
}

/**
 * Parse a TROPHY.UCP (UCP v1) game catalog.
 */
export function parseTrophyUcp(buf: Buffer): ParsedUcp {
  assertOk(
    buf.length >= 96 && buf.length <= MAX_UCP_BYTES,
    'Empty or oversized UCP file',
  );
  assertOk(
    buf.readUInt32BE(0) === 0xb228c60a && buf.readUInt32BE(4) === 1,
    'Not a compatible UCP v1',
  );
  assertOk(
    readU64(buf, 8) === buf.length && buf.readUInt32BE(20) === 64,
    'Inconsistent UCP header',
  );

  const count = buf.readUInt32BE(16);
  assertOk(
    count > 0 && count <= 4096 && 96 + count * 64 <= buf.length,
    'UCP directory out of bounds',
  );

  const hashed = Buffer.from(buf);
  hashed.fill(0, 28, 48);
  const headerHash = crypto.createHash('sha1').update(hashed).digest();
  assertOk(
    headerHash.equals(buf.subarray(28, 48)),
    'Invalid UCP internal SHA-1',
  );

  const entries = new Map<string, { off: number; size: number }>();
  for (let i = 0; i < count; i++) {
    const p = 96 + i * 64;
    const name = buf.subarray(p, p + 32).toString('utf8').split('\0')[0];
    const off = readU64(buf, p + 32);
    const size = readU64(buf, p + 40);
    assertOk(
      off >= 96 + count * 64 &&
        size <= MAX_UCP_BYTES &&
        off <= buf.length &&
        size <= buf.length - off,
      'UCP entry out of bounds',
    );
    assertOk(!entries.has(name), 'Duplicate UCP entry');
    entries.set(name, { off, size });
  }

  const readJson = (name: string): any => {
    const e = entries.get(name);
    assertOk(!!e, `Missing ${name}`);
    assertOk(e.size <= 1024 * 1024, `Oversized ${name}`);
    return JSON.parse(buf.toString('utf8', e.off, e.off + e.size));
  };

  const conf = readJson('tropconf.json');
  assertOk(
    isNpwr(conf.trophyNpCommId) && Array.isArray(conf.trophies),
    'Invalid trophy configuration',
  );

  const lang =
    UCP_CATALOG_LANGUAGES.find((l) => entries.has(`tropmeta_${l}.json`)) ??
    [...entries.keys()]
      .map((n) => n.match(/^tropmeta_(.+)\.json$/)?.[1])
      .find((l) => !!l);
  const meta = lang ? readJson(`tropmeta_${lang}.json`).metadata : {};
  const descriptions = new Map<number, { name?: string; detail?: string }>(
    ((meta?.trophyMetadata as any[]) ?? []).map((t) => [Number(t.id), t]),
  );

  const trophies = new Map<number, ParsedUcpTrophy>();
  for (const t of conf.trophies as any[]) {
    const id = Number(t.id);
    const metaEntry = descriptions.get(id);
    const gradeCandidates = [
      t.grade,
      t.trophyGrade,
      t.type,
      t.trophyType,
      t.rank,
      t.trophyRank,
      t.rarity,
      t.trophyRarity,
      t.category,
      (metaEntry as any)?.grade,
      (metaEntry as any)?.trophyGrade,
      (metaEntry as any)?.type,
      (t as any).detail?.grade,
    ];
    let grade: TrophyGrade = 'bronze';
    for (const c of gradeCandidates) {
      const normalized = normalizeGrade(c);
      if (normalized !== 'bronze' || grade === 'bronze') {
        // prefer non-bronze if found
        const isNonBronze = normalized !== 'bronze';
        const currentIsNonBronze = grade !== 'bronze';
        if (isNonBronze && !currentIsNonBronze) {
          grade = normalized;
        } else if (grade === 'bronze' && normalized !== 'bronze') {
          grade = normalized;
        } else if (c === t.grade) {
          grade = normalized;
        } else if (grade === 'bronze') {
          grade = normalized;
        }
      }
    }
    // if still bronze but found any non-bronze candidate later? simpler: pick first non-bronze
    if (grade === 'bronze') {
      for (const c of gradeCandidates) {
        const normalized = normalizeGrade(c);
        if (normalized !== 'bronze') {
          grade = normalized;
          break;
        }
      }
    } else {
      // keep first non-bronze found
    }
    trophies.set(id, {
      name: metaEntry?.name || `Trophy #${id}`,
      description: metaEntry?.detail || '',
      grade,
      hidden: !!t.hidden,
      iconPng: pngOrNone(
        buf,
        ...(() => {
          const e = entries.get(`trop${String(id).padStart(4, '0')}.png`);
          return e ? [e.off, e.size] as const : [0, 0] as const;
        })(),
      ),
    });
  }

  const iconCandidates = [
    lang ? `icon0_${lang}.png` : null,
    'icon0.png',
    ...[...entries.keys()].filter((n) => /^icon0_.+\.png$/.test(n)),
  ].filter((n): n is string => !!n);
  const iconName = iconCandidates.find((n) => entries.has(n));
  const gameIconPng = iconName
    ? pngOrNone(
        buf,
        entries.get(iconName)!.off,
        entries.get(iconName)!.size,
      )
    : null;

  return {
    npwr: conf.trophyNpCommId,
    hash: buf.subarray(28, 48).toString('hex'),
    title: meta?.titleMetadata?.name || conf.trophyNpCommId,
    version: conf.trophySetVersion || '',
    trophies,
    gameIconPng,
  };
}

// ---------------------------------------------------------------------------
// ZIP extraction (stored + deflate only, no encryption / ZIP64)
// ---------------------------------------------------------------------------

let crcTable: number[] | undefined;

function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
  }
  let c = 0xffffffff;
  for (const v of buf) c = crcTable[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Extract TRPTITLE.DAT / TROPHY.UCP entries from an in-memory ZIP archive.
 */
export function extractTrophyFilesFromZip(buf: Buffer): TrophyBackupUploadFile[] {
  assertOk(buf.length <= MAX_ZIP_BYTES, 'ZIP too large (max 512 MiB)');

  // Locate the end-of-central-directory record.
  let eocd = -1;
  for (let p = buf.length - 22; p >= Math.max(0, buf.length - 65557); p--) {
    if (
      buf.readUInt32LE(p) === 0x06054b50 &&
      p + 22 + buf.readUInt16LE(p + 20) === buf.length
    ) {
      eocd = p;
      break;
    }
  }
  assertOk(eocd >= 0, 'Incomplete or unsupported ZIP');
  assertOk(
    buf.readUInt16LE(eocd + 4) === 0 && buf.readUInt16LE(eocd + 6) === 0,
    'Multi-disk ZIP not supported',
  );

  const entryCount = buf.readUInt16LE(eocd + 10);
  const dirOffset = buf.readUInt32LE(eocd + 16);
  const dirSize = buf.readUInt32LE(eocd + 12);
  assertOk(
    entryCount <= 8192 && dirOffset + dirSize <= eocd,
    'Invalid ZIP directory (ZIP64 not supported)',
  );

  const out: TrophyBackupUploadFile[] = [];
  let p = dirOffset;
  let totalExtracted = 0;
  for (let i = 0; i < entryCount; i++) {
    assertOk(
      p + 46 <= dirOffset + dirSize && buf.readUInt32LE(p) === 0x02014b50,
      'Invalid ZIP entry',
    );
    const flag = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const rawSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    assertOk(
      p + 46 + nameLen + extraLen + commentLen <= dirOffset + dirSize,
      'ZIP entry name out of bounds',
    );
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (!/(?:^|\/)(?:TRPTITLE\.DAT|TROPHY\.UCP)$/i.test(name)) continue;

    assertOk(!(flag & 1), 'Encrypted ZIP not supported');
    const isDat = /TRPTITLE\.DAT$/i.test(name);
    assertOk(
      rawSize > 0 && rawSize <= (isDat ? MAX_DAT_BYTES : MAX_UCP_BYTES),
      `ZIP entry ${name} too large`,
    );
    totalExtracted += rawSize;
    assertOk(
      totalExtracted <= MAX_ZIP_CONTENT_BYTES,
      'Trophy content exceeds 1 GiB',
    );
    assertOk(
      localOffset + 30 <= dirOffset && buf.readUInt32LE(localOffset) === 0x04034b50,
      'Invalid local ZIP header',
    );
    const start =
      localOffset +
      30 +
      buf.readUInt16LE(localOffset + 26) +
      buf.readUInt16LE(localOffset + 28);
    assertOk(start + compressedSize <= dirOffset, 'ZIP data out of bounds');

    let data: Buffer | null;
    if (method === 0) {
      data = Buffer.from(buf.subarray(start, start + compressedSize));
    } else if (method === 8) {
      data = zlib.inflateRawSync(buf.subarray(start, start + compressedSize), {
        maxOutputLength: rawSize,
      });
    } else {
      data = null;
    }
    assertOk(!!data, `Invalid CRC or compression for ${name}`);
    assertOk(
      data.length === rawSize && crc32(data) === crc,
      `Invalid CRC or compression for ${name}`,
    );
    out.push({ name, data });
  }
  return out;
}

/**
 * Stream-extract TRPTITLE.DAT / TROPHY.UCP entries from a ZIP on disk.
 *
 * Unlike `extractTrophyFilesFromZip`, this never loads the whole archive into
 * memory, so full console backups (several hundred MB) can be imported.
 */
export async function extractTrophyFilesFromZipFile(
  filePath: string,
): Promise<TrophyBackupUploadFile[]> {
  const directory = await Open.file(filePath);
  const out: TrophyBackupUploadFile[] = [];
  let totalExtracted = 0;

  for (const entry of directory.files) {
    if (entry.type !== 'File') continue;
    if (!/(?:^|\/)(?:TRPTITLE\.DAT|TROPHY\.UCP)$/i.test(entry.path)) continue;

    const isDat = /TRPTITLE\.DAT$/i.test(entry.path);
    const maxSize = isDat ? MAX_DAT_BYTES : MAX_UCP_BYTES;
    assertOk(
      entry.uncompressedSize > 0 && entry.uncompressedSize <= maxSize,
      `ZIP entry ${entry.path} too large`,
    );
    totalExtracted += entry.uncompressedSize;
    assertOk(
      totalExtracted <= MAX_ZIP_CONTENT_BYTES,
      'Trophy content exceeds 1 GiB',
    );

    let data: Buffer;
    try {
      data = await entry.buffer();
    } catch (err) {
      throw new Error(
        `Failed to extract ${entry.path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    assertOk(data.length > 0 && data.length <= maxSize, `ZIP entry ${entry.path} too large`);
    out.push({ name: entry.path, data });
  }

  return out;
}

/**
 * Collect trophy files from an uploaded backup already saved to disk. Accepts
 * a ZIP archive (streamed, only trophy entries are read) or a single
 * TRPTITLE.DAT / TROPHY.UCP.
 */
export async function collectTrophyFilesFromUploadFile(
  filePath: string,
  filename: string,
): Promise<TrophyBackupUploadFile[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.zip')) {
    return extractTrophyFilesFromZipFile(filePath);
  }
  if (lower.endsWith('.dat') || lower.endsWith('.ucp')) {
    const maxSize = lower.endsWith('.dat') ? MAX_DAT_BYTES : MAX_UCP_BYTES;
    const stats = await fs.promises.stat(filePath);
    assertOk(
      stats.size > 0 && stats.size <= maxSize,
      `${lower.endsWith('.dat') ? 'DAT' : 'UCP'} file has an invalid size`,
    );
    return [
      {
        name: lower.endsWith('.dat') ? 'TRPTITLE.DAT' : 'TROPHY.UCP',
        data: await fs.promises.readFile(filePath),
      },
    ];
  }
  throw new Error('Unsupported file type. Upload a .zip backup, TRPTITLE.DAT or TROPHY.UCP.');
}

/**
 * Collect trophy files from an in-memory upload buffer.
 */
export function collectTrophyFilesFromUpload(
  buf: Buffer,
  filename: string,
): TrophyBackupUploadFile[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.zip')) {
    return extractTrophyFilesFromZip(buf);
  }
  if (lower.endsWith('.dat')) {
    return [{ name: 'TRPTITLE.DAT', data: buf }];
  }
  if (lower.endsWith('.ucp')) {
    return [{ name: 'TROPHY.UCP', data: buf }];
  }
  throw new Error('Unsupported file type. Upload a .zip backup, TRPTITLE.DAT or TROPHY.UCP.');
}

export interface BuiltTrophyBackupResult {
  games: TrophyBackupGame[];
  errors: Array<{ file: string; error: string }>;
  /**
   * Files that were valid but intentionally not imported (for example trophy
   * catalogs for games with no progress, or duplicate progress copies). These
   * are expected in full console backups and are not read failures.
   */
  ignored: Array<{ file: string; reason: string }>;
}

/**
 * Parse all DAT/UCP files from a backup upload and merge user progress with
 * the matching game catalog (matched by NPWR id, preferring catalog hash).
 */
export function buildTrophyBackups(files: TrophyBackupUploadFile[]): BuiltTrophyBackupResult {
  const dats: Array<{ file: string; parsed: ParsedDat }> = [];
  const ucps: Array<{ file: string; parsed: ParsedUcp }> = [];
  const errors: Array<{ file: string; error: string }> = [];
  const ignored: Array<{ file: string; reason: string }> = [];

  for (const f of files) {
    try {
      if (/TRPTITLE\.DAT$/i.test(f.name)) {
        dats.push({ file: f.name, parsed: parseTrpTitleDat(f.data) });
      } else if (/TROPHY\.UCP$/i.test(f.name)) {
        ucps.push({ file: f.name, parsed: parseTrophyUcp(f.data) });
      } else {
        errors.push({ file: f.name, error: 'Not a TRPTITLE.DAT or TROPHY.UCP file' });
      }
    } catch (err) {
      errors.push({
        file: f.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const seen = new Set<string>();
  const games: TrophyBackupGame[] = [];

  // A full console backup can contain one DAT per local user. Keep the
  // progress with the most earned trophies instead of whichever came first.
  const bestByNpwr = new Map<string, { file: string; parsed: ParsedDat }>();
  for (const dat of dats) {
    const previous = bestByNpwr.get(dat.parsed.npwr);
    if (!previous) {
      bestByNpwr.set(dat.parsed.npwr, dat);
      continue;
    }
    ignored.push({
      file: dat.file,
      reason: `Duplicate progress for ${dat.parsed.npwr}`,
    });
    if (isBetterProgress(dat.parsed, previous.parsed)) {
      bestByNpwr.set(dat.parsed.npwr, dat);
    }
  }

  for (const { file, parsed: dat } of bestByNpwr.values()) {
    if (seen.has(dat.npwr)) {
      ignored.push({
        file,
        reason: `Duplicate progress for ${dat.npwr}`,
      });
      continue;
    }
    seen.add(dat.npwr);

    // Prefer the catalog whose SHA-1 matches the DAT's recorded catalog hash.
    const matching = ucps.filter((u) => u.parsed.npwr === dat.npwr);
    const catalog =
      matching.find((u) => u.parsed.hash === dat.catalogHash)?.parsed ??
      matching[0]?.parsed ??
      null;

    const trophies: TrophyBackupGame['trophies'] = dat.trophies.map((t) => {
      const cat = catalog?.trophies.get(t.id);
      return {
        id: t.id,
        name: cat?.name ?? `Trophy #${t.id}`,
        description: cat?.description ?? '',
        grade: cat?.grade ?? 'bronze',
        hidden: cat?.hidden ?? false,
        earned: t.earned,
        unlockedAt: t.unlockedAt,
      };
    });

    const trophyIcons = new Map<number, Buffer>();
    if (catalog) {
      for (const [id, trophy] of catalog.trophies) {
        if (trophy.iconPng) trophyIcons.set(id, trophy.iconPng);
      }
    }

    games.push({
      npwr: dat.npwr,
      title: catalog?.title || dat.npwr,
      catalogHash: dat.catalogHash,
      total: dat.total,
      earned: dat.earned,
      trophies,
      gameIconPng: catalog?.gameIconPng ?? null,
      trophyIcons,
    });
  }

  // UCPs without a matching DAT carry no progress — skip them silently.
  for (const { file, parsed: ucp } of ucps) {
    if (![...bestByNpwr.values()].some((d) => d.parsed.npwr === ucp.npwr)) {
      ignored.push({
        file,
        reason: `No trophy progress for ${ucp.npwr}${ucp.title ? ` (${ucp.title})` : ''}`,
      });
    }
  }

  return { games, errors, ignored };
}

function isBetterProgress(a: ParsedDat, b: ParsedDat): boolean {
  return a.earned !== b.earned ? a.earned > b.earned : a.total !== b.total ? a.total > b.total : a.trophies.length > b.trophies.length;
}
