package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Database handles MongoDB operations
type Database struct {
	client     *mongo.Client
	collection *mongo.Collection
}

// ExternalAchievement represents achievement data from external API
type ExternalAchievement struct {
	UserID    int    `json:"userId"`
	ID        int    `json:"id"`
	Title     string `json:"title"`
	Completed bool   `json:"completed"`
}

// NewDatabase creates a new database connection
func NewDatabase(mongoURI string) (*Database, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Set client options
	clientOptions := options.Client().ApplyURI(mongoURI)
	
	// Connect to MongoDB
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	// Ping the database to verify connection
	if err := client.Ping(ctx, nil); err != nil {
		return nil, fmt.Errorf("failed to ping MongoDB: %w", err)
	}

	log.Println("Successfully connected to MongoDB")

	db := &Database{
		client:     client,
		collection: client.Database("cpak").Collection("achievements"),
	}

	return db, nil
}

// Close closes the database connection
func (db *Database) Close(ctx context.Context) error {
	return db.client.Disconnect(ctx)
}

// GetAchievements retrieves all achievements from database
func (db *Database) GetAchievements(ctx context.Context) ([]*Achievement, error) {
	cursor, err := db.collection.Find(ctx, bson.M{})
	if err != nil {
		return nil, fmt.Errorf("failed to query achievements: %w", err)
	}
	defer cursor.Close(ctx)

	var achievements []*Achievement
	if err := cursor.All(ctx, &achievements); err != nil {
		return nil, fmt.Errorf("failed to decode achievements: %w", err)
	}

	return achievements, nil
}

// GetAchievement retrieves a specific achievement by ID
func (db *Database) GetAchievement(ctx context.Context, id int) (*Achievement, error) {
	var achievement Achievement
	err := db.collection.FindOne(ctx, bson.M{"id": id}).Decode(&achievement)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query achievement: %w", err)
	}
	return &achievement, nil
}

// CreateAchievement inserts a new achievement
func (db *Database) CreateAchievement(ctx context.Context, achievement *Achievement) error {
	_, err := db.collection.InsertOne(ctx, achievement)
	if err != nil {
		return fmt.Errorf("failed to insert achievement: %w", err)
	}
	return nil
}

// UpdateAchievement updates an existing achievement
func (db *Database) UpdateAchievement(ctx context.Context, id int, achievement *Achievement) error {
	filter := bson.M{"id": id}
	update := bson.M{"$set": achievement}
	
	result, err := db.collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to update achievement: %w", err)
	}
	
	if result.MatchedCount == 0 {
		return fmt.Errorf("achievement not found")
	}
	
	return nil
}

// DeleteAchievement removes an achievement
func (db *Database) DeleteAchievement(ctx context.Context, id int) error {
	result, err := db.collection.DeleteOne(ctx, bson.M{"id": id})
	if err != nil {
		return fmt.Errorf("failed to delete achievement: %w", err)
	}
	
	if result.DeletedCount == 0 {
		return fmt.Errorf("achievement not found")
	}
	
	return nil
}

// CountAchievements returns the number of achievements in the database
func (db *Database) CountAchievements(ctx context.Context) (int64, error) {
	count, err := db.collection.CountDocuments(ctx, bson.M{})
	if err != nil {
		return 0, fmt.Errorf("failed to count achievements: %w", err)
	}
	return count, nil
}

// FetchAndSeedFromExternalAPI fetches data from JSONPlaceholder API and seeds the database
func (db *Database) FetchAndSeedFromExternalAPI(ctx context.Context) error {
	log.Println("Fetching data from external API (JSONPlaceholder)...")
	
	// Fetch todos from JSONPlaceholder (simulating achievements)
	resp, err := http.Get("https://jsonplaceholder.typicode.com/todos?_limit=10")
	if err != nil {
		return fmt.Errorf("failed to fetch from external API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("external API returned status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	var externalData []ExternalAchievement
	if err := json.Unmarshal(body, &externalData); err != nil {
		return fmt.Errorf("failed to unmarshal external data: %w", err)
	}

	log.Printf("Fetched %d items from external API", len(externalData))

	// Transform external data to our Achievement model
	achievements := make([]*Achievement, len(externalData))
	for i, ext := range externalData {
		// Calculate points based on completion status
		points := 10
		if ext.Completed {
			points = 20
		}
		
		achievements[i] = &Achievement{
			ID:          ext.ID,
			Title:       fmt.Sprintf("Task #%d", ext.ID),
			Description: ext.Title,
			Points:      points,
			Completed:   ext.Completed,
		}
	}

	// Insert achievements into database
	log.Println("Saving achievements to MongoDB...")
	for _, achievement := range achievements {
		if err := db.CreateAchievement(ctx, achievement); err != nil {
			log.Printf("Warning: failed to insert achievement %d: %v", achievement.ID, err)
			// Continue with other achievements
		}
	}

	log.Printf("Successfully seeded %d achievements from external API", len(achievements))
	return nil
}
