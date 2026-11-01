package controller

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// The roles the system knows. Constants, not loose text, so a typing mistake
// like "DEPT_OFICER" is caught by the compiler instead of silently never
// matching and quietly letting somebody through.
const (
	RoleFarmer       = "FARMER"
	RoleGNOfficer    = "GN_OFFICER"
	RoleDeptOfficer  = "DEPT_OFFICER"
)

// contextKey is a private type for the value we hang on the request.
//
// WHY A PRIVATE TYPE AND NOT A PLAIN STRING?
// Context keys are compared by value AND type. If we used the string
// "account", any other package could overwrite it by accident with its own
// "account". A type only this package can name makes that impossible.
type contextKey struct{ name string }

var accountKey = contextKey{"account"}

// AuthMiddleware proves who is calling, using the token they sent.
type AuthMiddleware struct {
	sessions *repository.SessionRepository
}

// NewAuthMiddleware builds the middleware.
func NewAuthMiddleware(
	sessions *repository.SessionRepository,
) *AuthMiddleware {
	return &AuthMiddleware{sessions: sessions}
}

// AccountFrom pulls the logged-in account back out of the request.
//
// The second value is false when there is none, so a handler can never
// accidentally use an empty account as if it were a real one.
func AccountFrom(r *http.Request) (model.Farmer, bool) {
	account, ok := r.Context().Value(accountKey).(model.Farmer)
	return account, ok
}

// writeJSONError is the one place an auth failure is written.
func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// RequireAuth wraps a handler so it only runs for a caller with a valid token.
//
// HOW THIS REPLACES THE OLD ARRANGEMENT.
// Before, a request said "I am farmer 2" and the server believed it. Now the
// request carries a token, the server looks up which account it belongs to,
// and the handler reads the account from the context. The caller never gets
// to choose who they are.
func (m *AuthMiddleware) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		header := r.Header.Get("Authorization")

		// The expected shape is: Authorization: Bearer <token>
		const prefix = "Bearer "

		if !strings.HasPrefix(header, prefix) {
			writeJSONError(w, http.StatusUnauthorized,
				"Please log in first.")
			return
		}

		token := strings.TrimSpace(strings.TrimPrefix(header, prefix))
		if token == "" {
			writeJSONError(w, http.StatusUnauthorized,
				"Please log in first.")
			return
		}

		account, err := m.sessions.FindAccount(token)

		if errors.Is(err, repository.ErrSessionNotFound) {
			// Unknown or expired. The caller does the same thing either
			// way, so we say the same thing either way.
			writeJSONError(w, http.StatusUnauthorized,
				"Your login has expired. Please log in again.")
			return
		}

		if err != nil {
			writeJSONError(w, http.StatusInternalServerError,
				"Something went wrong. Please try again.")
			return
		}

		// Hand the account to the handler through the request context.
		ctx := context.WithValue(r.Context(), accountKey, account)
		next(w, r.WithContext(ctx))
	}
}

// RequireRole wraps a handler so only the listed roles may reach it.
//
// ALWAYS USED ON TOP OF RequireAuth, never instead of it. Authentication is
// "who are you"; authorisation is "may you do this". Mixing the two into one
// check is how systems end up letting a logged-in nobody do everything.
func (m *AuthMiddleware) RequireRole(
	allowed []string,
	next http.HandlerFunc,
) http.HandlerFunc {

	return m.RequireAuth(func(w http.ResponseWriter, r *http.Request) {

		account, ok := AccountFrom(r)
		if !ok {
			// Cannot happen, because RequireAuth put it there. But an
			// assumption that goes wrong silently is worse than one that
			// stops, so we check anyway.
			writeJSONError(w, http.StatusUnauthorized, "Please log in first.")
			return
		}

		for _, role := range allowed {
			if account.Role == role {
				next(w, r)
				return
			}
		}

		// Logged in, but not allowed. 403, not 401 - logging in again
		// would not help them, and saying so would only be confusing.
		writeJSONError(w, http.StatusForbidden,
			"Your account does not have access to this.")
	})
}

// RequireOfficer is the common case: either kind of officer, no farmers.
func (m *AuthMiddleware) RequireOfficer(next http.HandlerFunc) http.HandlerFunc {
	return m.RequireRole([]string{RoleGNOfficer, RoleDeptOfficer}, next)
}
