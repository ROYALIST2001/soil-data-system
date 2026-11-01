package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/model"
)

// ErrLandNotFound means no land matched, or it belongs to another farmer.
//
// ONE error for both cases, on purpose. If "this land is not yours" and
// "this land does not exist" gave different answers, a farmer could work
// through land ids and learn how many lands other people have registered.
var ErrLandNotFound = errors.New("land not found")

// LandRepository holds the database connection.
type LandRepository struct {
	db *pgxpool.Pool
}

// NewLandRepository builds the repository.
func NewLandRepository(db *pgxpool.Pool) *LandRepository {
	return &LandRepository{db: db}
}

// InsertLandWithCrops saves one land AND its crops as a single unit.
//
// WHY A TRANSACTION.
// This writes to two tables. Without a transaction, the land could be saved
// and then a crop insert could fail - leaving a land in the database with
// nothing growing on it, which our own rules say must never exist. The
// farmer would see a half-made land they did not create.
//
// A transaction makes the two writes ONE event: either both tables change,
// or neither does. There is no in-between state for anyone to see.
func (repo *LandRepository) InsertLandWithCrops(
	farmerID int,
	name string,
	gnDivision string,
	sizeHa float64,
	crops []model.NewLandCrop,
) (model.Land, error) {

	ctx := context.Background()

	tx, err := repo.db.Begin(ctx)
	if err != nil {
		return model.Land{}, err
	}

	// ROLLBACK ON EVERY EXIT PATH.
	//
	// defer runs when the function ends, however it ends - a return, an
	// error, a panic. If we already committed, this rollback does nothing
	// and returns a harmless error we ignore. If we did NOT commit, it
	// undoes everything.
	//
	// Writing it here, immediately after Begin, means no error path added
	// later can forget it.
	defer tx.Rollback(ctx)

	landQuery := `
		INSERT INTO lands (farmer_id, name, gn_division, size_ha)
		VALUES ($1, $2, $3, $4)
		RETURNING land_id, created_at
	`

	land := model.Land{
		FarmerID:   farmerID,
		Name:       name,
		GNDivision: gnDivision,
		SizeHa:     sizeHa,
		Crops:      []model.LandCrop{},
	}

	err = tx.QueryRow(ctx, landQuery, farmerID, name, gnDivision, sizeHa).
		Scan(&land.LandID, &land.CreatedAt)
	if err != nil {
		return model.Land{}, err
	}

	cropQuery := `
		INSERT INTO land_crops (land_id, crop, size_ha)
		VALUES ($1, $2, $3)
		RETURNING land_crop_id, created_at
	`

	for _, c := range crops {
		saved := model.LandCrop{
			LandID: land.LandID,
			Crop:   c.Crop,
			SizeHa: c.SizeHa,
		}

		err = tx.QueryRow(ctx, cropQuery, land.LandID, c.Crop, c.SizeHa).
			Scan(&saved.LandCropID, &saved.CreatedAt)
		if err != nil {
			// The deferred rollback removes the land we just inserted.
			return model.Land{}, err
		}

		land.Crops = append(land.Crops, saved)
	}

	if err := tx.Commit(ctx); err != nil {
		return model.Land{}, err
	}

	return land, nil
}

