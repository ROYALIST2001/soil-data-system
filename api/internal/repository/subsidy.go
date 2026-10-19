package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/model"
)

// ErrRoundNotFound means no such subsidy round.
var ErrRoundNotFound = errors.New("subsidy round not found")

// ErrApplicationNotFound means no such application, it belongs to somebody
// else, or somebody has already moved it on. One error for all three, so the
// API never confirms that an application exists where the caller may not
// look.
var ErrApplicationNotFound = errors.New("subsidy application not found")

// SubsidyRepository stores subsidy rounds and applications.
type SubsidyRepository struct {
	db *pgxpool.Pool
}

// NewSubsidyRepository builds the repository.
func NewSubsidyRepository(db *pgxpool.Pool) *SubsidyRepository {
	return &SubsidyRepository{db: db}
}

// ---------- ROUNDS ----------

// InsertRound announces a round, with its divisions and rates.
//
// A TRANSACTION, because a round is useless without the other two. A round
// with no divisions lets nobody apply; a round with no rates pays nothing.
// Saving one without the others would leave a scheme that looks announced
// but cannot work, and nobody would notice until a farmer tried to use it.
func (repo *SubsidyRepository) InsertRound(
	declaredBy int, req model.DeclareRoundRequest,
) (int, error) {

	ctx := context.Background()

	tx, err := repo.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var roundID int

	err = tx.QueryRow(ctx, `
		INSERT INTO subsidy_rounds
			(name, season, opens_on, closes_on, description, declared_by)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING round_id
	`, req.Name, req.Season, req.OpensOn, req.ClosesOn,
		req.Description, declaredBy).Scan(&roundID)
	if err != nil {
		return 0, err
	}

	for _, division := range req.Divisions {
		if _, err := tx.Exec(ctx, `
			INSERT INTO subsidy_round_divisions (round_id, gn_division)
			VALUES ($1, $2)
		`, roundID, division); err != nil {
			return 0, err
		}
	}

	for _, rate := range req.Rates {
		if _, err := tx.Exec(ctx, `
			INSERT INTO subsidy_round_rates (round_id, crop, rate_per_hectare)
			VALUES ($1, $2, $3)
		`, roundID, rate.Crop, rate.RatePerHectare); err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	return roundID, nil
}

// The columns every round query reads, written once so the SELECT and the
// Scan that follows it cannot drift apart.
const roundColumns = `
	r.round_id, r.name, r.season,
	TO_CHAR(r.opens_on, 'YYYY-MM-DD'), TO_CHAR(r.closes_on, 'YYYY-MM-DD'),
	r.description, r.status, r.declared_by,
	COALESCE(f.full_name, ''), r.declared_at,
	(SELECT COUNT(*) FROM subsidy_applications a
	  WHERE a.round_id = r.round_id),
	(SELECT COALESCE(SUM(a.amount_lkr), 0) FROM subsidy_applications a
	  WHERE a.round_id = r.round_id
	    AND a.status IN ('APPROVED','SENT','RECEIVED','DISPUTED','RESOLVED')),
	(SELECT COUNT(*) FROM subsidy_applications a
	  WHERE a.round_id = r.round_id AND a.status = 'DISPUTED')
`

func scanRound(row pgx.Row, r *model.SubsidyRound) error {
	return row.Scan(
		&r.RoundID, &r.Name, &r.Season, &r.OpensOn, &r.ClosesOn,
		&r.Description, &r.Status, &r.DeclaredBy, &r.DeclaredName,
		&r.DeclaredAt, &r.ApplicationCount, &r.TotalApproved,
		&r.DisputedCount,
	)
}

// FindRound loads one round with its divisions and rates.
func (repo *SubsidyRepository) FindRound(
	roundID int,
) (model.SubsidyRound, error) {

	query := `SELECT ` + roundColumns + `
		FROM subsidy_rounds r
		LEFT JOIN farmers f ON f.farmer_id = r.declared_by
		WHERE r.round_id = $1
	`

	var r model.SubsidyRound

	err := scanRound(repo.db.QueryRow(context.Background(), query, roundID), &r)

	if errors.Is(err, pgx.ErrNoRows) {
		return model.SubsidyRound{}, ErrRoundNotFound
	}
	if err != nil {
		return model.SubsidyRound{}, err
	}

	if r.Divisions, err = repo.roundDivisions(roundID); err != nil {
		return model.SubsidyRound{}, err
	}
	if r.Rates, err = repo.roundRates(roundID); err != nil {
		return model.SubsidyRound{}, err
	}

	return r, nil
}

func (repo *SubsidyRepository) roundDivisions(
	roundID int,
) ([]string, error) {

	rows, err := repo.db.Query(context.Background(), `
		SELECT gn_division FROM subsidy_round_divisions
		WHERE round_id = $1 ORDER BY gn_division
	`, roundID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Empty slice, not nil, so the JSON is [] and never null.
	divisions := []string{}

	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			return nil, err
		}
		divisions = append(divisions, d)
	}

	return divisions, rows.Err()
}

