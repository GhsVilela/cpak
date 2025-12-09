package backend

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// Achievement represents a gaming achievement
// type Achievement struct {
// 	ID          int    `json:"id"`
// 	Title       string `json:"title"`
// 	Description string `json:"description"`
// 	Points      int    `json:"points"`
// 	Completed   bool   `json:"completed"`
// }

// Server wraps the Echo server with MongoDB database
type Server struct {
	Echo *echo.Echo
	DB   *Database
}

// NewServer creates a new backend server with database
func NewServer(mongoURI string) (*Server, error) {
	e := echo.New()

	// Connect to database
	db, err := NewDatabase(mongoURI)
	if err != nil {
		return nil, err
	}

	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	s := &Server{
		Echo: e,
		DB:   db,
	}

	// Routes
	e.GET("/api/steam/played-games", s.GetPlayedGames)
	// e.GET("/api/achievements/:id", s.getAchievement)
	// e.POST("/api/achievements", s.createAchievement)
	// e.PUT("/api/achievements/:id", s.updateAchievement)
	// e.DELETE("/api/achievements/:id", s.deleteAchievement)
	e.HEAD("/api/health", s.healthCheck)
	// e.POST("/api/seed", s.seedFromExternalAPI)

	return s, nil
}

// InitializeDatabase checks if database is empty and seeds it if needed
// func (s *Server) InitializeDatabase(ctx context.Context) error {
// 	count, err := s.DB.CountAchievements(ctx)
// 	if err != nil {
// 		return err
// 	}

// 	if count == 0 {
// 		return s.DB.FetchAndSeedFromExternalAPI(ctx)
// 	}

// 	return nil
// }

// Handler functions

func (s *Server) healthCheck(c echo.Context) error {
	// Check database connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := s.DB.client.Ping(ctx, nil)
	status := "healthy"
	if err != nil {
		status = "unhealthy"
	}

	return c.JSON(http.StatusOK, map[string]string{
		"status":   status,
		"database": "mongodb",
	})
}

func (s *Server) getAchievements(c echo.Context) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	achievements, err := s.DB.GetAchievements(ctx)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusOK, achievements)
}

func (s *Server) getAchievement(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	achievement, err := s.DB.GetAchievement(ctx, id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	if achievement == nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "achievement not found"})
	}

	return c.JSON(http.StatusOK, achievement)
}

// func (s *Server) createAchievement(c echo.Context) error {
// 	var achievement Achievement
// 	if err := c.Bind(&achievement); err != nil {
// 		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
// 	}

// 	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
// 	defer cancel()

// 	// Get the next ID
// 	count, err := s.DB.CountAchievements(ctx)
// 	if err != nil {
// 		return c.JSON(http.StatusInternalServerError, map[string]string{
// 			"error": err.Error(),
// 		})
// 	}
// 	achievement.ID = int(count) + 1

// 	if err := s.DB.CreateAchievement(ctx, &achievement); err != nil {
// 		return c.JSON(http.StatusInternalServerError, map[string]string{
// 			"error": err.Error(),
// 		})
// 	}

// 	return c.JSON(http.StatusCreated, achievement)
// }

// func (s *Server) updateAchievement(c echo.Context) error {
// 	id, err := strconv.Atoi(c.Param("id"))
// 	if err != nil {
// 		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid ID"})
// 	}

// 	var achievement Achievement
// 	if err := c.Bind(&achievement); err != nil {
// 		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
// 	}

// 	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
// 	defer cancel()

// 	achievement.ID = id
// 	if err := s.DB.UpdateAchievement(ctx, id, &achievement); err != nil {
// 		if err.Error() == "achievement not found" {
// 			return c.JSON(http.StatusNotFound, map[string]string{"error": "achievement not found"})
// 		}
// 		return c.JSON(http.StatusInternalServerError, map[string]string{
// 			"error": err.Error(),
// 		})
// 	}

// 	return c.JSON(http.StatusOK, achievement)
// }

func (s *Server) deleteAchievement(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := s.DB.DeleteAchievement(ctx, id); err != nil {
		if err.Error() == "achievement not found" {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "achievement not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	return c.NoContent(http.StatusNoContent)
}

// func (s *Server) seedFromExternalAPI(c echo.Context) error {
// 	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
// 	defer cancel()

// 	if err := s.DB.FetchAndSeedFromExternalAPI(ctx); err != nil {
// 		return c.JSON(http.StatusInternalServerError, map[string]string{
// 			"error": err.Error(),
// 		})
// 	}

// 	return c.JSON(http.StatusOK, map[string]string{
// 		"message": "Successfully seeded database from external API",
// 	})
// }

// Start starts the server on the specified address
func (s *Server) Start(address string) error {
	return s.Echo.Start(address)
}

// Shutdown gracefully shuts down the server and closes database connection
func (s *Server) Shutdown(ctx context.Context) error {
	// Close database connection
	if err := s.DB.Close(ctx); err != nil {
		return err
	}

	// Shutdown Echo server
	return s.Echo.Shutdown(ctx)
}
