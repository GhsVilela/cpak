package backend

import (
	"net/http"
	"strconv"
	"sync"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// Achievement represents a gaming achievement
type Achievement struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Points      int    `json:"points"`
	Completed   bool   `json:"completed"`
}

// Store is a simple in-memory store for achievements
type Store struct {
	achievements map[int]*Achievement
	nextID       int
	mu           sync.RWMutex
}

// NewStore creates a new achievement store
func NewStore() *Store {
	store := &Store{
		achievements: make(map[int]*Achievement),
		nextID:       1,
	}
	// Add some sample data
	store.achievements[1] = &Achievement{
		ID:          1,
		Title:       "First Steps",
		Description: "Complete your first task",
		Points:      10,
		Completed:   true,
	}
	store.achievements[2] = &Achievement{
		ID:          2,
		Title:       "Getting Started",
		Description: "Create your profile",
		Points:      5,
		Completed:   true,
	}
	store.achievements[3] = &Achievement{
		ID:          3,
		Title:       "Power User",
		Description: "Complete 10 tasks",
		Points:      50,
		Completed:   false,
	}
	store.nextID = 4
	return store
}

// Server wraps the Echo server and store
type Server struct {
	Echo  *echo.Echo
	Store *Store
}

// NewServer creates a new backend server
func NewServer() *Server {
	e := echo.New()
	store := NewStore()

	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	s := &Server{
		Echo:  e,
		Store: store,
	}

	// Routes
	e.GET("/api/achievements", s.getAchievements)
	e.GET("/api/achievements/:id", s.getAchievement)
	e.POST("/api/achievements", s.createAchievement)
	e.PUT("/api/achievements/:id", s.updateAchievement)
	e.DELETE("/api/achievements/:id", s.deleteAchievement)
	e.GET("/api/health", s.healthCheck)

	return s
}

// Handler functions

func (s *Server) healthCheck(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status": "healthy",
	})
}

func (s *Server) getAchievements(c echo.Context) error {
	s.Store.mu.RLock()
	defer s.Store.mu.RUnlock()

	achievements := make([]*Achievement, 0, len(s.Store.achievements))
	for _, a := range s.Store.achievements {
		achievements = append(achievements, a)
	}

	return c.JSON(http.StatusOK, achievements)
}

func (s *Server) getAchievement(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid ID"})
	}

	s.Store.mu.RLock()
	defer s.Store.mu.RUnlock()

	achievement, exists := s.Store.achievements[id]
	if !exists {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "achievement not found"})
	}

	return c.JSON(http.StatusOK, achievement)
}

func (s *Server) createAchievement(c echo.Context) error {
	var achievement Achievement
	if err := c.Bind(&achievement); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	s.Store.mu.Lock()
	defer s.Store.mu.Unlock()

	achievement.ID = s.Store.nextID
	s.Store.nextID++
	s.Store.achievements[achievement.ID] = &achievement

	return c.JSON(http.StatusCreated, achievement)
}

func (s *Server) updateAchievement(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid ID"})
	}

	var achievement Achievement
	if err := c.Bind(&achievement); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	s.Store.mu.Lock()
	defer s.Store.mu.Unlock()

	if _, exists := s.Store.achievements[id]; !exists {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "achievement not found"})
	}

	achievement.ID = id
	s.Store.achievements[id] = &achievement

	return c.JSON(http.StatusOK, achievement)
}

func (s *Server) deleteAchievement(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid ID"})
	}

	s.Store.mu.Lock()
	defer s.Store.mu.Unlock()

	if _, exists := s.Store.achievements[id]; !exists {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "achievement not found"})
	}

	delete(s.Store.achievements, id)

	return c.NoContent(http.StatusNoContent)
}

// Start starts the server on the specified address
func (s *Server) Start(address string) error {
	return s.Echo.Start(address)
}