func (repo *SubsidyRepository) roundRates(
	roundID int,
) ([]model.SubsidyRate, error) {

	rows, err := repo.db.Query(context.Background(), `
		SELECT crop, rate_per_hectare FROM subsidy_round_rates
		WHERE round_id = $1 ORDER BY crop
	`, roundID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rates := []model.SubsidyRate{}

	for rows.Next() {
		var r model.SubsidyRate
		if err := rows.Scan(&r.Crop, &r.RatePerHectare); err != nil {
			return nil, err
		}
		rates = append(rates, r)
	}

	return rates, rows.Err()
}

// ListRounds returns rounds, optionally only those covering one division
// and only those still open.
func (repo *SubsidyRepository) ListRounds(
	division string, openOnly bool,
) ([]model.SubsidyRound, error) {

	query := `SELECT ` + roundColumns + `
		FROM subsidy_rounds r
		LEFT JOIN farmers f ON f.farmer_id = r.declared_by
		WHERE ($1 = '' OR EXISTS (
		          SELECT 1 FROM subsidy_round_divisions d
		          WHERE d.round_id = r.round_id
		            AND LOWER(TRIM(d.gn_division)) = LOWER(TRIM($1))))
		  AND ($2 = false OR r.status = 'OPEN')
		ORDER BY r.opens_on DESC, r.round_id DESC
	`

	rows, err := repo.db.Query(context.Background(), query, division, openOnly)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rounds := []model.SubsidyRound{}

	for rows.Next() {
		var r model.SubsidyRound
		if err := scanRound(rows, &r); err != nil {
			return nil, err
		}
		rounds = append(rounds, r)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Two extra queries per round is fine for a list holding a handful of
	// announced schemes, and it keeps the main query readable.
	for i := range rounds {
		if rounds[i].Divisions, err = repo.roundDivisions(
			rounds[i].RoundID,
		); err != nil {
			return nil, err
		}
		if rounds[i].Rates, err = repo.roundRates(
			rounds[i].RoundID,
		); err != nil {
			return nil, err
		}
	}

	return rounds, nil
}

// SetRoundStatus opens or closes a round.
func (repo *SubsidyRepository) SetRoundStatus(
	roundID int, status string,
) error {

	result, err := repo.db.Exec(context.Background(), `
		UPDATE subsidy_rounds SET status = $1 WHERE round_id = $2
	`, status, roundID)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrRoundNotFound
	}

	return nil
}

// RateForCrop returns the rupees per hectare for one crop in one round.
//
// found is false when the round has no rate for that crop, which means the
// scheme does not cover it. That is a real answer, not an error.
func (repo *SubsidyRepository) RateForCrop(
	roundID int, crop string,
) (rate float64, found bool, err error) {

	err = repo.db.QueryRow(context.Background(), `
		SELECT rate_per_hectare FROM subsidy_round_rates
		WHERE round_id = $1 AND crop = $2
	`, roundID, crop).Scan(&rate)

	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}

	return rate, true, nil
}

