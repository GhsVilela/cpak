# Feature Specification: Containerization Improvements for Self-Hosted Deployment

**Feature Branch**: `002-container-deployment`  
**Created**: February 12, 2026  
**Status**: Draft  
**Input**: User description: "Clean up and improve things related with containerization, to be ready for truenas deployment for example but there is no need to focus on truenas or create specific docs for it, it's just an example, the idea will be to have a single image built with all dependencies so that is easy to be deployed on a self hosted environment and also do some clean up of not used or not need environments variables since they can be configured on the UI and we also need a release.yml on github that will build and push this image to be publicity available, the release should automatically be generated on a tag push."

## Clarifications

### Session 2026-02-12

- Q: Should MongoDB be included in the unified container image or required as a separate external service? → A: Provide both options - default includes MongoDB bundled in the image for simplicity, but support external database mode via configuration flag for advanced deployments
- Q: Which container registry should be used for publishing public images? → A: Publish to both Docker Hub and GitHub Container Registry for maximum availability and user choice
- Q: Should database data and application data use a single volume or separate volumes? → A: Configurable - default single volume for simplicity, but allow splitting into separate volumes via configuration for advanced users
- Q: Should all git tags trigger releases or only specific tag patterns? → A: Only semantic version tags (v*.*.*) trigger releases to prevent accidental releases and follow standard conventions
- Q: How should sensitive UI-configured settings be protected in the database? → A: Encryption already implemented - ENCRYPTION_KEY environment variable at deployment enables encryption; without it a fixed default key is used (weak encryption); encryption key itself is not UI-configurable as it's essential deployment-time configuration
- Q: Should all git tags trigger releases or only specific tag patterns? → A: Only semantic version tags (v*.*.*) trigger releases to prevent accidental releases and follow standard conventions
- Q: Should all git tags trigger releases or only specific tag patterns? → A: Only semantic version tags (v*.*.*) trigger releases to prevent accidental releases and follow standard conventions

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deploy Application with Single Container (Priority: P1)

A system administrator wants to deploy the CPAK application on their self-hosted environment (such as TrueNAS, Portainer, or any container platform) using a single, publicly-available container image that includes all necessary dependencies.

**Why this priority**: This is the core deliverable that enables easy deployment and reduces complexity. Without a unified image, deployment requires orchestrating multiple containers and managing dependencies manually, increasing failure points and setup time.

**Independent Test**: Can be fully tested by pulling the public image and running it with minimal configuration (database connection and volume mounts only), then accessing the application UI and verifying all features work correctly.

**Acceptance Scenarios**:

1. **Given** a clean container environment, **When** the administrator pulls the public container image, **Then** a single image containing frontend, backend, web server, and bundled database is available
2. **Given** the unified container image in default mode, **When** the administrator starts it with single data volume mounted, **Then** the application starts with bundled database storing all data (database + images) in organized subdirectories
3. **Given** the unified container image with separate volumes configured, **When** the administrator mounts distinct volumes for database and application data, **Then** the application uses the separate volumes appropriately
4. **Given** the unified container image in external database mode, **When** the administrator starts it with external database connection string, **Then** the application connects to the external database and starts successfully
5. **Given** the application is running, **When** the administrator accesses the UI, **Then** all features (game library sync, profile management, settings) work without additional service configuration
6. **Given** the application needs updates, **When** the administrator pulls the latest image and restarts the container, **Then** the application updates seamlessly while preserving data

---

### User Story 2 - Automated Release Publishing (Priority: P2)

A project maintainer wants to create and publish a new release by simply pushing a version tag to the repository, triggering automatic image building and publishing to a public registry.

**Why this priority**: Automating releases ensures consistency, reduces manual errors, and makes new versions immediately available to users. This is foundational for maintaining the project but secondary to having a deployable image.

**Independent Test**: Can be fully tested by pushing a test tag to the repository and verifying that the automated workflow builds, tests, and publishes the image to the public registry with the correct version tag.

**Acceptance Scenarios**:

1. **Given** changes are merged to the main branch, **When** a maintainer creates and pushes a semantic version tag (e.g., v1.0.0, v2.3.1), **Then** an automated workflow is triggered
2. **Given** a non-semantic version tag is pushed (e.g., test-tag, experimental), **When** checking the workflow status, **Then** no release workflow is triggered
3. **Given** the automated workflow runs, **When** the build completes successfully, **Then** the container image is tagged with the version number and published to both Docker Hub and GitHub Container Registry
3. **Given** the image is published, **When** users check either registry, **Then** the new version is available for download with appropriate metadata (version, release notes link, timestamp)
4. **Given** the build fails, **When** reviewing the workflow, **Then** clear error messages indicate the failure reason and no incomplete image is published

