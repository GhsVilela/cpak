package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/GhsVilela/cpak/backend"
	"github.com/GhsVilela/cpak/templates"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	// Get MongoDB URI from environment variable or use default
	mongoURI := os.Getenv("MONGODB_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017"
		log.Printf("MONGODB_URI not set, using default: %s", mongoURI)
	}

	// Create backend server with MongoDB
	backendServer, err := backend.NewServer(mongoURI)
	if err != nil {
		log.Fatalf("Failed to create backend server: %v", err)
	}

	// Initialize database (seed if empty)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	if err := backendServer.InitializeDatabase(ctx); err != nil {
		log.Printf("Warning: Failed to initialize database: %v", err)
		log.Println("Database may be empty. Use POST /api/seed to populate from external API")
	}
	cancel()

	// Start backend API server in goroutine
	go func() {
		log.Println("Starting backend API server on :8080")
		if err := backendServer.Start(":8080"); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Backend server failed: %v", err)
		}
	}()

	// Give backend a moment to start
	time.Sleep(500 * time.Millisecond)

	// Create frontend server with Templ + HTMX
	frontendServer := echo.New()
	frontendServer.Use(middleware.Logger())
	frontendServer.Use(middleware.Recover())

	// Serve static files
	frontendServer.Static("/static", "web/static")

	// Frontend routes
	frontendServer.GET("/", func(c echo.Context) error {
		// Fetch achievements from backend
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		achievements, err := backendServer.DB.GetAchievements(ctx)
		if err != nil {
			log.Printf("Error fetching achievements: %v", err)
			achievements = []*backend.Achievement{}
		}

		// Render the index page
		return templates.Index(achievements).Render(c.Request().Context(), c.Response().Writer)
	})

	// HTMX endpoint for seeding (returns HTML fragment)
	frontendServer.POST("/api/seed", func(c echo.Context) error {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := backendServer.DB.FetchAndSeedFromExternalAPI(ctx); err != nil {
			return templates.ErrorMessage("Failed to seed database: " + err.Error()).Render(c.Request().Context(), c.Response().Writer)
		}

		// Fetch and return updated achievements list
		achievements, err := backendServer.DB.GetAchievements(ctx)
		if err != nil {
			return templates.ErrorMessage("Failed to fetch achievements: " + err.Error()).Render(c.Request().Context(), c.Response().Writer)
		}

		return templates.AchievementsList(achievements).Render(c.Request().Context(), c.Response().Writer)
	})

	// HTMX endpoint for toggling completion (returns updated card)
	frontendServer.PUT("/api/achievements/:id", func(c echo.Context) error {
		// This endpoint is handled by the backend server on port 8080
		// But we'll add a proxy for HTMX to work seamlessly
		return c.JSON(http.StatusOK, map[string]string{"status": "use backend API at :8080"})
	})

	// Start frontend server in a goroutine
	go func() {
		log.Println("Starting frontend server on :8081")
		log.Println("Open http://localhost:8081 in your browser")
		if err := frontendServer.Start(":8081"); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Frontend server failed: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the servers
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt)
	<-quit

	log.Println("Shutting down servers...")

	// Graceful shutdown
	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := frontendServer.Shutdown(ctx); err != nil {
		log.Printf("Frontend server shutdown error: %v", err)
	}

	if err := backendServer.Shutdown(ctx); err != nil {
		log.Printf("Backend server shutdown error: %v", err)
	}

	fmt.Println("Servers stopped")
}
