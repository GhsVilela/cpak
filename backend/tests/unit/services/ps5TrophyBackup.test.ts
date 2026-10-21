import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  parseTrpTitleDat,
  parseTrophyUcp,
  extractTrophyFilesFromZip,
  extractTrophyFilesFromZipFile,
  collectTrophyFilesFromUpload,
  collectTrophyFilesFromUploadFile,
  buildTrophyBackups,
} from '../../../src/services/ps5TrophyBackup.js';
import {
  buildTrpTitleDat,
  buildTrophyUcp,
  buildZip,
  TINY_PNG,
} from '../../helpers/ps5TrophyFixtures.js';

const NPWR = 'NPWR20842_00';

function sampleDat(overrides?: Partial<Parameters<typeof buildTrpTitleDat>[0]>) {
  return buildTrpTitleDat({
    npwr: NPWR,
    uid: '1234abcd',
    accountHex: '0123456789abcdef',
    catalogHashHex: 'b'.repeat(40),
    trophies: [
      { earned: true, unlockedAtMs: Date.UTC(2023, 5, 15, 12, 30, 0) },
      { earned: true, unlockedAtMs: Date.UTC(2024, 0, 2) },
      { earned: false },
    ],
    ...overrides,
  });
}

function sampleUcp() {
  return buildTrophyUcp({
    npwr: NPWR,
    title: 'Ratchet & Clank: Rift Apart',
    trophies: [
      { id: 0, name: 'Platinum Trophy', detail: 'Earn all trophies', grade: 'platinum' },
      { id: 1, name: 'First Step', detail: 'Complete the first level', grade: 'bronze' },
      { id: 2, name: 'Hidden Helper', detail: '', grade: 'silver', hidden: true, iconPng: TINY_PNG },
    ],
    gameIconPng: TINY_PNG,
  });
}

describe('parseTrpTitleDat', () => {
  it('tolerates trailing padding blocks whose SHA-256 is uninitialized', () => {
    const original = sampleDat();
    const blocks = Number(original.readBigUInt64BE(32));
    const padded = Buffer.alloc(original.length + 1056);
    original.copy(padded, 0);
    padded.writeBigUInt64BE(BigInt(blocks + 1), 32);

    const dat = parseTrpTitleDat(padded);
    expect(dat.npwr).toBe(NPWR);
    expect(dat.total).toBe(3);
    expect(dat.earned).toBe(2);
  });

  it('rejects a corrupt block that is not zero padding', () => {
    const original = sampleDat();
    const corrupted = Buffer.from(original);
    corrupted[64 + 1024] ^= 0xff;
    expect(() => parseTrpTitleDat(corrupted)).toThrow(/SHA-256/);
  });

  it('parses identity, progress and timestamps from a valid DAT', () => {
    const dat = parseTrpTitleDat(sampleDat());

    expect(dat.npwr).toBe(NPWR);
    expect(dat.uid).toBe('1234abcd');
    expect(dat.accountHex).toBe('0123456789abcdef');
    expect(dat.accountBase64).toBe(Buffer.from('0123456789abcdef', 'hex').reverse().toString('base64'));
    expect(dat.catalogHash).toBe('b'.repeat(40));
    expect(dat.total).toBe(3);
    expect(dat.earned).toBe(2);
    expect(dat.trophies.map((t) => t.earned)).toEqual([true, true, false]);
    expect(dat.trophies[0].unlockedAt?.toISOString()).toBe(new Date(Date.UTC(2023, 5, 15, 12, 30, 0)).toISOString());
    expect(dat.trophies[1].unlockedAt?.toISOString()).toBe(new Date(Date.UTC(2024, 0, 2)).toISOString());
    expect(dat.trophies[2].unlockedAt).toBeNull();
  });

  it('rejects buffers with wrong magic', () => {
    const bad = sampleDat();
    bad.write('XXXX', 0, 'ascii');
    expect(() => parseTrpTitleDat(bad)).toThrow(/T2PD/);
  });

  it('rejects truncated buffers', () => {
    expect(() => parseTrpTitleDat(Buffer.alloc(100))).toThrow();
  });

  it('rejects corrupted block checksums', () => {
    const bad = sampleDat();
    // Flip a byte inside block 0's payload (file offset 64+).
    bad[100] ^= 0xff;
    expect(() => parseTrpTitleDat(bad)).toThrow(/SHA-256/);
  });
});

describe('parseTrophyUcp', () => {
  it('parses title, trophies, grades and hidden flags', () => {
    const ucp = parseTrophyUcp(sampleUcp());

    expect(ucp.npwr).toBe(NPWR);
    expect(ucp.title).toBe('Ratchet & Clank: Rift Apart');
    expect(ucp.version).toBe('01.00');
    expect(ucp.trophies.size).toBe(3);
    expect(ucp.trophies.get(0)).toMatchObject({
      name: 'Platinum Trophy',
      grade: 'platinum',
      hidden: false,
    });
    expect(ucp.trophies.get(2)).toMatchObject({
      name: 'Hidden Helper',
      grade: 'silver',
      hidden: true,
    });
    expect(ucp.trophies.get(2)?.iconPng).toBeInstanceOf(Buffer);
    expect(ucp.gameIconPng).toBeInstanceOf(Buffer);
  });

  it('rejects invalid magic', () => {
    const bad = sampleUcp();
    bad.writeUInt32BE(0, 0);
    expect(() => parseTrophyUcp(bad)).toThrow(/UCP/);
  });

  it('rejects a tampered header hash', () => {
    const bad = sampleUcp();
    bad[50] ^= 0xff; // payload byte covered by the header SHA-1
    expect(() => parseTrophyUcp(bad)).toThrow(/SHA-1/);
  });
});