// DivisionCovered says whether a round covers a division.
func (repo *SubsidyRepository) DivisionCovered(
	roundID int, division string,
) (bool, error) {

	var covered bool

	err := repo.db.QueryRow(context.Background(), `
		SELECT EXISTS (
			SELECT 1 FROM subsidy_round_divisions
			WHERE round_id = $1
			  AND LOWER(TRIM(gn_division)) = LOWER(TRIM($2))
		)
	`, roundID, division).Scan(&covered)

	return covered, err
}

// ---------- APPLICATIONS ----------

const applicationColumns = `
	a.application_id, a.round_id, r.name, r.season,
	a.farmer_id, COALESCE(f.full_name, ''),
	COALESCE(TRIM(f.gn_division), ''), COALESCE(f.mobile, ''),
	a.land_id, COALESCE(l.name, ''), a.land_crop_id, COALESCE(lc.crop, ''),
	a.area_ha, a.amount_lkr,
	(SELECT rr.rate_per_hectare FROM subsidy_round_rates rr
	  WHERE rr.round_id = a.round_id AND rr.crop = lc.crop),
	a.farmer_note, a.status, a.created_at, a.updated_at
`

const applicationJoins = `
	FROM subsidy_applications a
	JOIN subsidy_rounds r ON r.round_id = a.round_id
	LEFT JOIN farmers    f  ON f.farmer_id = a.farmer_id
	LEFT JOIN lands      l  ON l.land_id = a.land_id
	LEFT JOIN land_crops lc ON lc.land_crop_id = a.land_crop_id
`

func scanApplication(row pgx.Row, a *model.SubsidyApplication) error {
	return row.Scan(
		&a.ApplicationID, &a.RoundID, &a.RoundName, &a.Season,
		&a.FarmerID, &a.FarmerName, &a.GNDivision, &a.FarmerPhone,
		&a.LandID, &a.LandName, &a.LandCropID, &a.Crop,
		&a.AreaHa, &a.AmountLKR, &a.RatePerHectare,
		&a.FarmerNote, &a.Status, &a.CreatedAt, &a.UpdatedAt,
	)
}

// InsertApplication files a new application.
func (repo *SubsidyRepository) InsertApplication(
	req model.ApplyForSubsidyRequest, landID int, areaHa float64,
) (int, error) {

	var applicationID int

	err := repo.db.QueryRow(context.Background(), `
		INSERT INTO subsidy_applications
			(round_id, farmer_id, land_id, land_crop_id, area_ha, farmer_note)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING application_id
	`, req.RoundID, req.FarmerID, landID, req.LandCropID,
		areaHa, req.FarmerNote).Scan(&applicationID)

	return applicationID, err
}

// FindApplication loads one application.
//
// division "" means no division limit, which is what a department officer
// and the owning farmer get. farmerID 0 means no owner limit.
func (repo *SubsidyRepository) FindApplication(
	applicationID int, division string, farmerID int,
) (model.SubsidyApplication, error) {

	query := `SELECT ` + applicationColumns + applicationJoins + `
		WHERE a.application_id = $1
		  AND ($2 = '' OR LOWER(TRIM(f.gn_division)) = LOWER(TRIM($2)))
		  AND ($3 = 0  OR a.farmer_id = $3)
	`

	var a model.SubsidyApplication

	err := scanApplication(
		repo.db.QueryRow(
			context.Background(), query, applicationID, division, farmerID,
		), &a,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return model.SubsidyApplication{}, ErrApplicationNotFound
	}

	return a, err
}

