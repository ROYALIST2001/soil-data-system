package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/model"
)

// ErrEventNotFound means no such disaster event.
var ErrEventNotFound = errors.New("disaster event not found")

// ErrClaimNotFound means no such claim, or it is outside the caller's reach.
// One error for both, so the API never confirms that a claim exists
// somewhere the caller may not look.
var ErrClaimNotFound = errors.New("claim not found")

// DisasterRepository stores disaster events and compensation claims.
type DisasterRepository struct {
	db *pgxpool.Pool
}

// NewDisasterRepository builds the repository.
func NewDisasterRepository(db *pgxpool.Pool) *DisasterRepository {
	return &DisasterRepository{db: db}
}

// ---------- DISASTER EVENTS ----------

// InsertEvent declares a disaster, with its divisions and rates.
//
// A TRANSACTION, because an event is meaningless without the other two.
// An event with no divisions lets nobody claim; an event with no rates pays
// nothing. Saving one without the others would leave a relief scheme that
// looks declared but cannot actually work, and nobody would know until a
// farmer tried to use it.
func (repo *DisasterRepository) InsertEvent(
	declaredBy int,
	req model.DeclareEventRequest,
) (int, error) {

	ctx := context.Background()

	tx, err := repo.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var eventID int

	err = tx.QueryRow(ctx, `
		INSERT INTO disaster_events
			(name, disaster_type, started_on, ended_on, description,
			 declared_by)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING event_id
	`, req.Name, req.DisasterType, req.StartedOn, req.EndedOn,
		req.Description, declaredBy).Scan(&eventID)

	if err != nil {
		return 0, err
	}

	for _, division := range req.Divisions {
		_, err := tx.Exec(ctx, `
			INSERT INTO disaster_event_divisions (event_id, gn_division)
			VALUES ($1, $2)
		`, eventID, division)
		if err != nil {
			return 0, err
		}
	}

	for _, rate := range req.Rates {
		_, err := tx.Exec(ctx, `
			INSERT INTO disaster_event_rates
				(event_id, crop, rate_per_hectare)
			VALUES ($1, $2, $3)
		`, eventID, rate.Crop, rate.RatePerHectare)
		if err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	return eventID, nil
}

// FindEvent loads one event with its divisions and rates.
func (repo *DisasterRepository) FindEvent(
	eventID int,
) (model.DisasterEvent, error) {

	ctx := context.Background()

	var e model.DisasterEvent

	err := repo.db.QueryRow(ctx, `
		SELECT e.event_id, e.name, e.disaster_type,
		       TO_CHAR(e.started_on, 'YYYY-MM-DD'),
		       TO_CHAR(e.ended_on, 'YYYY-MM-DD'),
		       e.description, e.status, e.declared_by,
		       COALESCE(f.full_name, ''), e.declared_at,
		       (SELECT COUNT(*) FROM claims c WHERE c.event_id = e.event_id),
		       (SELECT COALESCE(SUM(c.amount_lkr), 0) FROM claims c
		         WHERE c.event_id = e.event_id AND c.status IN ('APPROVED','PAID'))
		FROM disaster_events e
		LEFT JOIN farmers f ON f.farmer_id = e.declared_by
		WHERE e.event_id = $1
	`, eventID).Scan(
		&e.EventID, &e.Name, &e.DisasterType, &e.StartedOn, &e.EndedOn,
		&e.Description, &e.Status, &e.DeclaredBy, &e.DeclaredName,
		&e.DeclaredAt, &e.ClaimCount, &e.TotalAmount,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return model.DisasterEvent{}, ErrEventNotFound
	}
	if err != nil {
		return model.DisasterEvent{}, err
	}

	if e.Divisions, err = repo.eventDivisions(eventID); err != nil {
		return model.DisasterEvent{}, err
	}
	if e.Rates, err = repo.eventRates(eventID); err != nil {
		return model.DisasterEvent{}, err
	}

	return e, nil
}

func (repo *DisasterRepository) eventDivisions(
	eventID int,
) ([]string, error) {

	rows, err := repo.db.Query(context.Background(), `
		SELECT gn_division FROM disaster_event_divisions
		WHERE event_id = $1 ORDER BY gn_division
	`, eventID)
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

func (repo *DisasterRepository) eventRates(
	eventID int,
) ([]model.EventRate, error) {

	rows, err := repo.db.Query(context.Background(), `
		SELECT crop, rate_per_hectare FROM disaster_event_rates
		WHERE event_id = $1 ORDER BY crop
	`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rates := []model.EventRate{}

	for rows.Next() {
		var r model.EventRate
		if err := rows.Scan(&r.Crop, &r.RatePerHectare); err != nil {
			return nil, err
		}
		rates = append(rates, r)
	}

	return rates, rows.Err()
}

// ListEvents returns events, optionally only those affecting one division.
//
// division "" means every event, which is what a department officer sees.
func (repo *DisasterRepository) ListEvents(
	division string, openOnly bool,
) ([]model.DisasterEvent, error) {

	query := `
		SELECT e.event_id, e.name, e.disaster_type,
		       TO_CHAR(e.started_on, 'YYYY-MM-DD'),
		       TO_CHAR(e.ended_on, 'YYYY-MM-DD'),
		       e.description, e.status, e.declared_by,
		       COALESCE(f.full_name, ''), e.declared_at,
		       (SELECT COUNT(*) FROM claims c WHERE c.event_id = e.event_id),
		       (SELECT COALESCE(SUM(c.amount_lkr), 0) FROM claims c
		         WHERE c.event_id = e.event_id
		           AND c.status IN ('APPROVED','PAID'))
		FROM disaster_events e
		LEFT JOIN farmers f ON f.farmer_id = e.declared_by
		WHERE ($1 = '' OR EXISTS (
		          SELECT 1 FROM disaster_event_divisions d
		          WHERE d.event_id = e.event_id
		            AND LOWER(TRIM(d.gn_division)) = LOWER(TRIM($1))))
		  AND ($2 = false OR e.status = 'OPEN')
		ORDER BY e.started_on DESC, e.event_id DESC
	`

	rows, err := repo.db.Query(context.Background(), query, division, openOnly)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []model.DisasterEvent{}

	for rows.Next() {
		var e model.DisasterEvent
		err := rows.Scan(
			&e.EventID, &e.Name, &e.DisasterType, &e.StartedOn, &e.EndedOn,
			&e.Description, &e.Status, &e.DeclaredBy, &e.DeclaredName,
			&e.DeclaredAt, &e.ClaimCount, &e.TotalAmount,
		)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Fill in the details. Two extra queries per event is acceptable for a
	// list that holds a handful of declared disasters, and it keeps the
	// main query readable.
	for i := range events {
		if events[i].Divisions, err = repo.eventDivisions(
			events[i].EventID,
		); err != nil {
			return nil, err
		}
		if events[i].Rates, err = repo.eventRates(
			events[i].EventID,
		); err != nil {
			return nil, err
		}
	}

	return events, nil
}

// SetEventStatus opens or closes an event.
func (repo *DisasterRepository) SetEventStatus(
	eventID int, status string,
) error {

	result, err := repo.db.Exec(context.Background(), `
		UPDATE disaster_events SET status = $1 WHERE event_id = $2
	`, status, eventID)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrEventNotFound
	}

	return nil
}

// RateForCrop returns the rupees per hectare for one crop under one event.
//
// found is false when this event has no rate for that crop, which means the
// scheme does not cover it. That is a real answer, not an error.
func (repo *DisasterRepository) RateForCrop(
	eventID int, crop string,
) (rate float64, found bool, err error) {

	err = repo.db.QueryRow(context.Background(), `
		SELECT rate_per_hectare FROM disaster_event_rates
		WHERE event_id = $1 AND crop = $2
	`, eventID, crop).Scan(&rate)

	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}

	return rate, true, nil
}

// DivisionCovered says whether an event covers a division.
func (repo *DisasterRepository) DivisionCovered(
	eventID int, division string,
) (bool, error) {

	var covered bool

	err := repo.db.QueryRow(context.Background(), `
		SELECT EXISTS (
			SELECT 1 FROM disaster_event_divisions
			WHERE event_id = $1
			  AND LOWER(TRIM(gn_division)) = LOWER(TRIM($2))
		)
	`, eventID, division).Scan(&covered)

	return covered, err
}

// ---------- CLAIMS ----------

// The columns every claim query reads, written once.
//
// Five queries used to need this list. Writing it five times is five chances
// for one to drift out of step with the Scan that follows it.
const claimColumns = `
	c.claim_id, c.event_id, e.name,
	c.farmer_id, COALESCE(f.full_name, ''),
	COALESCE(TRIM(f.gn_division), ''), COALESCE(f.mobile, ''),
	c.land_id, COALESCE(l.name, ''), c.land_crop_id, COALESCE(lc.crop, ''),
	COALESCE(lc.size_ha, 0),
	c.claimed_area_ha, c.verified_area_ha, c.amount_lkr,
	(SELECT r.rate_per_hectare FROM disaster_event_rates r
	  WHERE r.event_id = c.event_id AND r.crop = lc.crop),
	c.farmer_note, c.status, c.created_at, c.updated_at
`

const claimJoins = `
	FROM claims c
	JOIN disaster_events e ON e.event_id = c.event_id
	LEFT JOIN farmers    f  ON f.farmer_id = c.farmer_id
	LEFT JOIN lands      l  ON l.land_id = c.land_id
	LEFT JOIN land_crops lc ON lc.land_crop_id = c.land_crop_id
`

func scanClaim(row pgx.Row, c *model.Claim) error {
	return row.Scan(
		&c.ClaimID, &c.EventID, &c.EventName,
		&c.FarmerID, &c.FarmerName, &c.GNDivision, &c.FarmerPhone,
		&c.LandID, &c.LandName, &c.LandCropID, &c.Crop,
		&c.RegisteredAreaHa,
		&c.ClaimedAreaHa, &c.VerifiedAreaHa, &c.AmountLKR,
		&c.RatePerHectare,
		&c.FarmerNote, &c.Status, &c.CreatedAt, &c.UpdatedAt,
	)
}

// InsertClaim files a new claim.
func (repo *DisasterRepository) InsertClaim(
	req model.SubmitClaimRequest, landID int,
) (int, error) {

	var claimID int

	err := repo.db.QueryRow(context.Background(), `
		INSERT INTO claims
			(event_id, farmer_id, land_id, land_crop_id,
			 claimed_area_ha, farmer_note)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING claim_id
	`, req.EventID, req.FarmerID, landID, req.LandCropID,
		req.ClaimedAreaHa, req.FarmerNote).Scan(&claimID)

	return claimID, err
}

// FindClaim loads one claim, optionally restricted to a division.
func (repo *DisasterRepository) FindClaim(
	claimID int, division string,
) (model.Claim, error) {

	query := `SELECT ` + claimColumns + claimJoins + `
		WHERE c.claim_id = $1
		  AND ($2 = '' OR LOWER(TRIM(f.gn_division)) = LOWER(TRIM($2)))
	`

	var c model.Claim

	err := scanClaim(
		repo.db.QueryRow(context.Background(), query, claimID, division), &c,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return model.Claim{}, ErrClaimNotFound
	}

	return c, err
}

// ListClaims returns claims, filtered by division, status and farmer.
//
// Empty string or zero means "no filter" for each.
func (repo *DisasterRepository) ListClaims(
	division string, status string, farmerID int, eventID int,
) ([]model.Claim, error) {

	query := `SELECT ` + claimColumns + claimJoins + `
		WHERE ($1 = '' OR LOWER(TRIM(f.gn_division)) = LOWER(TRIM($1)))
		  AND ($2 = '' OR c.status = $2)
		  AND ($3 = 0  OR c.farmer_id = $3)
		  AND ($4 = 0  OR c.event_id = $4)
		ORDER BY c.created_at DESC
	`

	rows, err := repo.db.Query(
		context.Background(), query, division, status, farmerID, eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	claims := []model.Claim{}

	for rows.Next() {
		var c model.Claim
		if err := scanClaim(rows, &c); err != nil {
			return nil, err
		}
		claims = append(claims, c)
	}

	return claims, rows.Err()
}

// Transition moves a claim to a new status and records who did it.
//
// A TRANSACTION, and the old status is part of the WHERE clause.
//
// WHY THAT MATTERS. Two officers could open the same claim and both press
// Approve. Without the status check, the second press would approve an
// already-approved claim and write a second audit row - and in a scheme that
// pays money, a double approval is exactly the bug that must not exist.
//
// With it, the second UPDATE matches no rows, and we can tell the officer
// that somebody got there first.
func (repo *DisasterRepository) Transition(
	claimID int,
	actorID int,
	fromStatus string,
	toStatus string,
	note string,
	verifiedArea *float64,
	amount *float64,
) error {

	ctx := context.Background()

	tx, err := repo.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// COALESCE keeps the existing value when we are not setting one, so a
	// later step cannot wipe what an earlier one recorded.
	result, err := tx.Exec(ctx, `
		UPDATE claims
		SET status           = $1,
		    verified_area_ha = COALESCE($2, verified_area_ha),
		    amount_lkr       = COALESCE($3, amount_lkr),
		    updated_at       = NOW()
		WHERE claim_id = $4 AND status = $5
	`, toStatus, verifiedArea, amount, claimID, fromStatus)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		// Either no such claim, or somebody already moved it on.
		return ErrClaimNotFound
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO claim_events
			(claim_id, actor_id, from_status, to_status, note)
		VALUES ($1, $2, $3, $4, $5)
	`, claimID, actorID, fromStatus, toStatus, note)

	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// ClaimHistory returns everything that has happened to one claim.
func (repo *DisasterRepository) ClaimHistory(
	claimID int,
) ([]model.ClaimEvent, error) {

	rows, err := repo.db.Query(context.Background(), `
		SELECT ce.claim_event_id, ce.claim_id, ce.actor_id,
		       COALESCE(f.full_name, ''), COALESCE(f.role, ''),
		       ce.from_status, ce.to_status, ce.note, ce.created_at
		FROM claim_events ce
		LEFT JOIN farmers f ON f.farmer_id = ce.actor_id
		WHERE ce.claim_id = $1
		ORDER BY ce.created_at DESC, ce.claim_event_id DESC
	`, claimID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	history := []model.ClaimEvent{}

	for rows.Next() {
		var e model.ClaimEvent
		err := rows.Scan(
			&e.ClaimEventID, &e.ClaimID, &e.ActorID, &e.ActorName,
			&e.ActorRole, &e.FromStatus, &e.ToStatus, &e.Note, &e.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		history = append(history, e)
	}

	return history, rows.Err()
}

// ClaimExists says whether this crop has already been claimed for this
// disaster.
//
// The database refuses a duplicate anyway through the UNIQUE constraint.
// Checking first simply lets us say "you have already claimed for this crop"
// instead of returning a constraint violation the farmer cannot read.
func (repo *DisasterRepository) ClaimExists(
	eventID int, landCropID int,
) (bool, error) {

	var exists bool

	err := repo.db.QueryRow(context.Background(), `
		SELECT EXISTS (
			SELECT 1 FROM claims
			WHERE event_id = $1 AND land_crop_id = $2
		)
	`, eventID, landCropID).Scan(&exists)

	return exists, err
}