---

### User Story 3 - Simplified Configuration via UI (Priority: P3)

A user wants to configure application settings (API keys, sync schedules, directory paths) through the web UI instead of managing environment variables, reducing deployment complexity and configuration errors.

**Why this priority**: Improves user experience and reduces technical barriers, but the application can function with environment variable configuration initially. This is an enhancement that complements the deployment simplification.

**Independent Test**: Can be fully tested by deploying the application without optional environment variables, configuring settings through the UI, and verifying the settings persist and function correctly.

**Acceptance Scenarios**:

1. **Given** the application is deployed with only essential configuration, **When** the user accesses the settings page, **Then** all configurable options (API keys, sync settings, paths) are available in the UI
2. **Given** the user wants to add platform credentials, **When** they enter Steam/Xbox/PlayStation API keys in the settings UI, **Then** the credentials are securely stored and used for API calls without requiring container restart
3. **Given** the user modifies sync scheduler settings, **When** they save changes in the UI, **Then** the scheduler behavior updates immediately without environment variable changes
4. **Given** settings are configured via UI, **When** the container restarts, **Then** all UI-configured settings persist correctly

---

### Edge Cases

- What happens when a user deploys with both environment variables and UI configuration for the same setting? (Precedence rules needed)
- How does the system handle missing database connection during container startup?
- What happens when the data volume is not properly mounted?
- How does the automated release handle failed builds or test failures?
- What happens when a tag is deleted or force-updated during release process?
- How does the system handle database migrations during version upgrades?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a single unified container image that includes web server, frontend application, backend API, and bundled database (MongoDB) by default
- **FR-001a**: System MUST support external database mode that disables the bundled database and connects to a user-provided database connection string
- **FR-002**: System MUST use a single data volume by default for all persistent data (database + application data) with organized subdirectories
- **FR-002a**: System MUST support separate volume configuration for database and application data when advanced users require isolation
- **FR-002b**: System MUST require external database connection string when external database mode is enabled
- **FR-003**: System MUST allow all platform API keys, sync settings, and optional configurations (excluding encryption key) to be set through the web UI
- **FR-003a**: System MUST encrypt sensitive data (API keys, credentials) stored in the database using the encryption key provided at deployment time
- **FR-003b**: System MUST use a deployment-time ENCRYPTION_KEY environment variable for securing sensitive settings; if not provided, system MUST use a default key with clear warning about reduced security
- **FR-004**: System MUST persist UI-configured settings across container restarts
- **FR-005**: System MUST publish container images to both Docker Hub and GitHub Container Registry (ghcr.io) for maximum availability
- **FR-006**: System MUST automatically build and publish releases only when semantic version tags (matching pattern v*.*.*) are pushed to the repository
- **FR-007**: System MUST tag published images with semantic version numbers matching the git tag
- **FR-008**: System MUST include database connection health checks in the container startup process
- **FR-009**: System MUST provide clear error messages when essential configuration is missing or invalid
- **FR-010**: System MUST handle database schema migrations automatically during version upgrades
- **FR-011**: System MUST validate that data volumes are properly mounted and writable before accepting user requests
- **FR-012**: Settings configured via UI MUST take precedence over environment variables when both are present (excluding essential deployment-time settings: database connection, encryption key, volume paths)
- **FR-013**: System MUST organize data within single volume mode using clear subdirectories (e.g., /data/db for database, /data/images for application files)

### Key Entities

- **Container Image**: A unified, self-contained deployment artifact that includes all application components (web server, frontend, backend) and dependencies, versioned and publicly accessible
- **Release Tag**: A semantic version identifier (e.g., v1.2.3) that triggers automated build and publish workflows
- **Configuration Setting**: A user-defined value for application behavior (API keys, sync schedules, paths) that can be managed through the UI and persists in the database
- **Environment Variable**: A deployment-time configuration value, now limited to essential infrastructure settings (database connection, encryption key for secure storage, volume paths)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Deployment time reduced from multiple manual steps to under 5 minutes for first-time setup
- **SC-002**: Number of required environment variables reduced by at least 80% (from ~15 to ≤3 essential variables: database config, encryption key, data volume)
- **SC-003**: Users can successfully deploy the application without editing configuration files or docker-compose definitions
- **SC-004**: Automated release workflow completes within 15 minutes of tag push and publishes image without manual intervention
- **SC-005**: 100% of optional configuration settings are manageable through the web UI
- **SC-006**: Container image size is optimized to be under 500MB for efficient distribution
- **SC-007**: Application startup time remains under 30 seconds after containerization changes
- **SC-008**: Zero configuration-related support requests from users deploying the unified image