describe('extractTrophyFilesFromZip / collectTrophyFilesFromUpload', () => {
  it('extracts DAT and UCP entries from a ZIP', () => {
    const zip = buildZip([
      { name: 'user/home/1234abcd/trophy2/nobackup/data/TRPTITLE.DAT', data: sampleDat() },
      { name: 'user/trophy2/nobackup/conf/TROPHY.UCP', data: sampleUcp() },
      { name: 'user/readme.txt', data: Buffer.from('ignore me') },
    ]);

    const files = extractTrophyFilesFromZip(zip);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.name).sort()).toEqual([
      'user/home/1234abcd/trophy2/nobackup/data/TRPTITLE.DAT',
      'user/trophy2/nobackup/conf/TROPHY.UCP',
    ]);
  });

  it('accepts single DAT and UCP uploads directly', () => {
    expect(collectTrophyFilesFromUpload(sampleDat(), 'TRPTITLE.DAT')).toHaveLength(1);
    expect(collectTrophyFilesFromUpload(sampleUcp(), 'trophy.ucp')).toHaveLength(1);
  });

  it('rejects unsupported file types', () => {
    expect(() => collectTrophyFilesFromUpload(Buffer.from('x'), 'photo.png')).toThrow(
      /Unsupported file type/,
    );
  });
});

describe('file-based ZIP extraction', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('extracts trophy entries from a ZIP file on disk', async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cpak-trophy-test-'));
    const zipPath = path.join(tempDir, 'backup.zip');
    await fs.promises.writeFile(
      zipPath,
      buildZip([
        { name: 'user/trophy2/nobackup/conf/NPWR20842_00/TROPHY.UCP', data: sampleUcp() },
        { name: 'user/home/abc/trophy2/nobackup/data/NPWR20842_00/TRPTITLE.DAT', data: sampleDat() },
        { name: 'user/readme.txt', data: Buffer.from('ignore') },
      ]),
    );

    const files = await extractTrophyFilesFromZipFile(zipPath);
    expect(files).toHaveLength(2);
    expect(files.map((f) => path.basename(f.name)).sort()).toEqual([
      'TROPHY.UCP',
      'TRPTITLE.DAT',
    ]);
  });

  it('reads a single DAT/UCP upload from disk', async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cpak-trophy-test-'));
    const datPath = path.join(tempDir, 'TRPTITLE.DAT');
    await fs.promises.writeFile(datPath, sampleDat());

    const datFiles = await collectTrophyFilesFromUploadFile(datPath, 'TRPTITLE.DAT');
    expect(datFiles).toHaveLength(1);
    expect(() => parseTrpTitleDat(datFiles[0].data)).not.toThrow();

    const ucpPath = path.join(tempDir, 'TROPHY.UCP');
    await fs.promises.writeFile(ucpPath, sampleUcp());
    const ucpFiles = await collectTrophyFilesFromUploadFile(ucpPath, 'TROPHY.UCP');
    expect(() => parseTrophyUcp(ucpFiles[0].data)).not.toThrow();
  });

  it('rejects unsupported extensions', async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cpak-trophy-test-'));
    const txtPath = path.join(tempDir, 'notes.txt');
    await fs.promises.writeFile(txtPath, 'hello');
    await expect(collectTrophyFilesFromUploadFile(txtPath, 'notes.txt')).rejects.toThrow(
      /Unsupported file type/,
    );
  });
});

describe('buildTrophyBackups', () => {
  it('merges DAT progress with the matching UCP catalog', () => {
    const { games, errors } = buildTrophyBackups([
      { name: 'TRPTITLE.DAT', data: sampleDat() },
      { name: 'TROPHY.UCP', data: sampleUcp() },
    ]);

    expect(errors).toHaveLength(0);
    expect(games).toHaveLength(1);
    const game = games[0];
    expect(game.npwr).toBe(NPWR);
    expect(game.title).toBe('Ratchet & Clank: Rift Apart');
    expect(game.total).toBe(3);
    expect(game.earned).toBe(2);
    expect(game.trophies[0]).toMatchObject({
      name: 'Platinum Trophy',
      grade: 'platinum',
      earned: true,
    });
    expect(game.trophies[1].unlockedAt).toBeInstanceOf(Date);
    expect(game.trophies[2]).toMatchObject({
      name: 'Hidden Helper',
      hidden: true,
      earned: false,
    });
    expect(game.trophyIcons.get(2)).toBeInstanceOf(Buffer);
    expect(game.gameIconPng).toBeInstanceOf(Buffer);
  });

  it('falls back to placeholder names when no catalog is present', () => {
    const { games } = buildTrophyBackups([{ name: 'TRPTITLE.DAT', data: sampleDat() }]);
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe(NPWR);
    expect(games[0].trophies[0].name).toBe('Trophy #0');
    expect(games[0].gameIconPng).toBeNull();
  });

  it('deduplicates multiple DATs for the same game and reports errors for unparsable files', () => {
    const { games, errors } = buildTrophyBackups([
      { name: 'TRPTITLE.DAT', data: sampleDat() },
      { name: 'backup/TRPTITLE.DAT', data: sampleDat() },
      { name: 'broken.dat', data: Buffer.alloc(2000) },
    ]);
    expect(games).toHaveLength(1);
    expect(errors.some((e) => /Duplicate/.test(e.error))).toBe(true);
    expect(errors.some((e) => e.file === 'broken.dat')).toBe(true);
  });

  it('reports catalogs without matching progress files', () => {
    const { errors } = buildTrophyBackups([{ name: 'TROPHY.UCP', data: sampleUcp() }]);
    expect(errors.some((e) => /No TRPTITLE\.DAT/.test(e.error))).toBe(true);
  });
});
