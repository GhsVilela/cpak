package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	STEAM_KEY string = "STEAM_KEY"
	STEAM_ID  string = "STEAM_ID"
)

type GameDatabase struct {
	ID         primitive.ObjectID `bson:"_id"`
	SteamId    uint64             `bson:"steamId"`
	OwnedGames *OwnedGames        `bson:"ownedGames"`
}

type Meta struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	IconGray    string `json:"icon_grey"`
}

type Achievement struct {
	ApiName    string `json:"api_name"`
	Achieved   int    `json:"achieved"`
	UnlockTime int64  `json:"unlock_time"`
	Meta       Meta   `json:"meta"`
}

type Game struct {
	AppID               uint32        `json:"appid"`
	Name                string        `json:"name"`
	Playtime            uint32        `json:"playtime_forever"`
	PlaytimeOnSteamDeck uint32        `json:"playtime_deck_forever"`
	LastPlayed          uint64        `json:"rtime_last_played"`
	IconUrl             string        `json:"img_icon_url"`
	Achievements        []Achievement `json:"achievements"`
}

type OwnedGames struct {
	Response struct {
		GameCount uint32 `json:"game_count"`
		Games     []Game `json:"games"`
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
			Achievements []Meta `json:"achievements"`
		} `json:"availableGameStats"`
	} `json:"game"`
}

func (s *Server) getOwnedSteamGames() (*OwnedGames, error) {
	log.Println("Fetching data from steam API...")

	url := fmt.Sprintf(
		"https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=%s&steamid=%s&include_appinfo=1&format=json",
		os.Getenv(STEAM_KEY), os.Getenv(STEAM_ID),
	)

	resp, err := http.Get(url)

	if err != nil {
		return nil, fmt.Errorf("failed to fetch from steam API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("steam API returned status: %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read steam response body: %w", err)
	}

	var parsed OwnedGames
	json.Unmarshal(data, &parsed)

	return &parsed, nil
}

func (s *Server) getOwnedSteamGamesFromDb() (*OwnedGames, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	s.DB.collection = s.DB.database.Collection("steam-owned-games")
	return s.DB.SearchSavedOwnedSteamGamesBySteamId(ctx, os.Getenv(STEAM_ID))
}

func (s *Server) GetPlayedGames(c echo.Context) error {
	playedGamesFromDb, searchErr := s.getOwnedSteamGamesFromDb()

	if playedGamesFromDb == nil || searchErr != nil {
		ownedGamesFromSteam, searchErr := s.getOwnedSteamGames()

		if searchErr != nil {
			return fmt.Errorf("%w", searchErr)
		}

		playedGames, err := filterPlayedGames(*ownedGamesFromSteam)

		if err != nil {
			return fmt.Errorf("%w", err)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		mongoDbId := primitive.NewObjectID()

		log.Println("MongoDB Id: ", mongoDbId)

		steamId, parseErr := strconv.ParseUint(os.Getenv(STEAM_ID), 10, 64)

		if parseErr != nil {
			return fmt.Errorf("failed to parse steamId to uint: %w", parseErr)
		}

		if err := s.DB.SaveOwnedSteamGames(ctx, &GameDatabase{
			ID:         mongoDbId,
			SteamId:    steamId,
			OwnedGames: playedGames,
		}); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, playedGames)
	}

	return c.JSON(http.StatusOK, playedGamesFromDb)
}

func filterPlayedGames(owned OwnedGames) (*OwnedGames, error) {
	playedGames := OwnedGames{}

	prefix := "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/"
	suffix := ".jpg"

	for _, g := range owned.Response.Games {
		if g.Playtime > 0 {
			achievements, err := getPlayerAchievements(g.AppID)

			if err != nil {
				return nil, fmt.Errorf("%w", err)
			}

			g.Achievements = achievements
			playedGames.Response.Games = append(playedGames.Response.Games, g)

		}
		g.IconUrl = prefix + fmt.Sprintf("%d", g.AppID) + "/" + g.IconUrl + suffix
	}

	playedGames.Response.GameCount = uint32(len(playedGames.Response.Games))
	return &playedGames, nil
}

func getPlayerAchievements(appid uint32) ([]Achievement, error) {
	statusURL := fmt.Sprintf(
		"https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?key=%s&steamid=%s&appid=%d",
		os.Getenv(STEAM_KEY), os.Getenv(STEAM_ID), appid,
	)

	statusResp, err := http.Get(statusURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch from steam API: %w", err)
	}
	defer statusResp.Body.Close()

	data, _ := io.ReadAll(statusResp.Body)
	var statusResult StatusResult
	json.Unmarshal(data, &statusResult)

	if !statusResult.PlayerStats.Success {
		log.Println("no achievements for appid:  ", appid)
	}

	schemaResult, schemaErr := getSchemaForGame(uint32(appid))

	if schemaErr != nil {
		return nil, fmt.Errorf("%w", err)
	}

	enriched := mergedAchievementWithMetadata(statusResult, *schemaResult)

	return enriched, nil
}

func getSchemaForGame(appid uint32) (*SchemaResult, error) {
	schemaURL := fmt.Sprintf(
		"https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=%s&appid=%d",
		os.Getenv(STEAM_KEY), appid,
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

func mergedAchievementWithMetadata(statusResult StatusResult, schemaResult SchemaResult) []Achievement {
	schemaMap := map[string]Meta{}
	for _, s := range schemaResult.Game.Stats.Achievements {
		schemaMap[s.Name] = s
	}

	enriched := []Achievement{}

	for _, a := range statusResult.PlayerStats.Achievements {
		if info, ok := schemaMap[a.APIName]; ok {
			enriched = append(enriched, Achievement{
				ApiName:    a.APIName,
				Achieved:   a.Achieved,
				UnlockTime: a.UnlockTime,
				Meta:       info,
			})
		}
	}

	return enriched
}
