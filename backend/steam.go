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
	SteamId    uint32             `bson:"steamId"`
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
			SteamId:    uint32(steamId),
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
