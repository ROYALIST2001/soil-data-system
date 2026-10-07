package controller

import (
	"net/http"
	"os"
	"strings"
)

// CORS: letting the dashboard website talk to this API.
//
// WHY THIS IS NEEDED AT ALL.
// A browser refuses to let a page at one address read a reply from another
// address, unless the server says it is allowed. That rule is what stops a
// random website quietly reading your bank's API using your logged-in
// browser. It is a good rule.
//
// Our dashboard runs at localhost:5173 while developing, and the API at
// localhost:8080. Different port means different origin, so without these
// headers the browser blocks every single request - and the error it shows
// in the console blames CORS rather than anything a beginner would guess.
//
// The phone app is NOT affected: this rule is enforced by browsers only.
// That is exactly why the API worked fine for nine phases without it.

// Which websites may call this API.
//
// A FIXED LIST, NOT "*". The wildcard would let any website on the internet
// call this API with a logged-in officer's browser. For an API that can edit
// farmers' data, naming the one place we trust is the only sane choice.
//
// Overridable through the environment so the real deployment address does
// not have to be compiled in.
func allowedOrigins() []string {
	if fromEnv := os.Getenv("DASHBOARD_ORIGINS"); fromEnv != "" {
		parts := strings.Split(fromEnv, ",")
		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}
		return parts
	}

	return []string{
		"http://localhost:5173", // Vite's default while developing
		"http://127.0.0.1:5173",
	}
}

// WithCORS wraps the whole router so every route answers correctly.
func WithCORS(next http.Handler) http.Handler {
	origins := allowedOrigins()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		origin := r.Header.Get("Origin")

		// Echo the origin back ONLY if it is one we trust. We echo rather
		// than listing them all because a browser accepts exactly one value
		// here, and because Allow-Credentials may not be combined with "*".
		for _, allowed := range origins {
			if origin == allowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				break
			}
		}

		// Vary tells caches that the answer depends on which site asked.
		// Without it, a cache could hand one site's permission to another.
		w.Header().Add("Vary", "Origin")

		w.Header().Set("Access-Control-Allow-Methods",
			"GET, POST, PUT, DELETE, OPTIONS")

		// Authorization MUST be listed, or the browser strips our token
		// before the request is even sent.
		w.Header().Set("Access-Control-Allow-Headers",
			"Content-Type, Authorization")

		// How long the browser may remember this permission, so it stops
		// sending a preflight before every single request.
		w.Header().Set("Access-Control-Max-Age", "600")

		// THE PREFLIGHT.
		//
		// Before a request that carries an Authorization header, the browser
		// first sends an OPTIONS request asking whether it is allowed. If we
		// do not answer that, the real request never happens - and the
		// failure looks like the server is down rather than refusing.
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent) // 204
			return
		}

		next.ServeHTTP(w, r)
	})
}
