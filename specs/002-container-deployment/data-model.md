# Data Model: Containerization Improvements

**Date**: February 12, 2026  
**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

## Overview

This feature introduces a new data entity to support UI-based configuration of settings that were previously only available as environment variables. This reduces deployment complexity by moving optional configuration to the database.

## New Entities

### Settings

**Purpose**: Stores user-configurable application settings that can be managed through the web UI, eliminating the need for environment variables for optional configuration.

**Collection**: `settings` (MongoDB)

**Schema**:

| Field | Type | Required | Encrypted | Description |
|-------|------|----------|-----------|-------------|
| `_id` | ObjectId | Yes | No | MongoDB document identifier |
| `key` | String | Yes | No | Unique setting identifier (e.g., "steam_api_key", "scheduler_enabled") |
| `value` | String | Yes | Conditional | Setting value; encrypted for sensitive keys |
| `category` | Enum | Yes | No | Setting category: `platform_api`, `scheduler`, `sync`, `system` |
| `isSecret` | Boolean | Yes | No | Indicates if value should be encrypted at rest |
| `updatedAt` | Date | Yes | No | Last modification timestamp |
| `updatedBy` | String | No | No | User or system identifier (future: multi-user support) |

**Indexes**:
- Unique index on `key` (ensures one value per setting)
- Index on `category` (for efficient category-based queries)

**Example Documents**:
```json
{
  "_id": "65a1234567890abcdef12345",
  "key": "steam_api_key",
  "value": "ENCRYPTED_VALUE_HERE",
  "category": "platform_api",
  "isSecret": true,
  "updatedAt": "2026-02-12T10:30:00Z",
  "updatedBy": "system"
}

{
  "_id": "65a1234567890abcdef12346",
  "key": "scheduler_enabled",
  "value": "true",
  "category": "scheduler",
  "isSecret": false,
  "updatedAt": "2026-02-12T10:30:00Z",
  "updatedBy": "admin"
}

{
  "_id": "65a1234567890abcdef12347",
  "key": "scheduler_cron",
  "value": "0 3 * * *",
  "category": "scheduler",
  "isSecret": false,
  "updatedAt": "2026-02-12T10:30:00Z",
  "updatedBy": "admin"
}
```

**Validation Rules**:
- `key` must match pattern: `^[a-z_]+$` (lowercase with underscores)
- `category` must be one of: `platform_api`, `scheduler`, `sync`, `system`
- `isSecret` determines encryption requirement
- `value` maximum length: 2048 characters (encrypted values expand)

**Encryption**:
- Values where `isSecret=true` are encrypted using AES-256-GCM
- Encryption key comes from `ENCRYPTION_KEY` environment variable (deployment-time)
- If ENCRYPTION_KEY not provided, default key used with warning logged

---

## Modified Entities

### No modifications to existing entities

The existing MongoDB collections (`profiles`, `games`, `achievements`, `sync_runs`) remain unchanged. This feature only adds the new `settings` collection.

---

## Setting Categories

### platform_api (Sensitive)
Settings for external platform API credentials:
- `steam_api_key` (isSecret: true)
- `xbox_client_id` (isSecret: true)
- `xbox_client_secret` (isSecret: true)
- `playstation_client_id` (isSecret: true)
- `playstation_client_secret` (isSecret: true)
- `steamgrid_api_key` (isSecret: true)

### scheduler (Non-sensitive)
Settings for automated sync scheduling:
- `scheduler_enabled` (isSecret: false, values: "true"|"false")
- `scheduler_cron` (isSecret: false, cron expression)

### sync (Non-sensitive)
Settings for sync behavior:
- `sync_batch_size` (isSecret: false, numeric string, default: "10")
- `icon_download_concurrency` (isSecret: false, numeric string, default: "5")
- `sync_rate_limit_per_min` (isSecret: false, numeric string, default: "60")

### system (Non-sensitive)
Internal system settings:
- `db_schema_version` (isSecret: false, for migrations)
- `first_run_completed` (isSecret: false, setup wizard state)

---

## Migration Strategy

### Initial Setup (New Deployments)

1. On first container start, if `settings` collection doesn't exist:
   - Create collection with indexes
   - Populate default values for non-secret settings
   - Log message: "Settings collection initialized"

2. Check for environment variables that map to UI settings:
   - If present, create setting document with environment variable value
   - Log message: "Imported {key} from environment variable"
   - Continue using environment variable (backward compatibility)

3. Application reads settings in order of precedence:
   - Database value (if exists)
   - Environment variable (fallback)
   - Hardcoded default (last resort)

### Existing Deployments (Upgrade Path)

1. On container start, check if `settings` collection exists:
   - If not, run initial setup (above)
   - If exists, check for missing indexes and create them

