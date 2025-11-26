package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	STEAM_KEY string = "STEAM_API_KEY"
	STEAM_ID  string = "STEAM_ID"
)

type GameDatabase struct {
	ID         primitive.ObjectID `bson:"_id"`
	SteamId    uint64             `bson:"steamId"`
	OwnedGames OwnedGames         `bson:"ownedGames"`
}

type Game struct {
	AppID uint32 `json:"appid"`
	Name  string `json:"name"`
}

type OwnedGames struct {
	Response struct {
		Games []Game `json:"games"`
	} `json:"response"`
}

type StatusResult struct {
	PlayerStats struct {
		Success      bool   `json:"success"`
		GameName     string `json:"gameName"`
		Achievements []struct {
			APIName    string `json:"apiname"`
			Achieved   int    `json:"achieved"`
			UnlockTime int64  `json:"unlocktime"`
		} `json:"achievements"`
	} `json:"playerstats"`
}

type SchemaResult struct {
	Game struct {
		Stats struct {
			Achievements []struct {
				Name        string `json:"name"`
				DisplayName string `json:"displayName"`
				Description string `json:"description"`
				Icon        string `json:"icon"`
				IconGray    string `json:"icongray"`
			} `json:"achievements"`
		} `json:"availableGameStats"`
	} `json:"game"`
}

func (s *Server) GetOwnedSteamGames(c echo.Context) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ownedGamesFromDb, searchErr := s.DB.SearchSavedOwnedSteamGamesBySteamId(ctx, STEAM_ID)

	if ownedGamesFromDb == nil || searchErr != nil {
		log.Println("Fetching data from steam API...")

		ctx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		url := fmt.Sprintf(
			"https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=%s&steamid=%s&include_appinfo=1&format=json",
			STEAM_KEY, STEAM_ID,
		)

		resp, err := http.Get(url)

		if err != nil {
			return fmt.Errorf("failed to fetch from steam API: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("steam API returned status: %d", resp.StatusCode)
		}

		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("failed to read steam response body: %w", err)
		}

		var parsed OwnedGames
		json.Unmarshal(data, &parsed)

		mongoDbId := primitive.NewObjectID()

		log.Println("MongoDB Id: ", mongoDbId)

		steamId, parseErr := strconv.ParseUint(STEAM_ID, 10, 64)

		if parseErr != nil {
			return fmt.Errorf("failed to parse steamId to uint: %w", parseErr)
		}

		if err := s.DB.SaveOwnedSteamGames(ctx, &GameDatabase{
			ID:         mongoDbId,
			SteamId:    steamId,
			OwnedGames: parsed,
		}); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, parsed.Response.Games)
	}
	return c.JSON(http.StatusOK, ownedGamesFromDb.Response.Games)
}

func (s *Server) GetPlayerAchievements(c echo.Context) error {
	appid, err := strconv.Atoi(c.Param("appid"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid appid"})
	}

	statusURL := fmt.Sprintf(
		"https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?key=%s&steamid=%s&appid=%d",
		STEAM_KEY, STEAM_ID, appid,
	)

	statusResp, err := http.Get(statusURL)
	if err != nil {
		return fmt.Errorf("failed to fetch from steam API: %w", err)
	}
	defer statusResp.Body.Close()

	data, _ := io.ReadAll(statusResp.Body)
	var statusResult StatusResult
	json.Unmarshal(data, &statusResult)

	if !statusResult.PlayerStats.Success {
		return fmt.Errorf("no achievments for appid: %d ", appid)
	}

	schemaResult, schemaErr := getSchemaForGame(uint32(appid))

	if schemaErr != nil {
		return fmt.Errorf("%w", err)
	}

	enriched := mergedAchievementWithMetadata(statusResult, *schemaResult)

	steamId, parseErr := strconv.ParseUint(STEAM_ID, 10, 64)

	if parseErr != nil {
		return fmt.Errorf("failed to parse steamId to uint: %w", parseErr)
	}

	return c.JSON(http.StatusOK, map[string]any{
		"appid":        appid,
		"steamId":      steamId,
		"gameName":     statusResult.PlayerStats.GameName,
		"achievements": enriched,
	})
}

func getSchemaForGame(appid uint32) (*SchemaResult, error) {
	schemaURL := fmt.Sprintf(
		"https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=%s&appid=%d",
		STEAM_KEY, appid,
	)

	schemaResp, err := http.Get(schemaURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch from steam API: %w", err)
	}
	defer schemaResp.Body.Close()

	data, _ := io.ReadAll(schemaResp.Body)
	var parsed SchemaResult
	json.Unmarshal(data, &parsed)

	return &parsed, nil
}

func mergedAchievementWithMetadata(statusResult StatusResult, schemaResult SchemaResult) any {
	schemaMap := map[string]any{}
	for _, s := range schemaResult.Game.Stats.Achievements {
		schemaMap[s.Name] = s
	}

	enriched := []any{}
	for _, a := range statusResult.PlayerStats.Achievements {
		if info, ok := schemaMap[a.APIName]; ok {
			enriched = append(enriched, map[string]any{
				"apiname":    a.APIName,
				"achieved":   a.Achieved,
				"unlocktime": a.UnlockTime,
				"meta":       info,
			})
		}
	}

	return enriched
}
