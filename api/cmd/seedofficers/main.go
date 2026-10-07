// Command seedofficers creates the officer accounts for the dashboards.
//
// WHY THIS IS A PROGRAM AND NOT A MIGRATION.
//
// An officer account needs a password, and a password must be stored as a
// bcrypt hash. Hashes cannot be written by hand in a .sql file: bcrypt mixes
// in a random salt, so the correct hash is different every time and can only
// be produced by running the same code that checks it at login.
//
// Writing a hash into a migration would mean copying one from somewhere,
// which means the password is known to whoever it was copied from - and it
// would be in Git forever.
//
// WHY NOT A SIGN-UP SCREEN FOR OFFICERS.
// Because then anybody who can reach the API could make themselves a
// department officer. Government accounts are handed out, never claimed.
//
// Run it with:
//
//	docker compose exec api ./seedofficers
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"golang.org/x/crypto/bcrypt"

	"soil-data-system/api/internal/database"
)

// One account to create.
type officer struct {
	NIC      string
	Name     string
	Role     string
	Division string // empty for the department officer
	Mobile   string
	Email    string
	Password string
}

// The accounts this creates.
//
// The passwords are deliberately simple and PRINTED when the command runs,
// because this is a demonstration system. A real deployment would generate a
// random password per officer, show it once, and force a change at first
// login. Say so in the report rather than implying otherwise.
var officers = []officer{
	{
		NIC:      "DEPT0000001",
		Name:     "Department of Agriculture",
		Role:     "DEPT_OFFICER",
		Division: "",
		Mobile:   "0112345678",
		Email:    "dept@agri.gov.lk",
		Password: "dept1234",
	},
	{
		NIC:      "GNO00000001",
		Name:     "Gettuwana Division Officer",
		Role:     "GN_OFFICER",
		Division: "Gettuwana",
		Mobile:   "0712345678",
		Email:    "gettuwana@agri.gov.lk",
		Password: "gn1234",
	},
	{
		NIC:      "GNO00000002",
		Name:     "Thalawa North Division Officer",
		Role:     "GN_OFFICER",
		Division: "Thalawa North",
		Mobile:   "0723456789",
		Email:    "thalawa@agri.gov.lk",
		Password: "gn1234",
	},
}

func main() {
	db := database.Connect()
	defer db.Close()

	ctx := context.Background()

	fmt.Println("Creating officer accounts...")
	fmt.Println()

	for _, o := range officers {

		hashed, err := bcrypt.GenerateFromPassword(
			[]byte(o.Password), bcrypt.DefaultCost,
		)
		if err != nil {
			log.Fatalf("could not hash the password for %s: %v", o.NIC, err)
		}

		// ON CONFLICT ... DO UPDATE makes this safe to run twice.
		//
		// Without it a second run would fail on the UNIQUE nic constraint,
		// and you would have to delete the rows by hand before re-seeding.
		// Being able to re-run a seed command is worth the extra line.
		query := `
			INSERT INTO farmers
				(nic, full_name, gn_division, mobile, email, password_hash,
				 role, scope_division)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (nic) DO UPDATE SET
				full_name      = EXCLUDED.full_name,
				password_hash  = EXCLUDED.password_hash,
				role           = EXCLUDED.role,
				scope_division = EXCLUDED.scope_division
			RETURNING farmer_id
		`

		// A department officer covers the whole country, so their scope is
		// NULL rather than an empty string. NULL means "no limit"; an empty
		// string would be a division whose name happens to be nothing.
		var division any
		if o.Division == "" {
			division = nil
		} else {
			division = o.Division
		}

		var id int
		err = db.QueryRow(
			ctx, query,
			o.NIC, o.Name, o.Division, o.Mobile, o.Email, string(hashed),
			o.Role, division,
		).Scan(&id)

		if err != nil {
			log.Fatalf("could not create %s: %v", o.NIC, err)
		}

		where := o.Division
		if where == "" {
			where = "whole country"
		}

		fmt.Printf("  #%d  %-13s  %-12s  %s\n", id, o.NIC, o.Role, where)
	}

	fmt.Println()
	fmt.Println("Log in to the dashboard with the NIC and password:")
	fmt.Println()
	for _, o := range officers {
		fmt.Printf("  %-13s  %s\n", o.NIC, o.Password)
	}
	fmt.Println()
	fmt.Fprintln(os.Stderr,
		"These passwords are for demonstration only. Change them before "+
			"this is used with real farmers' data.")
}