// FindByFarmer returns every land this farmer owns, each with its crops.
//
// TWO QUERIES, NOT A JOIN.
// A join would repeat the land's name and size on every crop row, and we
// would have to un-repeat it in Go. Two plain queries are easier to read and
// easier to be sure about. This is also not the N+1 mistake: it is two
// queries in total, not one per land.
func (repo *LandRepository) FindByFarmer(farmerID int) ([]model.Land, error) {
	ctx := context.Background()

	landQuery := `
		SELECT land_id, farmer_id, name, gn_division, size_ha, created_at
		FROM lands
		WHERE farmer_id = $1
		ORDER BY land_id
	`

	rows, err := repo.db.Query(ctx, landQuery, farmerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Start as an EMPTY SLICE, not nil.
	//
	// An empty slice turns into [] in JSON. A nil slice turns into null.
	// The app checks "how many lands are there" to decide whether to show
	// the registration screen, and null would make that check awkward.
	lands := []model.Land{}

	// A map from land id to its position in the slice, so the second query
	// can drop each crop into the right land without searching the list
	// every time.
	positions := make(map[int]int)

	for rows.Next() {
		var l model.Land
		err := rows.Scan(
			&l.LandID, &l.FarmerID, &l.Name,
			&l.GNDivision, &l.SizeHa, &l.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		l.Crops = []model.LandCrop{}
		positions[l.LandID] = len(lands)
		lands = append(lands, l)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	// No lands means no crops to look for. Stop here rather than running a
	// pointless second query.
	if len(lands) == 0 {
		return lands, nil
	}

	cropQuery := `
		SELECT lc.land_crop_id, lc.land_id, lc.crop, lc.size_ha, lc.created_at
		FROM land_crops lc
		JOIN lands l ON l.land_id = lc.land_id
		WHERE l.farmer_id = $1
		ORDER BY lc.land_crop_id
	`

	cropRows, err := repo.db.Query(ctx, cropQuery, farmerID)
	if err != nil {
		return nil, err
	}
	defer cropRows.Close()

	for cropRows.Next() {
		var c model.LandCrop
		err := cropRows.Scan(
			&c.LandCropID, &c.LandID, &c.Crop, &c.SizeHa, &c.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		if pos, found := positions[c.LandID]; found {
			lands[pos].Crops = append(lands[pos].Crops, c)
		}
	}

	return lands, cropRows.Err()
}

// FindLandForFarmer loads one land, but ONLY if this farmer owns it.
//
// The farmer id is part of the WHERE clause, not checked afterwards in Go.
// That way there is no code path where we forget to check: a land belonging
// to somebody else simply is not found.
func (repo *LandRepository) FindLandForFarmer(
	landID int, farmerID int,
) (model.Land, error) {

	query := `
		SELECT land_id, farmer_id, name, gn_division, size_ha, created_at
		FROM lands
		WHERE land_id = $1 AND farmer_id = $2
	`

	var l model.Land

	err := repo.db.QueryRow(context.Background(), query, landID, farmerID).Scan(
		&l.LandID, &l.FarmerID, &l.Name,
		&l.GNDivision, &l.SizeHa, &l.CreatedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return model.Land{}, ErrLandNotFound
	}
	if err != nil {
		return model.Land{}, err
	}

	l.Crops = []model.LandCrop{}
	return l, nil
}

// SumCropSize adds up the crop sizes already on one land.
//
// COALESCE turns the NULL that SUM returns for an empty table into 0.
// Without it, scanning into a float64 would fail on a land with no crops.
func (repo *LandRepository) SumCropSize(landID int) (float64, error) {
	query := `
		SELECT COALESCE(SUM(size_ha), 0)
		FROM land_crops
		WHERE land_id = $1
	`

	var total float64
	err := repo.db.QueryRow(context.Background(), query, landID).Scan(&total)

	return total, err
}

// CropExistsOnLand says whether this land already grows this crop.
func (repo *LandRepository) CropExistsOnLand(
	landID int, crop string,
) (bool, error) {

	query := `
		SELECT EXISTS (
			SELECT 1 FROM land_crops WHERE land_id = $1 AND crop = $2
		)
	`

	var exists bool
	err := repo.db.QueryRow(context.Background(), query, landID, crop).
		Scan(&exists)

	return exists, err
}

// InsertCrop adds one crop to a land that already exists.
func (repo *LandRepository) InsertCrop(
	landID int, crop string, sizeHa float64,
) (model.LandCrop, error) {

	query := `
		INSERT INTO land_crops (land_id, crop, size_ha)
		VALUES ($1, $2, $3)
		RETURNING land_crop_id, created_at
	`

	saved := model.LandCrop{LandID: landID, Crop: crop, SizeHa: sizeHa}

	err := repo.db.QueryRow(context.Background(), query, landID, crop, sizeHa).
		Scan(&saved.LandCropID, &saved.CreatedAt)

	if err != nil {
		return model.LandCrop{}, err
	}

	return saved, nil
}

// DeleteLand removes one land, but only if this farmer owns it.
//
// The crops go too, because of ON DELETE CASCADE in the migration. We do
// not delete them by hand: letting the database enforce it means it stays
// true even for a row deleted directly in psql.
func (repo *LandRepository) DeleteLand(landID int, farmerID int) error {
	query := `DELETE FROM lands WHERE land_id = $1 AND farmer_id = $2`

	result, err := repo.db.Exec(context.Background(), query, landID, farmerID)
	if err != nil {
		return err
	}

	// DELETE does not fail when it matches nothing, it just deletes zero
	// rows. So we ask how many rows were affected to tell "deleted" apart
	// from "there was nothing of yours to delete".
	if result.RowsAffected() == 0 {
		return ErrLandNotFound
	}

	return nil
}

// DeleteCrop removes one crop, but only if this farmer owns its land.
//
// The farmer check reaches through lands with a sub-select, so a farmer can
// never delete a crop from somebody else's land by guessing an id.
func (repo *LandRepository) DeleteCrop(landCropID int, farmerID int) error {
	query := `
		DELETE FROM land_crops
		WHERE land_crop_id = $1
		  AND land_id IN (SELECT land_id FROM lands WHERE farmer_id = $2)
	`

	result, err := repo.db.Exec(
		context.Background(), query, landCropID, farmerID,
	)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrLandNotFound
	}

	return nil
}

// CountCropsOnLand says how many crops are on one land.
//
// Used to stop a farmer removing the LAST crop from a land, which would
// leave a land with nothing growing on it.
func (repo *LandRepository) CountCropsOnLand(landID int) (int, error) {
	query := `SELECT COUNT(*) FROM land_crops WHERE land_id = $1`

	var count int
	err := repo.db.QueryRow(context.Background(), query, landID).Scan(&count)

	return count, err
}

// FindLandIDForCrop finds which land a crop belongs to, for this farmer.
func (repo *LandRepository) FindLandIDForCrop(
	landCropID int, farmerID int,
) (int, error) {

	query := `
		SELECT lc.land_id
		FROM land_crops lc
		JOIN lands l ON l.land_id = lc.land_id
		WHERE lc.land_crop_id = $1 AND l.farmer_id = $2
	`

	var landID int
	err := repo.db.QueryRow(
		context.Background(), query, landCropID, farmerID,
	).Scan(&landID)

	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrLandNotFound
	}

	return landID, err
}
