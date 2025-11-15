# Development Container Setup

This directory contains the configuration for developing the CPAK project in a containerized environment using VS Code Dev Containers.

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop) installed and running
- [Visual Studio Code](https://code.visualstudio.com/) installed
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) installed in VS Code

## Getting Started

1. **Open the project in VS Code**
   ```bash
   code /path/to/cpak
   ```

2. **Open in Container**
   - Press `F1` or `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Dev Containers: Reopen in Container"
   - Select the command and wait for the container to build

3. **The container will automatically:**
   - Install Go 1.21
   - Install all Go development tools (gopls, delve, staticcheck, goimports)
   - Download project dependencies
   - Start MongoDB on port 27017
   - Forward ports 8080 (API), 8081 (UI), and 27017 (MongoDB)

## What's Included

### Development Environment
- Go 1.21 with all standard tools
- Git, curl, wget, vim, nano
- Docker CLI (for running docker compose commands)
- VS Code extensions:
  - Go language support
  - Docker support
  - MongoDB support
  - Prettier for formatting
  - Code spell checker

### Services
- **MongoDB**: Automatically started and accessible at `localhost:27017`
- **Data Persistence**: MongoDB data is persisted in a Docker volume

## Working in the Dev Container

### Building the Project
```bash
# Build both frontend and backend
./build.sh

# Or build separately
GOARCH=wasm GOOS=js go build -o web/app.wasm ./frontend
go build -o cpak main.go
```

### Running the Application
```bash
# Run locally (MongoDB already running in container)
./cpak

# Or use docker compose for full stack
docker compose up -d
```

### Access Points
- Frontend: http://localhost:8081
- Backend API: http://localhost:8080
- MongoDB: mongodb://localhost:27017

### Debugging
The devcontainer includes Delve debugger. You can:
- Set breakpoints in VS Code
- Use the Run and Debug panel (F5)
- Debug both backend and WASM builds

## Environment Variables

The container automatically sets:
- `MONGODB_URI=mongodb://mongodb:27017`
- `GOPATH=/home/vscode/go`

You can modify these in `.devcontainer/devcontainer.json` if needed.

## Customization

### Adding VS Code Extensions
Edit `.devcontainer/devcontainer.json` and add extension IDs to the `extensions` array.

### Changing Go Version
Edit `.devcontainer/Dockerfile` and change the base image version:
```dockerfile
FROM golang:1.22  # Change version here
```

### Adding System Packages
Edit `.devcontainer/Dockerfile` and add packages to the `apt-get install` command.

## Troubleshooting

### Container won't start
- Check Docker is running
- Check Docker has enough resources (CPU, memory, disk)
- Try rebuilding: `Dev Containers: Rebuild Container`

### MongoDB connection issues
- MongoDB runs in the same network as the devcontainer
- Use `mongodb://localhost:27017` or `mongodb://mongodb:27017`

### Port conflicts
- Check ports 8080, 8081, and 27017 are not in use
- Modify port mappings in `docker-compose.yml` if needed

## Benefits

✅ **No local Go installation required**  
✅ **Consistent development environment**  
✅ **MongoDB included and pre-configured**  
✅ **All tools pre-installed**  
✅ **Works on Windows, Mac, and Linux**  
✅ **Easy onboarding for new developers**