// ListApplications returns applications, filtered.
//
// Empty string or zero means "no filter" for each.
func (repo *SubsidyRepository) ListApplications(
	division string, status string, farmerID int, roundID int,
) ([]model.SubsidyApplication, error) {

	query := `SELECT ` + applicationColumns + applicationJoins + `
		WHERE ($1 = '' OR LOWER(TRIM(f.gn_division)) = LOWER(TRIM($1)))
		  AND ($2 = '' OR a.status = $2)
		  AND ($3 = 0  OR a.farmer_id = $3)
		  AND ($4 = 0  OR a.round_id = $4)
		ORDER BY a.created_at DESC
	`

	rows, err := repo.db.Query(
		context.Background(), query, division, status, farmerID, roundID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	applications := []model.SubsidyApplication{}

	for rows.Next() {
		var a model.SubsidyApplication
		if err := scanApplication(rows, &a); err != nil {
			return nil, err
		}
		applications = append(applications, a)
	}

	return applications, rows.Err()
}

// Transition moves an application to a new status and records who did it.
//
// A TRANSACTION, and the old status is part of the WHERE clause.
//
// WHY THAT MATTERS HERE ESPECIALLY. A farmer could tap "I received it" at
// the same moment the department is marking a dispute resolved. Without the
// status check, the second write would overwrite the first and the audit
// trail would show two moves from a state the application had already left.
// With it, the loser is told that somebody got there first.
func (repo *SubsidyRepository) Transition(
	applicationID int,
	actorID int,
	fromStatus string,
	toStatus string,
	note string,
	amount *float64,
) error {

	ctx := context.Background()

	tx, err := repo.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// COALESCE keeps the existing amount when we are not setting one, so a
	// later step cannot wipe what approval worked out.
	result, err := tx.Exec(ctx, `
		UPDATE subsidy_applications
		SET status     = $1,
		    amount_lkr = COALESCE($2, amount_lkr),
		    updated_at = NOW()
		WHERE application_id = $3 AND status = $4
	`, toStatus, amount, applicationID, fromStatus)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrApplicationNotFound
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO subsidy_events
			(application_id, actor_id, from_status, to_status, note)
		VALUES ($1, $2, $3, $4, $5)
	`, applicationID, actorID, fromStatus, toStatus, note)

	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// ApplicationHistory returns everything that has happened to one application.
func (repo *SubsidyRepository) ApplicationHistory(
	applicationID int,
) ([]model.SubsidyEvent, error) {

	rows, err := repo.db.Query(context.Background(), `
		SELECT e.subsidy_event_id, e.application_id, e.actor_id,
		       COALESCE(f.full_name, ''), COALESCE(f.role, ''),
		       e.from_status, e.to_status, e.note, e.created_at
		FROM subsidy_events e
		LEFT JOIN farmers f ON f.farmer_id = e.actor_id
		WHERE e.application_id = $1
		ORDER BY e.created_at DESC, e.subsidy_event_id DESC
	`, applicationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	history := []model.SubsidyEvent{}

	for rows.Next() {
		var e model.SubsidyEvent
		err := rows.Scan(
			&e.SubsidyEventID, &e.ApplicationID, &e.ActorID, &e.ActorName,
			&e.ActorRole, &e.FromStatus, &e.ToStatus, &e.Note, &e.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		history = append(history, e)
	}

	return history, rows.Err()
}

// ApplicationExists says whether this crop has already been applied for in
// this round.
//
// The database refuses a duplicate anyway through the UNIQUE constraint.
// Checking first lets us say "you have already applied for this crop"
// instead of returning a constraint violation the farmer cannot read.
func (repo *SubsidyRepository) ApplicationExists(
	roundID int, landCropID int,
) (bool, error) {

	var exists bool

	err := repo.db.QueryRow(context.Background(), `
		SELECT EXISTS (
			SELECT 1 FROM subsidy_applications
			WHERE round_id = $1 AND land_crop_id = $2
		)
	`, roundID, landCropID).Scan(&exists)

	return exists, err
}
