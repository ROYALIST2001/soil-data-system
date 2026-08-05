package database

import (
	"context"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Connect opens a pool of connections to PostgreSQL.
func Connect() *pgxpool.Pool {
	// Read the database address from the environment.
	url := os.Getenv("DATABASE_URL")

	// Create the connection pool.
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		// If we cannot connect, stop the program and show the error.
		log.Fatal("Cannot connect to database: ", err)
	}

	return pool
}