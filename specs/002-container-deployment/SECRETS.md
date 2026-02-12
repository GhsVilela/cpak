# Repository Secrets Configuration

This document describes the secrets required for automated container image releases.

## Required Secrets for GitHub Actions

### Docker Hub Authentication

**Secret Name**: `DOCKERHUB_USERNAME`
- **Description**: Your Docker Hub username
- **How to get**: Your Docker Hub account username (e.g., `ghsvilela`)
- **Required for**: Publishing images to Docker Hub registry

**Secret Name**: `DOCKERHUB_TOKEN`
- **Description**: Docker Hub access token (NOT your password)
- **How to create**:
  1. Log in to [Docker Hub](https://hub.docker.com/)
  2. Go to Account Settings → Security
  3. Click "New Access Token"
  4. Name it (e.g., "GitHub Actions")
  5. Copy the token (you won't see it again)
- **Required for**: Authenticating with Docker Hub for image push

### GitHub Container Registry Authentication

**Secret Name**: `GITHUB_TOKEN`
- **Description**: GitHub automatically provides this token
- **How to get**: No setup needed - automatically available in workflows
- **Required for**: Publishing images to GitHub Container Registry (ghcr.io)

## Setting Up Secrets

### Repository Secrets (Recommended)

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each required secret:
   - Name: `DOCKERHUB_USERNAME` → Value: Your Docker Hub username
   - Name: `DOCKERHUB_TOKEN` → Value: Your Docker Hub access token

### Organization Secrets (For Multiple Repos)

If you manage multiple repositories:

1. Go to your GitHub organization settings
2. Click **Secrets and variables** → **Actions**
3. Click **New organization secret**
4. Add secrets and select which repositories can access them

## Security Best Practices

### Access Token Permissions

Docker Hub tokens should have **minimum required permissions**:
- ✅ Read, Write (for pushing images)
- ❌ Delete (not needed)

### Token Rotation

Rotate access tokens periodically:
- **Recommended frequency**: Every 90 days
- **After rotation**: Update the GitHub secret with new token

### Token Revocation

If a token is compromised:
1. Revoke it immediately in Docker Hub settings
2. Generate a new token
3. Update the GitHub secret

## Verifying Setup

### Test the Release Workflow

After configuring secrets, test the workflow:

```bash
# Create a test tag
git tag v0.1.0-test
git push origin v0.1.0-test

# Monitor workflow execution
# Go to: GitHub repository → Actions tab
# Check the "Release" workflow run
```

### Expected Outcomes

✅ Workflow completes successfully
✅ Image published to Docker Hub: `ghsvilela/cpak:0.1.0-test`
✅ Image published to GHCR: `ghcr.io/ghsvilela/cpak:0.1.0-test`
✅ GitHub Release created with release notes

### Troubleshooting

**Error**: `denied: requested access to the resource is denied`
- **Cause**: Invalid Docker Hub credentials
- **Fix**: Verify `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are correct

**Error**: `authorization failed`
- **Cause**: Token permissions insufficient
- **Fix**: Ensure token has Read & Write permissions

**Error**: `GITHUB_TOKEN` permissions denied
- **Cause**: Workflow permissions not configured
- **Fix**: Verify workflow has `contents: write` and `packages: write` permissions

## Workflow Trigger Pattern

The release workflow triggers on **semantic version tags** (including pre-releases):

### Valid Tags (Triggers workflow)
- `v1.0.0` (stable release)
- `v2.5.13` (stable release)
- `v10.99.999` (stable release)
- `v1.0.0-beta` (beta pre-release)
- `v1.0.0-rc1` (release candidate)
- `v1.0.0-alpha.1` (alpha pre-release)

### Invalid Tags (Does NOT trigger)
- `1.0.0` (missing 'v' prefix)
- `release-1.0.0` (wrong format)
- `v1.0` (incomplete version)

### Creating a Production Release

```bash
# Create semantic version tag (stable)
git tag v1.0.0

# Or create a pre-release tag
git tag v1.0.0-beta

# Push tag to trigger release
git push origin v1.0.0

# Workflow will:
# 1. Build unified container image
# 2. Push to Docker Hub and GHCR
# 3. Create GitHub Release with notes
```

## Registry URLs

After successful release, images are available at:

**Docker Hub:**
```
docker pull ghsvilela/cpak:latest
docker pull ghsvilela/cpak:1.0.0
docker pull ghsvilela/cpak:1.0
docker pull ghsvilela/cpak:1
```

**GitHub Container Registry:**
```
docker pull ghcr.io/ghsvilela/cpak:latest
docker pull ghcr.io/ghsvilela/cpak:1.0.0
docker pull ghcr.io/ghsvilela/cpak:1.0
docker pull ghcr.io/ghsvilela/cpak:1
```

## Support

For issues with:
- **Docker Hub tokens**: [Docker Hub Support](https://hub.docker.com/support)
- **GitHub secrets**: [GitHub Docs - Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- **Workflow failures**: Check the Actions tab in your repository
