//go:build wasm
// +build wasm

package main

import (
	"github.com/GhsVilela/cpak/frontend/app"
	goapp "github.com/maxence-charriere/go-app/v9/pkg/app"
)

func main() {
	// Register the main component
	goapp.Route("/", &app.AchievementApp{})
	goapp.RunWhenOnBrowser()
}
