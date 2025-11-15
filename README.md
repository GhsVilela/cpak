# cpak - Cross Platform Achievement Keeper

A full-stack Go application demonstrating backend API with Echo framework and frontend with go-app.dev.

> **🚀 Quick Start**: Want to get running in 5 minutes? See [QUICKSTART.md](QUICKSTART.md)  
> **🐳 Docker/NAS**: Deploying on TrueNAS Scale or NAS? See [TRUENAS-INSTALL.md](TRUENAS-INSTALL.md)

## Features

- **Backend**: RESTful API built with [Echo](https://echo.labstack.com/)
  - CRUD operations for achievements
  - **MongoDB database** (required) with automatic seeding from external API
  - **Data persistence** - fetches from JSONPlaceholder API on first run, then uses database
  - CORS support for frontend communication
  - Health check endpoint with database status

- **Frontend**: Progressive Web App built with [go-app.dev](https://go-app.dev/)
  - Displays achievements from the backend API
  - Interactive UI with checkbox to mark achievements as completed
  - Responsive design
  - Beautiful gradient styling

### Data Flow

1. **First run**: Application checks if MongoDB is empty
2. **External API**: Fetches sample data from JSONPlaceholder API (real external API)
3. **Transformation**: Converts external data to achievement format
4. **Persistence**: Saves to MongoDB database
5. **Subsequent runs**: Retrieves data directly from MongoDB (no external API calls)

## API Endpoints

- `GET /api/achievements` - Get all achievements (from MongoDB)
- `GET /api/achievements/:id` - Get a specific achievement
- `POST /api/achievements` - Create a new achievement
- `PUT /api/achievements/:id` - Update an achievement
- `DELETE /api/achievements/:id` - Delete an achievement
- `POST /api/seed` - Manually trigger external API fetch and database seeding
- `GET /api/health` - Health check (includes database status)

## Getting Started

Choose your deployment method:

### 🐳 Docker Deployment (Recommended for Production/NAS)

**For NAS users (TrueNAS Scale, etc.) and production deployment**, use Docker:

```bash
docker-compose up -d
```

Then open http://your-server-ip:8081 in your browser.

📘 **Full Docker Guide**: See [DOCKER.md](DOCKER.md) for complete instructions including:
- TrueNAS Scale deployment
- Data backup/restore
- Configuration options
- Troubleshooting

### 💻 Local Development

**Option 1: Dev Container (Recommended for Development)**

Develop without installing Go locally using VS Code Dev Containers:

1. Install [VS Code](https://code.visualstudio.com/) and [Docker](https://www.docker.com/products/docker-desktop)
2. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
3. Open the project in VS Code
4. Press `F1` → "Dev Containers: Reopen in Container"
5. Everything is pre-configured! Start coding immediately.

See [.devcontainer/README.md](.devcontainer/README.md) for details.

**Option 2: Local Installation**

For development or testing without Docker:

#### Prerequisites

- Go 1.21 or higher
- MongoDB (required)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/GhsVilela/cpak.git
cd cpak
```

2. Install dependencies:
```bash
go mod download
```

3. Build the application:

```bash
chmod +x build.sh
./build.sh
```

**Or manual build:**
```bash
# Build frontend WASM
GOARCH=wasm GOOS=js go build -o web/app.wasm ./frontend

# Build main application
go build -o cpak main.go
```

### Running the Application

**MongoDB is required**

1. Start MongoDB using Docker:
```bash
docker-compose up -d mongodb
```

2. Run the application:
```bash
./run-with-mongo.sh
```

OR set the MongoDB URI manually:
```bash
export MONGODB_URI="mongodb://localhost:27017"
./cpak
```

This will start:
- Backend API server on `http://localhost:8080`
- Frontend server on `http://localhost:8081`

Open your browser and navigate to `http://localhost:8081` to see the application.

**First Run:**
- Application automatically fetches data from JSONPlaceholder API
- Transforms and saves to MongoDB
- Shows ~10 sample achievements

**Subsequent Runs:**
- Data is retrieved from MongoDB (no external API calls)
- Fast and efficient

### Development

The application consists of two main parts:

1. **Backend (Echo)**: RESTful API server located in `/backend`
2. **Frontend (go-app.dev)**: Progressive Web App located in `/frontend`

When making changes:
- Modify backend code in `/backend/server.go`
- Modify frontend code in `/frontend/app/`
- Rebuild using `./build.sh` or the manual build steps
- Restart the application

### Testing the API

You can test the API endpoints using curl:

```bash
# Get all achievements (from MongoDB)
curl http://localhost:8080/api/achievements

# Get a specific achievement
curl http://localhost:8080/api/achievements/1

# Create a new achievement
curl -X POST http://localhost:8080/api/achievements \
  -H "Content-Type: application/json" \
  -d '{"title":"Master","description":"Complete all tasks","points":100,"completed":false}'

# Update an achievement
curl -X PUT http://localhost:8080/api/achievements/1 \
  -H "Content-Type: application/json" \
  -d '{"title":"First Steps","description":"Complete your first task","points":10,"completed":true}'

# Delete an achievement
curl -X DELETE http://localhost:8080/api/achievements/3

# Manually trigger external API seeding
curl -X POST http://localhost:8080/api/seed

# Check health (includes database status)
curl http://localhost:8080/api/health
```

## Project Structure

```
cpak/
├── backend/
│   └── server.go           # Echo backend server with API endpoints
├── frontend/
│   └── app/
│       └── app.go          # go-app.dev frontend components
├── web/
│   └── static/
│       ├── styles.css      # CSS styling
│       └── icon.png        # App icon
├── main.go                 # Application entry point
├── go.mod                  # Go module dependencies
└── README.md              # This file
```

## Technologies Used

- **Backend**: [Echo v4](https://echo.labstack.com/) - High performance, extensible, minimalist Go web framework
- **Database**: [MongoDB](https://www.mongodb.com/) - Document database for data persistence
- **External API**: [JSONPlaceholder](https://jsonplaceholder.typicode.com/) - Fake REST API for testing and prototyping
- **Frontend**: [go-app.dev v9](https://go-app.dev/) - A package to build progressive web apps (PWA) with Go programming language and WebAssembly
- **Language**: Go 1.21+
- **Containerization**: Docker & Docker Compose for MongoDB

## CI/CD

The project includes a GitHub Actions workflow that automatically builds the project on every push and pull request. The workflow:

- Sets up Go 1.21
- Downloads and verifies dependencies
- Builds both the frontend WASM and backend binary
- Runs tests (if available)
- Uploads build artifacts

You can view the build status and download artifacts from the Actions tab in the GitHub repository.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
