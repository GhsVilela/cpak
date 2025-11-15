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
	// Configure the go-app handler
	handler := &app.Handler{
		Name:        "Achievement Keeper",
		Description: "Cross Platform Achievement Keeper",
		Styles: []string{
			"/web/static/styles.css",
		},
		Icon: app.Icon{
			Default: "/web/static/icon.png",
		},
	}

	// Start backend API server in a goroutine
	backendServer := backend.NewServer()
	go func() {
		log.Println("Starting backend API server on :8080")
		if err := backendServer.Start(":8080"); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Backend server failed: %v", err)
		}
	}()

	// Give backend a moment to start
	time.Sleep(500 * time.Millisecond)

	// Create frontend server
	frontendMux := http.NewServeMux()
	
	// Serve static files
	frontendMux.Handle("/web/", http.StripPrefix("/web/", http.FileServer(http.Dir("web"))))
	
	// Serve the go-app PWA
	frontendMux.Handle("/", handler)

	frontendServer := &http.Server{
		Addr:    ":8081",
		Handler: frontendMux,
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := frontendServer.Shutdown(ctx); err != nil {
		log.Printf("Frontend server shutdown error: %v", err)
	}

	if err := backendServer.Echo.Shutdown(ctx); err != nil {
		log.Printf("Backend server shutdown error: %v", err)
	}

	fmt.Println("Servers stopped")
}
