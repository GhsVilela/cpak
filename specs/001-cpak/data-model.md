# Data Model — cpak

## Entities

### Profile
- id: string
- platform: enum(`steam`, `xbox`, `playstation`)
- profileId: string
- displayName: string
- credentials: {
  - tokenType: string
  - accessToken: encrypted
  - refreshToken?: encrypted
  - expiresAt?: datetime
  - scopes?: string[]
}
- createdAt: datetime
- updatedAt: datetime

Indexes: `(platform, profileId)` unique

### Game
- id: string
- platform: enum
- profileId: ref(Profile)
- gameId: string
- title: string
- achievementsTotal: number
- achievementsUnlocked: number
- completionPercent: number
- imageRefs?: {
  - provider: `steamgriddb|native|custom`
  - urls: string[]
}
- lastSyncedAt: datetime

Indexes: `(platform, profileId, gameId)` unique; `completionPercent` for filtering

### Achievement
- id: string
- platform: enum
- profileId: ref(Profile)
- gameId: ref(Game)
- achievementId: string
- name: string
- description?: string
- unlockedAt?: datetime

Indexes: `(platform, profileId, gameId, achievementId)` unique; `unlockedAt`

### SyncRun
- id: string
- timestamp: datetime
- platform: enum
- profileId: ref(Profile)
- status: enum(`success`, `partial`, `error`)
- counts: {
  - games: number
  - achievements: number
}
- error?: string

### ImageAsset
- id: string
- platform: enum
- gameId: ref(Game)
- provider: string
- urls: string[]
- cachedAt: datetime
- status: enum(`ok`, `missing`, `error`)

## Relationships
- Profile 1—N Game
- Game 1—N Achievement
- Game 1—N ImageAsset

## Validation Rules
- `completionPercent = floor(achievementsUnlocked / achievementsTotal * 100)`
- Games with `achievementsUnlocked > 0` are eligible for listing; default filter `completionPercent = 100`
- Credentials stored encrypted; access forbidden via API responses
