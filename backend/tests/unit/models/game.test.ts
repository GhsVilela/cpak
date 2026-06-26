import { describe, it, expect } from 'vitest';
import { Game } from '../../../src/models/game.js';

describe('Game model', () => {
  it('can be imported and is a valid mongoose model', () => {
    expect(Game).toBeTruthy();
    expect(Game.modelName).toBe('Game');
  });

  it('has the expected schema paths', () => {
    const paths = Object.keys(Game.schema.paths);
    expect(paths).toContain('platform');
    expect(paths).toContain('profileId');
    expect(paths).toContain('gameId');
    expect(paths).toContain('title');
    expect(paths).toContain('achievementsTotal');
    expect(paths).toContain('achievementsUnlocked');
    expect(paths).toContain('completionPercent');
    expect(paths).toContain('capsuleImagePath');
    expect(paths).toContain('iconImagePath');
    expect(paths).toContain('heroImagePath');
    expect(paths).toContain('customTitle');
    expect(paths).toContain('devices');
    expect(paths).toContain('currentGamerscore');
    expect(paths).toContain('maxGamerscore');
    expect(paths).toContain('lastPlayed');
    expect(paths).toContain('playTimeMinutes');
    expect(paths).toContain('ownershipSource');
    expect(paths).toContain('achievementsFetchFailed');
    expect(paths).toContain('trophyBronze');
    expect(paths).toContain('trophySilver');
    expect(paths).toContain('trophyGold');
    expect(paths).toContain('trophyPlatinum');
    expect(paths).toContain('lastSyncedAt');
  });

  it('platform field has correct enum values', () => {
    const platformPath = Game.schema.path('platform') as any;
    expect(platformPath.enumValues).toEqual(['steam', 'xbox', 'playstation']);
  });

  it('ownershipSource field has correct enum values', () => {
    const ownershipPath = Game.schema.path('ownershipSource') as any;
    expect(ownershipPath.enumValues).toEqual(['owned', 'played_history']);
  });

  it('has unique compound index on platform + profileId + gameId', () => {
    const indexes = Game.schema.indexes();
    const compoundIndex = indexes.find(
      (idx) => idx[0].platform === 1 && idx[0].profileId === 1 && idx[0].gameId === 1,
    );
    expect(compoundIndex).toBeTruthy();
    expect((compoundIndex as any)[1]?.unique).toBe(true);
  });

  it('creates a valid game document', async () => {
    const game = new Game({
      platform: 'steam',
      profileId: '507f1f77bcf86cd799439011',
      gameId: '440',
      title: 'Team Fortress 2',
      achievementsTotal: 520,
      achievementsUnlocked: 100,
      completionPercent: 19,
    });
    expect(game.platform).toBe('steam');
    expect(game.title).toBe('Team Fortress 2');
    expect(game.achievementsTotal).toBe(520);
  });

  it('defaults achievementsTotal/Unlocked/completionPercent to 0', () => {
    const game = new Game({
      platform: 'xbox',
      profileId: '507f1f77bcf86cd799439011',
      gameId: 'xb1',
      title: 'Test Game',
    });
    expect(game.achievementsTotal).toBe(0);
    expect(game.achievementsUnlocked).toBe(0);
    expect(game.completionPercent).toBe(0);
  });

  it('defaults trophy fields to null', () => {
    const game = new Game({
      platform: 'playstation',
      profileId: '507f1f77bcf86cd799439011',
      gameId: 'ps1',
      title: 'PS Game',
    });
    expect(game.trophyBronze).toBeNull();
    expect(game.trophySilver).toBeNull();
    expect(game.trophyGold).toBeNull();
    expect(game.trophyPlatinum).toBeNull();
  });
});
