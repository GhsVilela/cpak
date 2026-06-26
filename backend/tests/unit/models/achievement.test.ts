import { describe, it, expect } from 'vitest';
import { Achievement } from '../../../src/models/achievement.js';

describe('Achievement model', () => {
  it('can be imported and is a valid mongoose model', () => {
    expect(Achievement).toBeTruthy();
    expect(Achievement.modelName).toBe('Achievement');
  });

  it('has the expected schema paths', () => {
    const paths = Object.keys(Achievement.schema.paths);
    expect(paths).toContain('platform');
    expect(paths).toContain('profileId');
    expect(paths).toContain('gameId');
    expect(paths).toContain('achievementId');
    expect(paths).toContain('name');
    expect(paths).toContain('description');
    expect(paths).toContain('unlockedAt');
    expect(paths).toContain('iconPath');
    expect(paths).toContain('iconGrayPath');
    expect(paths).toContain('gamerscore');
    expect(paths).toContain('trophyGrade');
    expect(paths).toContain('isHidden');
  });

  it('platform field has correct enum values', () => {
    const platformPath = Achievement.schema.path('platform') as any;
    expect(platformPath.enumValues).toEqual(['steam', 'xbox', 'playstation']);
  });

  it('trophyGrade field has correct enum values', () => {
    const gradePath = Achievement.schema.path('trophyGrade') as any;
    expect(gradePath.enumValues).toEqual(
      expect.arrayContaining(['bronze', 'silver', 'gold', 'platinum']),
    );
  });

  it('has unique compound index on platform + profileId + gameId + achievementId', () => {
    const indexes = Achievement.schema.indexes();
    const compoundIndex = indexes.find(
      (idx) =>
        idx[0].platform === 1 &&
        idx[0].profileId === 1 &&
        idx[0].gameId === 1 &&
        idx[0].achievementId === 1,
    );
    expect(compoundIndex).toBeTruthy();
    expect((compoundIndex as any)[1]?.unique).toBe(true);
  });

  it('creates a valid achievement document', () => {
    const achievement = new Achievement({
      platform: 'xbox',
      profileId: '507f1f77bcf86cd799439011',
      gameId: '507f1f77bcf86cd799439012',
      achievementId: 'ach-1',
      name: 'First Blood',
      description: 'Get your first kill',
      gamerscore: 10,
    });
    expect(achievement.platform).toBe('xbox');
    expect(achievement.name).toBe('First Blood');
    expect(achievement.gamerscore).toBe(10);
  });

  it('defaults isHidden to false and trophyGrade to null', () => {
    const achievement = new Achievement({
      platform: 'playstation',
      profileId: '507f1f77bcf86cd799439011',
      gameId: '507f1f77bcf86cd799439012',
      achievementId: 'trophy-1',
      name: 'Trophy Test',
    });
    expect(achievement.isHidden).toBe(false);
    expect(achievement.trophyGrade).toBeNull();
  });

  it('accepts PlayStation trophy grades', () => {
    const achievement = new Achievement({
      platform: 'playstation',
      profileId: '507f1f77bcf86cd799439011',
      gameId: '507f1f77bcf86cd799439012',
      achievementId: 'gold-trophy',
      name: 'Gold Trophy',
      trophyGrade: 'gold',
      isHidden: true,
    });
    expect(achievement.trophyGrade).toBe('gold');
    expect(achievement.isHidden).toBe(true);
  });
});
