package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/model"
)

// AnchorRepository holds the database connection.
type AnchorRepository struct {
	db *pgxpool.Pool
}

// NewAnchorRepository builds the repository.
// The database pool is passed in from outside.
func NewAnchorRepository(db *pgxpool.Pool) *AnchorRepository {
	return &AnchorRepository{db: db}
}

// FindAll returns every saved anchor.
func (repo *AnchorRepository) FindAll() ([]model.Anchor, error) {
	query := `SELECT anchor_id, center_lat, center_lng, created_at FROM anchors`

	// Query is for MANY rows. QueryRow is for ONE row.
	rows, err := repo.db.Query(context.Background(), query)
	if err != nil {
		return nil, err
	}

	// defer means: run this at the end of the function, always.
	// This makes sure we free the database resource.
	defer rows.Close()

	var anchors []model.Anchor

	// Loop through the rows, one at a time.
	// rows.Next() returns false when there are no more rows.
	for rows.Next() {
		var a model.Anchor

		// Copy the 4 columns into the 4 struct fields.
		// The & means "the place where this value is stored",
		// so Scan can write into it.
		err := rows.Scan(&a.AnchorID, &a.CenterLat, &a.CenterLng, &a.CreatedAt)
		if err != nil {
			return nil, err
		}

		// Add this anchor to our list.
		anchors = append(anchors, a)
	}

	// rows.Err() reports a problem that happened during the loop.
	return anchors, rows.Err()
}

// Insert creates a new anchor and gives back its new id.
func (repo *AnchorRepository) Insert(lat float64, lng float64) (int, error) {
	// RETURNING anchor_id gives us the id of the row we just made.
	query := `
		INSERT INTO anchors (center_lat, center_lng)
		VALUES ($1, $2)
		RETURNING anchor_id
	`

	var newID int

	// QueryRow because we expect exactly one answer.
	err := repo.db.QueryRow(context.Background(), query, lat, lng).Scan(&newID)

	return newID, err
}
