//go:build !wasm
// +build !wasm

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
	"github.com/maxence-charriere/go-app/v9/pkg/app"
)

func main() {
	// Get MongoDB URI from environment variable or use default
	mongoURI := os.Getenv("MONGODB_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017"
		log.Printf("MONGODB_URI not set, using default: %s", mongoURI)
	}

	// Start backend API server with MongoDB
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

	go func() {
		log.Println("Starting backend API server on :8080")
		if err := backendServer.Start(":8080"); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Backend server failed: %v", err)
		}
	}()

	// Give backend a moment to start
	time.Sleep(500 * time.Millisecond)

	// Configure the go-app handler with proper resource configuration
	// The handler will serve the PWA and look for resources in the "web" directory
	handler := &app.Handler{
		Name:        "Achievement Keeper",
		Description: "Cross Platform Achievement Keeper",
		RawHeaders: []string{
			`<meta name="viewport" content="width=device-width, initial-scale=1">`,
		},
		Styles: []string{
			"/web/static/styles.css",
		},
		Icon: app.Icon{
			Default: "/web/static/icon.png",
		},
		// LocalDir points to where app.wasm is located
		Resources: app.LocalDir("web"),
	}

	frontendServer := &http.Server{
		Addr:    ":8081",
		Handler: handler,
	}

	// Start frontend server in a goroutine
	go func() {
		log.Println("Starting frontend server on :8081")
		log.Println("Open http://localhost:8081 in your browser")
		if err := frontendServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
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
