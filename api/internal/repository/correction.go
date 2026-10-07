package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/model"
)

// ErrReadingNotFound means no such reading, or it is outside the officer's
// division. One error for both, so the API never confirms that a reading
// exists somewhere the caller may not look.
var ErrReadingNotFound = errors.New("reading not found")

// CorrectionRepository stores officer corrections.
type CorrectionRepository struct {
	db *pgxpool.Pool
}

// NewCorrectionRepository builds the repository.
func NewCorrectionRepository(db *pgxpool.Pool) *CorrectionRepository {
	return &CorrectionRepository{db: db}
}

// FindReadingInDivision loads one reading, but only from the division the
// officer is allowed to touch.
//
// The division is in the WHERE clause, so a reading belonging to another
// division is simply not found. There is no separate permission check that
// a later edit could forget to call.
//
// Note the COALESCE: this returns the value to SHOW, which is the correction
// when there is one. The screen should display the number in force, not a
// superseded one.
func (repo *CorrectionRepository) FindReadingInDivision(
	readingID int, division string,
) (model.ReadingRow, error) {

	query := `
		SELECT
			r.reading_id, r.farmer_id,
			COALESCE(f.full_name, ''), COALESCE(TRIM(f.gn_division), ''),
			COALESCE(l.name, ''),
			r.crop, r.stage,
			COALESCE(r.corrected_n, r.n),
			COALESCE(r.corrected_p, r.p),
			COALESCE(r.corrected_k, r.k),
			COALESCE(r.corrected_ph, r.ph),
			r.area,
			COALESCE(r.officer_flag, r.quality_flag),
			r.agent_note, r.raw_lat, r.raw_lng, r.created_at
		FROM readings r
		LEFT JOIN farmers f ON f.farmer_id = r.farmer_id
		LEFT JOIN lands   l ON l.land_id   = r.land_id
		WHERE r.reading_id = $1
		  AND ($2 = '' OR LOWER(TRIM(f.gn_division)) = LOWER(TRIM($2)))
	`

	var rr model.ReadingRow

	err := repo.db.QueryRow(context.Background(), query, readingID, division).
		Scan(
			&rr.ReadingID, &rr.FarmerID,
			&rr.FarmerName, &rr.GNDivision, &rr.LandName,
			&rr.Crop, &rr.Stage,
			&rr.N, &rr.P, &rr.K, &rr.PH, &rr.Area,
			&rr.QualityFlag, &rr.AgentNote,
			&rr.RawLat, &rr.RawLng, &rr.CreatedAt,
		)

	if errors.Is(err, pgx.ErrNoRows) {
		return model.ReadingRow{}, ErrReadingNotFound
	}

	return rr, err
}

// RawValues returns what is actually stored, original and corrected apart.
//
// FindReadingInDivision above hides the difference behind COALESCE, which is
// right for showing a value. But to RECORD a change we must know what the
// previous value really was, so this keeps the two separate.
func (repo *CorrectionRepository) RawValues(
	readingID int,
) (model.ReadingValues, error) {

	query := `
		SELECT n, p, k, ph, quality_flag,
		       corrected_n, corrected_p, corrected_k, corrected_ph,
		       officer_flag
		FROM readings
		WHERE reading_id = $1
	`

	var v model.ReadingValues

	err := repo.db.QueryRow(context.Background(), query, readingID).Scan(
		&v.N, &v.P, &v.K, &v.PH, &v.QualityFlag,
		&v.CorrectedN, &v.CorrectedP, &v.CorrectedK, &v.CorrectedPH,
		&v.OfficerFlag,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return model.ReadingValues{}, ErrReadingNotFound
	}

	return v, err
}

// ApplyCorrection writes the corrected values AND the audit rows together.
//
// WHY A TRANSACTION.
// Two things must become true at the same moment: the value changed, and
// there is a record saying who changed it and why. If the value were saved
// and the audit row then failed, we would have an unexplained change in
// government data - exactly what this whole design exists to prevent.
//
// A transaction means both happen, or neither does.
func (repo *CorrectionRepository) ApplyCorrection(
	readingID int,
	officerID int,
	reason string,
	changes []model.FieldChange,
) error {

	ctx := context.Background()

	tx, err := repo.db.Begin(ctx)
	if err != nil {
		return err
	}
	// Runs on every exit path. Harmless after a successful commit.
	defer tx.Rollback(ctx)

	for _, c := range changes {

		// The column name is chosen by THIS switch, never taken from the
		// request. A caller cannot name a column.
		var column string
		switch c.Field {
		case "n":
			column = "corrected_n"
		case "p":
			column = "corrected_p"
		case "k":
			column = "corrected_k"
		case "ph":
			column = "corrected_ph"
		case "flag":
			column = "officer_flag"
		default:
			return errors.New("unknown field: " + c.Field)
		}

		// The column name has to be built into the string, because SQL does
		// not allow a parameter in that position. It is safe ONLY because
		// the switch above limits it to five fixed words. The VALUE is still
		// a parameter, so nothing a caller types ever reaches the SQL.
		update := "UPDATE readings SET " + column + " = $1 WHERE reading_id = $2"

		if _, err := tx.Exec(ctx, update, c.NewValue, readingID); err != nil {
			return err
		}

		audit := `
			INSERT INTO reading_corrections
				(reading_id, officer_id, field_name, old_value, new_value,
				 reason)
			VALUES ($1, $2, $3, $4, $5, $6)
		`

		_, err := tx.Exec(
			ctx, audit,
			readingID, officerID, c.Field, c.OldValue, c.NewValue, reason,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// ListCorrections returns the history of one reading, newest first.
func (repo *CorrectionRepository) ListCorrections(
	readingID int,
) ([]model.Correction, error) {

	query := `
		SELECT c.correction_id, c.reading_id, c.officer_id,
		       COALESCE(f.full_name, ''),
		       c.field_name, c.old_value, c.new_value, c.reason, c.created_at
		FROM reading_corrections c
		LEFT JOIN farmers f ON f.farmer_id = c.officer_id
		WHERE c.reading_id = $1
		ORDER BY c.created_at DESC
	`

	rows, err := repo.db.Query(context.Background(), query, readingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []model.Correction{}

	for rows.Next() {
		var c model.Correction
		err := rows.Scan(
			&c.CorrectionID, &c.ReadingID, &c.OfficerID, &c.OfficerName,
			&c.FieldName, &c.OldValue, &c.NewValue, &c.Reason, &c.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		result = append(result, c)
	}

	return result, rows.Err()
}
