package app

import (
	"fmt"

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
}





// Render renders the component
func (a *AchievementApp) Render() app.UI {
	// Hardcoded demo data
	achievements := []Achievement{
		{ID: 1, Title: "First Steps DEMO", Description: "Complete your first task", Points: 10, Completed: true},
		{ID: 2, Title: "Getting Started DEMO", Description: "Create your profile", Points: 5, Completed: true},
		{ID: 3, Title: "Power User DEMO", Description: "Complete 10 tasks", Points: 50, Completed: false},
	}
	
	return app.Div().
		Class("container").
		Body(
			app.Header().
				Class("header").
				Body(
					app.H1().Text("🏆 Achievement Keeper v2 UPDATED"),
					app.P().
						Class("subtitle").
						Text("Track your gaming achievements"),
				),
			app.Main().
				Class("main").
				Body(
					a.renderContent(achievements),
				),
			app.Footer().
				Class("footer").
				Body(
					app.P().Text("Built with Echo (backend) and go-app.dev (frontend)"),
				),
		)
}

func (a *AchievementApp) renderContent(achievements []Achievement) app.UI {
	if len(achievements) == 0 {
		return app.Div().
			Class("empty").
			Body(
				app.P().Text("No achievements found"),
			)
	}

	return app.Div().
		Class("achievements-list").
		Body(
			app.Range(achievements).Slice(func(i int) app.UI {
				achievement := achievements[i]
				return a.renderAchievement(&achievement)
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
								Checked(achievement.Completed),
							app.Span().Text(" Completed"),
						),
				),
		)
}
