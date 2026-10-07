package repository

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/model"
)

// ErrSessionNotFound means the token is unknown, or it has expired.
//
// ONE error for both, deliberately. "Expired" and "never existed" are the
// same answer as far as the caller is concerned: log in again. Telling them
// apart would only help somebody guessing tokens.
var ErrSessionNotFound = errors.New("session not found")

// How long a login lasts before the farmer or officer must log in again.
//
// 30 days suits a farmer who opens the app now and then. It is the same
// trade-off every app makes: too short and people are forever logging in,
// too long and a lost phone stays useful to whoever found it.
const SessionDuration = 30 * 24 * time.Hour

// SessionRepository holds the database connection.
type SessionRepository struct {
	db *pgxpool.Pool
}

// NewSessionRepository builds the repository.
func NewSessionRepository(db *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{db: db}
}

// newToken makes a long random string to use as a session token.
//
// crypto/rand, NOT math/rand.
//
// math/rand is predictable: given a few of its numbers you can work out the
// rest. For a token that is the whole ballgame - anyone who could predict the
// next one could log in as the next person. crypto/rand asks the operating
// system for genuinely unpredictable bytes.
//
// 32 bytes is 256 bits. Guessing one is not something anybody is going to do.
func newToken() (string, error) {
	raw := make([]byte, 32)

	if _, err := rand.Read(raw); err != nil {
		// If the system cannot give us randomness, we must NOT fall back to
		// something weaker. Failing to log in is correct here.
		return "", err
	}

	// URL-safe, so the token is sent in a header without any escaping.
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// Create starts a new session and returns the token.
func (repo *SessionRepository) Create(farmerID int) (string, time.Time, error) {

	token, err := newToken()
	if err != nil {
		return "", time.Time{}, err
	}

	expiresAt := time.Now().Add(SessionDuration)

	query := `
		INSERT INTO sessions (token, farmer_id, expires_at)
		VALUES ($1, $2, $3)
	`

	_, err = repo.db.Exec(
		context.Background(), query, token, farmerID, expiresAt,
	)
	if err != nil {
		return "", time.Time{}, err
	}

	return token, expiresAt, nil
}

// FindAccount returns the account this token belongs to.
//
// THE EXPIRY IS CHECKED IN THE SQL, not in Go afterwards.
//
// If we fetched the row and then compared dates in Go, there would be a code
// path that could forget to compare. Putting it in the WHERE clause means an
// expired session simply is not found, and no amount of careless editing
// later can skip the check.
func (repo *SessionRepository) FindAccount(
	token string,
) (model.Farmer, error) {

	query := `
		SELECT f.farmer_id, f.nic, f.full_name, f.gn_division, f.mobile,
		       f.email, f.password_hash, f.created_at, f.role, f.scope_division
		FROM sessions s
		JOIN farmers f ON f.farmer_id = s.farmer_id
		WHERE s.token = $1 AND s.expires_at > NOW()
	`

	var f model.Farmer

	err := repo.db.QueryRow(context.Background(), query, token).Scan(
		&f.FarmerID, &f.NIC, &f.FullName, &f.GNDivision, &f.Mobile,
		&f.Email, &f.PasswordHash, &f.CreatedAt, &f.Role, &f.ScopeDivision,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return model.Farmer{}, ErrSessionNotFound
	}
	if err != nil {
		return model.Farmer{}, err
	}

	return f, nil
}

// Delete ends one session. This is what logging out does.
func (repo *SessionRepository) Delete(token string) error {
	query := `DELETE FROM sessions WHERE token = $1`

	_, err := repo.db.Exec(context.Background(), query, token)
	return err
}

// DeleteExpired clears out sessions that have already run out.
//
// Nothing breaks without this - expired tokens are already refused by
// FindAccount. It just stops the table growing forever. We call it at
// startup rather than running a scheduled job, which would be more
// machinery than this project needs.
func (repo *SessionRepository) DeleteExpired() (int64, error) {
	query := `DELETE FROM sessions WHERE expires_at <= NOW()`

	result, err := repo.db.Exec(context.Background(), query)
	if err != nil {
		return 0, err
	}

	return result.RowsAffected(), nil
}
