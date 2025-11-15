# cpak - Cross Platform Achievement Keeper

A full-stack Go application demonstrating backend API with Echo framework and frontend with go-app.dev.

## Features

- **Backend**: RESTful API built with [Echo](https://echo.labstack.com/)
  - CRUD operations for achievements
  - In-memory data store
  - CORS support for frontend communication
  - Health check endpoint

- **Frontend**: Progressive Web App built with [go-app.dev](https://go-app.dev/)
  - Displays achievements from the backend API
  - Interactive UI with checkbox to mark achievements as completed
  - Responsive design
  - Beautiful gradient styling

## API Endpoints

- `GET /api/achievements` - Get all achievements
- `GET /api/achievements/:id` - Get a specific achievement
- `POST /api/achievements` - Create a new achievement
- `PUT /api/achievements/:id` - Update an achievement
- `DELETE /api/achievements/:id` - Delete an achievement
- `GET /api/health` - Health check

## Getting Started

### Prerequisites

- Go 1.21 or higher

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
go build -o cpak .
```

### Running the Application

Run the application:
```bash
./cpak
```

This will start:
- Backend API server on `http://localhost:8080`
- Frontend server on `http://localhost:8081`

Open your browser and navigate to `http://localhost:8081` to see the application.

### Testing the API

You can test the API endpoints using curl:

```bash
# Get all achievements
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
- **Frontend**: [go-app.dev v9](https://go-app.dev/) - A package to build progressive web apps (PWA) with Go programming language and WebAssembly
- **Language**: Go 1.21+

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
