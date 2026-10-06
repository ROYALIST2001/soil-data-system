package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/model"
)

// ErrFarmerNotFound is returned when no farmer matches.
//
// WHY A NAMED ERROR? So the service layer can tell "nobody has that NIC"
// apart from "the database is broken". Those two need very different
// answers, and comparing error TEXT is fragile.
var ErrFarmerNotFound = errors.New("farmer not found")

// FarmerRepository holds the database connection.
type FarmerRepository struct {
	db *pgxpool.Pool
}

// NewFarmerRepository builds the repository.
func NewFarmerRepository(db *pgxpool.Pool) *FarmerRepository {
	return &FarmerRepository{db: db}
}

// ExistsByNIC says whether that NIC is already registered.
func (repo *FarmerRepository) ExistsByNIC(nic string) (bool, error) {
	query := `SELECT EXISTS (SELECT 1 FROM farmers WHERE nic = $1)`

	var exists bool
	err := repo.db.QueryRow(context.Background(), query, nic).Scan(&exists)

	return exists, err
}

// Insert creates a new farmer and gives back the id the DATABASE made.
func (repo *FarmerRepository) Insert(
	nic string,
	fullName string,
	gnDivision string,
	mobile string,
	email string,
	passwordHash string,
) (model.Farmer, error) {

	// RETURNING gives us back the generated id and timestamp in the same
	// trip, so we do not need a second SELECT to find out what we just made.
	query := `
		INSERT INTO farmers
			(nic, full_name, gn_division, mobile, email, password_hash)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING farmer_id, created_at
	`

	farmer := model.Farmer{
		NIC:        nic,
		FullName:   fullName,
		GNDivision: gnDivision,
		Mobile:     mobile,
		Email:      email,
	}

	err := repo.db.QueryRow(
		context.Background(), query,
		nic, fullName, gnDivision, mobile, email, passwordHash,
	).Scan(&farmer.FarmerID, &farmer.CreatedAt)

	if err != nil {
		return model.Farmer{}, err
	}

	return farmer, nil
}

// FindByNIC loads one farmer by their NIC, for logging in.
//
// This is the ONLY place the password hash is read out of the database.
func (repo *FarmerRepository) FindByNIC(nic string) (model.Farmer, error) {
	query := `
		SELECT farmer_id, nic, full_name, gn_division, mobile, email,
		       password_hash, created_at
		FROM farmers
		WHERE nic = $1
	`

	var f model.Farmer

	err := repo.db.QueryRow(context.Background(), query, nic).Scan(
		&f.FarmerID, &f.NIC, &f.FullName, &f.GNDivision, &f.Mobile,
		&f.Email, &f.PasswordHash, &f.CreatedAt,
	)

	// pgx.ErrNoRows means the query worked fine and found nothing.
	// That is NOT a failure, so we turn it into our own clear error.
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Farmer{}, ErrFarmerNotFound
	}

	if err != nil {
		return model.Farmer{}, err
	}

	return f, nil
}

// FindByID loads one farmer by their id.
func (repo *FarmerRepository) FindByID(farmerID int) (model.Farmer, error) {
	query := `
		SELECT farmer_id, nic, full_name, gn_division, mobile, email,
		       password_hash, created_at
		FROM farmers
		WHERE farmer_id = $1
	`

	var f model.Farmer

	err := repo.db.QueryRow(context.Background(), query, farmerID).Scan(
		&f.FarmerID, &f.NIC, &f.FullName, &f.GNDivision, &f.Mobile,
		&f.Email, &f.PasswordHash, &f.CreatedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return model.Farmer{}, ErrFarmerNotFound
	}

	if err != nil {
		return model.Farmer{}, err
	}

	return f, nil
}
