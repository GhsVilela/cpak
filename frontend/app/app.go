package app

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/maxence-charriere/go-app/v9/pkg/app"
)

// Achievement represents a gaming achievement from the API
type Achievement struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Points      int    `json:"points"`
	Completed   bool   `json:"completed"`
}

// AchievementApp is the main app component
type AchievementApp struct {
	app.Compo
	achievements []Achievement
	loading      bool
	error        string
	apiURL       string
}

// OnMount is called when the component is mounted
func (a *AchievementApp) OnMount(ctx app.Context) {
	// Set API URL - use relative path when running on same server
	// or configure based on environment
	a.apiURL = "http://localhost:8080/api/achievements"
	a.loadAchievements(ctx)
}

// loadAchievements fetches achievements from the backend API
func (a *AchievementApp) loadAchievements(ctx app.Context) {
	a.loading = true
	a.error = ""
	a.Update()

	// Perform HTTP request in a goroutine
	ctx.Async(func() {
		// Create request
		req, err := http.NewRequest(http.MethodGet, a.apiURL, nil)
		if err != nil {
			ctx.Dispatch(func(ctx app.Context) {
				a.loading = false
				a.error = fmt.Sprintf("Failed to create request: %v", err)
				a.Update()
			})
			return
		}

		// Perform request
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			ctx.Dispatch(func(ctx app.Context) {
				a.loading = false
				a.error = fmt.Sprintf("Failed to fetch achievements: %v", err)
				a.Update()
			})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			ctx.Dispatch(func(ctx app.Context) {
				a.loading = false
				a.error = fmt.Sprintf("Server returned status: %d", resp.StatusCode)
				a.Update()
			})
			return
		}

		var achievements []Achievement
		if err := json.NewDecoder(resp.Body).Decode(&achievements); err != nil {
			ctx.Dispatch(func(ctx app.Context) {
				a.loading = false
				a.error = fmt.Sprintf("Failed to decode response: %v", err)
				a.Update()
			})
			return
		}

		ctx.Dispatch(func(ctx app.Context) {
			a.achievements = achievements
			a.loading = false
			a.Update()
		})
	})
}

// toggleComplete toggles the completed status of an achievement
func (a *AchievementApp) toggleComplete(ctx app.Context, achievement *Achievement) {
	achievement.Completed = !achievement.Completed
	a.Update()

	// In a real app, you would update the backend here
	// For now, we just update the UI
}

// Render renders the component
func (a *AchievementApp) Render() app.UI {
	return app.Div().
		Class("container").
		Body(
			app.Header().
				Class("header").
				Body(
					app.H1().Text("🏆 Achievement Keeper"),
					app.P().
						Class("subtitle").
						Text("Track your gaming achievements"),
				),
			app.Main().
				Class("main").
				Body(
					a.renderContent(),
				),
			app.Footer().
				Class("footer").
				Body(
					app.P().Text("Built with Echo (backend) and go-app.dev (frontend)"),
				),
		)
}

func (a *AchievementApp) renderContent() app.UI {
	if a.loading {
		return app.Div().
			Class("loading").
			Body(
				app.P().Text("Loading achievements..."),
			)
	}

	if a.error != "" {
		return app.Div().
			Class("error").
			Body(
				app.P().Text("Error: "+a.error),
				app.Button().
					Text("Retry").
					OnClick(func(ctx app.Context, e app.Event) {
						a.loadAchievements(ctx)
					}),
			)
	}

	if len(a.achievements) == 0 {
		return app.Div().
			Class("empty").
			Body(
				app.P().Text("No achievements found"),
			)
	}

	return app.Div().
		Class("achievements-list").
		Body(
			app.Range(a.achievements).Slice(func(i int) app.UI {
				achievement := &a.achievements[i]
				return a.renderAchievement(achievement)
			}),
		)
}

func (a *AchievementApp) renderAchievement(achievement *Achievement) app.UI {
	cardClass := "achievement-card"
	if achievement.Completed {
		cardClass += " completed"
	}

	return app.Div().
		Class(cardClass).
		Body(
			app.Div().
				Class("achievement-header").
				Body(
					app.H3().Text(achievement.Title),
					app.Span().
						Class("points").
						Text(fmt.Sprintf("%d pts", achievement.Points)),
				),
			app.P().
				Class("description").
				Text(achievement.Description),
			app.Div().
				Class("achievement-footer").
				Body(
					app.Label().
						Body(
							app.Input().
								Type("checkbox").
								Checked(achievement.Completed).
								OnChange(func(ctx app.Context, e app.Event) {
									a.toggleComplete(ctx, achievement)
								}),
							app.Span().Text(" Completed"),
						),
				),
		)
}