2. For existing users with environment variables:
   - Application continues to work (environment variables still read)
   - UI shows "Configure in UI" prompt for each env-var-configured setting
   - User can migrate to UI settings at their convenience
   - No data loss or downtime

### Migration Script (optional, for bulk migration)

Provide optional script for administrators to migrate all environment variables to database:

```bash
docker exec cpak /app/scripts/migrate-env-to-db.sh
```

This would:
1. Read all relevant environment variables
2. Create corresponding setting documents
3. Report what was migrated
4. Advise user to remove environment variables from docker-compose

---

## Data Access Patterns

### Read Operations

**Get setting by key**:
```javascript
// Priority: database > env var > default
async function getSetting(key, defaultValue) {
  const dbValue = await Settings.findOne({ key });
  if (dbValue) return decrypt(dbValue.value, dbValue.isSecret);
  
  const envValue = process.env[key.toUpperCase()];
  if (envValue) return envValue;
  
  return defaultValue;
}
```

**Get all settings by category**:
```javascript
async function getSettingsByCategory(category) {
  const settings = await Settings.find({ category });
  return settings.map(s => ({
    key: s.key,
    value: decrypt(s.value, s.isSecret),
    isSecret: s.isSecret,
    updatedAt: s.updatedAt
  }));
}
```

### Write Operations

**Update or create setting**:
```javascript
async function setSetting(key, value, category, isSecret) {
  const encrypted = isSecret ? encrypt(value) : value;
  
  return await Settings.findOneAndUpdate(
    { key },
    {
      key,
      value: encrypted,
      category,
      isSecret,
      updatedAt: new Date(),
      updatedBy: 'system' // or user ID in future
    },
    { upsert: true, new: true }
  );
}
```

**Delete setting** (revert to default):
```javascript
async function deleteSetting(key) {
  return await Settings.deleteOne({ key });
}
```

---

## API Endpoints (New)

### GET /api/settings

Retrieve all settings or filtered by category.

**Query Parameters**:
- `category` (optional): Filter by category

**Response**:
```json
{
  "settings": [
    {
      "key": "steam_api_key",
      "value": "***hidden***",
      "category": "platform_api",
      "isSecret": true,
      "hasValue": true,
      "updatedAt": "2026-02-12T10:30:00Z"
    },
    {
      "key": "scheduler_enabled",
      "value": "true",
      "category": "scheduler",
      "isSecret": false,
      "hasValue": true,
      "updatedAt": "2026-02-12T10:30:00Z"
    }
  ]
}
```

**Note**: Secret values are masked in GET responses (shown as `***hidden***`), but `hasValue: true` indicates a value is set.

### GET /api/settings/:key

Retrieve specific setting value.

**Response**:
```json
{
  "key": "scheduler_cron",
  "value": "0 3 * * *",
  "category": "scheduler",
  "isSecret": false,
  "updatedAt": "2026-02-12T10:30:00Z"
}
```

**Note**: Secret values return `{ hasValue: true }` but not actual value (security).

### PUT /api/settings/:key

Update or create a setting.

**Request Body**:
```json
{
  "value": "new_value_here",
  "category": "platform_api",
  "isSecret": true
}
```

**Response**:
```json
{
  "key": "steam_api_key",
  "hasValue": true,
  "updatedAt": "2026-02-12T10:30:00Z"
}
```

### DELETE /api/settings/:key

Delete a setting (reverts to default or environment variable).

**Response**:
```json
{
  "message": "Setting deleted, will use default value",
  "key": "scheduler_cron"
}
```

---

## Security Considerations

1. **Encryption at Rest**:
   - All `isSecret=true` values encrypted with AES-256-GCM
   - Encryption key from `ENCRYPTION_KEY` environment variable
   - No plaintext secrets in database

2. **API Access Control**:
   - Future: Require authentication for settings endpoints
   - Current: Same security model as existing API endpoints

3. **Audit Trail**:
   - All setting changes logged with timestamp and updatedBy
   - Consider write-only audit log collection for compliance

4. **Secret Handling**:
   - Secret values never returned in API responses
   - Only `hasValue: true/false` indicator returned
   - Secrets only decrypted in backend memory for API calls

---

## Testing Strategy

### Unit Tests
- Settings model CRUD operations
- Encryption/decryption functions
- Precedence logic (DB > env > default)

### Integration Tests
- Settings API endpoints (GET, PUT, DELETE)
- Migration from environment variables
- Secret masking in responses

### End-to-End Tests
- Configure Steam API key via UI
- Verify sync uses UI-configured key
- Update scheduler settings, verify cron runs
- Remove setting via UI, verify fallback to default
