package frontend

import (
	"context"
	"time"

	"github.com/GhsVilela/cpak/backend"
	"github.com/GhsVilela/cpak/templates"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// Server represents the frontend server
type Server struct {
	Echo    *echo.Echo
	Backend *backend.Server
}

// NewServer creates a new frontend server
func NewServer(backendServer *backend.Server) *Server {
	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	// Serve static files
	e.Static("/static", "web/static")

	server := &Server{
		Echo:    e,
		Backend: backendServer,
	}

	// Register routes
	server.registerRoutes()

	return server
}

func (s *Server) registerRoutes() {
	// Main page
	s.Echo.GET("/", s.handleIndex)

	s.Echo.POST("/api/seed", s.handleSeed)
}

// handleIndex renders the main page with achievements
func (s *Server) handleIndex(c echo.Context) error {
	return templates.Index().Render(c.Request().Context(), c.Response().Writer)
}

func (s *Server) handleSeed(c echo.Context) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := s.Backend.DB.FetchAndSeedFromExternalAPI(ctx); err != nil {
		return templates.ErrorMessage("Failed to seed database: "+err.Error()).Render(c.Request().Context(), c.Response().Writer)
	}

	// Fetch and return updated achievements list
	achievements, err := s.Backend.DB.GetAchievements(ctx)
	if err != nil {
		return templates.ErrorMessage("Failed to fetch achievements: "+err.Error()).Render(c.Request().Context(), c.Response().Writer)
	}

	return templates.AchievementsList(achievements).Render(c.Request().Context(), c.Response().Writer)
}

// // registerRoutes sets up all frontend routes
// func (s *Server) registerRoutes() {
// 	// Main page - displays all achievements
// 	s.Echo.GET("/", s.handleIndex)

// 	// HTMX endpoint for seeding database (returns HTML fragment)
// 	s.Echo.POST("/api/seed", s.handleSeed)

// 	// HTMX endpoint for toggling achievement completion (proxy to backend)
// 	s.Echo.PUT("/api/achievements/:id", s.handleToggleAchievement)
// }

// // handleIndex renders the main page with achievements
// func (s *Server) handleIndex(c echo.Context) error {
// 	// Fetch achievements from backend
// 	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
// 	defer cancel()

// 	achievements, err := s.Backend.DB.GetAchievements(ctx)
// 	if err != nil {
// 		log.Printf("Error fetching achievements: %v", err)
// 		achievements = []*backend.Achievement{}
// 	}

// 	// Render the index page
// 	return templates.Index(achievements).Render(c.Request().Context(), c.Response().Writer)
// }

// // handleSeed seeds the database from external API and returns updated list
// func (s *Server) handleSeed(c echo.Context) error {
// 	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
// 	defer cancel()

// 	if err := s.Backend.DB.FetchAndSeedFromExternalAPI(ctx); err != nil {
// 		return templates.ErrorMessage("Failed to seed database: "+err.Error()).Render(c.Request().Context(), c.Response().Writer)
// 	}

// 	// Fetch and return updated achievements list
// 	achievements, err := s.Backend.DB.GetAchievements(ctx)
// 	if err != nil {
// 		return templates.ErrorMessage("Failed to fetch achievements: "+err.Error()).Render(c.Request().Context(), c.Response().Writer)
// 	}

// 	return templates.AchievementsList(achievements).Render(c.Request().Context(), c.Response().Writer)
// }

// // handleToggleAchievement proxies the request to the backend API
// func (s *Server) handleToggleAchievement(c echo.Context) error {
// 	// For now, direct users to use the backend API at :8080
// 	// In a full implementation, this would proxy the request
// 	return c.JSON(http.StatusOK, map[string]string{
// 		"status":  "use backend API",
// 		"message": "Use PUT http://localhost:8080/api/achievements/:id to update achievements",
// 	})
// }

// Start starts the frontend server on the given address
func (s *Server) Start(address string) error {
	return s.Echo.Start(address)
}

// Shutdown gracefully shuts down the frontend server
func (s *Server) Shutdown(ctx context.Context) error {
	return s.Echo.Shutdown(ctx)
}
