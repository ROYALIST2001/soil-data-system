// Command seeddemo fills the system with believable demonstration data:
// 20 farmers, their land and crops, soil tests, two declared disasters and
// compensation claims at every stage.
//
// WHY THIS GOES THROUGH THE API RATHER THAN WRITING ROWS DIRECTLY.
//
// Inserting rows straight into the database would be quicker, but the data
// would never have been near the rules. Anchors would not be snapped,
// districts would not be worked out from the GPS point, quality flags would
// be whatever this file decided, and a claim could sit in a state the real
// workflow can never produce.
//
// Demonstration data that could not have arisen from using the system is
// worse than none: it shows a system that does not exist. So this signs up,
// logs in and posts, exactly as a farmer and an officer would.
//
// The only two things done directly in SQL are the two the API deliberately
// does not allow: back-dating a reading so the history graphs have a shape,
// and deleting a previous run of this command.
//
// Run it with:
//
//	docker compose exec api ./seeddemo
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"time"

	"soil-data-system/api/internal/database"
	"soil-data-system/api/internal/model"
)

// Where the API is. Inside the api container this is itself.
func apiURL() string {
	if v := os.Getenv("API_URL"); v != "" {
		return v
	}
	return "http://localhost:8080"
}

// Every demonstration farmer gets this password, and the command prints it.
// Real accounts are never created by this file.
const demoPassword = "demo1234"

var client = &http.Client{Timeout: 30 * time.Second}

// ---------- SMALL HTTP HELPERS ----------

func post(path string, token string, body any, out any) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", apiURL()+path, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 300 {
		return fmt.Errorf("%s -> %d: %s", path, resp.StatusCode,
			strings.TrimSpace(string(data)))
	}

	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}

func login(nic, password string) (string, error) {
	var reply struct {
		Token string `json:"token"`
	}

	err := post("/login", "", map[string]string{
		"nic": nic, "password": password,
	}, &reply)

	return reply.Token, err
}

// ---------- THE DEMONSTRATION DATA ----------

// A place to put a farmer: a division, and a point inside the district
// rectangle that covers it.
//
// The GPS points matter. districts.geojson holds only three test rectangles
// (Colombo, Gampaha, Kandy), so a point outside them comes back with no
// district and vanishes from every district-level screen. Placing the demo
// farmers inside them is what makes Trends and Regions show anything.
type place struct {
	Division string
	District string
	Lat      float64
	Lng      float64
}

var places = []place{
	{"Kolonnawa", "Colombo", 6.93, 79.90},
	{"Homagama", "Colombo", 6.84, 80.00},
	{"Negombo", "Gampaha", 7.21, 79.88},
	{"Minuwangoda", "Gampaha", 7.17, 80.00},
	{"Gampola", "Kandy", 7.16, 80.57},
	{"Akurana", "Kandy", 7.37, 80.61},
}

type demoFarmer struct {
	Name   string
	Place  int // index into places
	Mobile string
}

var farmers = []demoFarmer{
	{"Sunil Perera", 0, "0771000001"},
	{"Kamala Wijesinghe", 0, "0771000002"},
	{"Nimal Fernando", 0, "0771000003"},
	{"Ranjith Bandara", 1, "0771000004"},
	{"Chandra Silva", 1, "0771000005"},
	{"Upali Jayasuriya", 1, "0771000006"},
	{"Malini Gunawardena", 2, "0771000007"},
	{"Ajith Kumara", 2, "0771000008"},
	{"Pradeep Rathnayake", 2, "0771000009"},
	{"Sepala Dissanayake", 2, "0771000010"},
	{"Nilanthi Herath", 3, "0771000011"},
	{"Rohana Weerasinghe", 3, "0771000012"},
	{"Thilak Abeysekara", 3, "0771000013"},
	{"Jayantha Senanayake", 4, "0771000014"},
	{"Kumari Ratnayake", 4, "0771000015"},
	{"Bandula Amarasinghe", 4, "0771000016"},
	{"Saman Ekanayake", 5, "0771000017"},
	{"Padma Liyanage", 5, "0771000018"},
	{"Wasantha Pathirana", 5, "0771000019"},
	{"Indika Samarasekara", 5, "0771000020"},
}

// Which crops each farmer grows. Kept varied so the dashboards have
// something to sort and group by.
var cropSets = [][]string{
	{"rice"},
	{"rice", "chilli"},
	{"coconut"},
	{"maize", "cabbage"},
	{"banana"},
	{"rice", "banana"},
	{"tea"},
	{"tomato", "chilli"},
	{"potato", "cabbage"},
	{"rice", "maize", "chilli"},
}

// nicFor builds a believable old-style NIC for a demo farmer.
//
// 9 digits then V, which is the format the signup rules accept. The numbers
// are generated from the index so re-running this command produces the same
// twenty NICs and can clean up after itself.
func nicFor(i int) string {
	return fmt.Sprintf("88%07dV", 100001+i)
}

// targetYieldFor picks a believable target for this crop.
//
// NOT a fixed number. The Phase 4 rules cap the target at each crop's own
// realistic maximum - tea at 3.5 tonnes a hectare, banana at 60 - so a
// single value would be refused for some crops and absurd for others.
// Taking 60% of the crop's own ceiling is both accepted and sensible.
func targetYieldFor(crop string) float64 {
	info, ok := model.AllowedCrops[crop]
	if !ok {
		return 3.0
	}
	return float64(int(info.MaxYield*0.6*10)) / 10
}

// A realistic soil reading for a crop, with a little variation so the
// history graphs are not flat lines.
func soilFor(r *rand.Rand, crop string, drift float64) (n, p, k, ph float64) {
	base := map[string][4]float64{
		"rice":     {45, 22, 120, 6.2},
		"maize":    {55, 25, 110, 6.5},
		"tea":      {40, 18, 95, 5.2},
		"coconut":  {35, 15, 140, 6.8},
		"banana":   {60, 30, 180, 6.4},
		"chilli":   {50, 28, 130, 6.6},
		"potato":   {65, 35, 150, 5.8},
		"cabbage":  {70, 32, 145, 6.3},
		"tomato":   {58, 30, 135, 6.4},
		"bigonion": {52, 26, 125, 6.7},
	}

	b, ok := base[crop]
	if !ok {
		b = [4]float64{45, 22, 120, 6.3}
	}

	jitter := func(v, spread float64) float64 {
		return v + (r.Float64()*2-1)*spread + drift*v*0.08
	}

	return jitter(b[0], 6), jitter(b[1], 3),
		jitter(b[2], 12), jitter(b[3], 0.25)
}

func main() {
	db := database.Connect()
	defer db.Close()
	ctx := context.Background()

	// Same seed every run, so the demonstration looks the same each time.
	// A demo that changes shape between showings is hard to talk over.
	r := rand.New(rand.NewSource(42))

	fmt.Println("Seeding demonstration data...")
	fmt.Println()

	// ---------- 0. CLEAR A PREVIOUS RUN ----------
	//
	// Only the twenty NICs this command creates. Real accounts, the
	// officers and any readings made by hand are left alone.
	nics := make([]string, 0, len(farmers))
	for i := range farmers {
		nics = append(nics, nicFor(i))
	}

	// Claims reference farmers with ON DELETE RESTRICT, so they have to go
	// first. Everything else cascades from the farmer row.
	_, err := db.Exec(ctx, `
		DELETE FROM claims WHERE farmer_id IN
			(SELECT farmer_id FROM farmers WHERE nic = ANY($1))
	`, nics)
	if err != nil {
		log.Fatal("could not clear old demo claims: ", err)
	}

	_, err = db.Exec(ctx, `
		DELETE FROM readings WHERE farmer_id IN
			(SELECT farmer_id FROM farmers WHERE nic = ANY($1))
	`, nics)
	if err != nil {
		log.Fatal("could not clear old demo readings: ", err)
	}

	tag, err := db.Exec(ctx, `DELETE FROM farmers WHERE nic = ANY($1)`, nics)
	if err != nil {
		log.Fatal("could not clear old demo farmers: ", err)
	}
	if tag.RowsAffected() > 0 {
		fmt.Printf("  cleared %d farmer(s) from a previous run\n\n",
			tag.RowsAffected())
	}

	// ---------- 1. FARMERS, LAND AND CROPS ----------

	type seeded struct {
		FarmerID  int
		Token     string
		Division  string
		LandID    int
		CropIDs   map[string]int // crop -> land_crop_id
		LandSizes map[string]float64
		Place     place
	}

	all := make([]seeded, 0, len(farmers))

	// How many farmers we have already placed in each division, so each one
	// gets their own patch of ground rather than the whole village sharing
	// a point.
	placed := map[int]int{}

	for i, f := range farmers {
		p := places[f.Place]

		// MOVE EACH FARMER APART FROM THEIR NEIGHBOURS.
		//
		// Phase 3 treats two readings within 100 metres as the same field
		// and snaps them to one anchor. That is right for a farmer testing
		// the same plot twice - and wrong here, because giving every farmer
		// in a division the same point made them share a field, so one
		// farmer's history graph showed their neighbours' soil.
		//
		// 0.004 degrees is roughly 440 metres, comfortably past the
		// snapping distance, and still well inside the district rectangle.
		nth := placed[f.Place]
		placed[f.Place] = nth + 1

		p.Lat += float64(nth) * 0.004
		p.Lng += float64(nth%2) * 0.004

		var signup struct {
			Farmer struct {
				FarmerID int `json:"farmer_id"`
			} `json:"farmer"`
			Token string `json:"token"`
		}

		err := post("/signup", "", map[string]any{
			"nic":         nicFor(i),
			"full_name":   f.Name,
			"gn_division": p.Division,
			"mobile":      f.Mobile,
			"email": fmt.Sprintf("%s@example.lk",
				strings.ToLower(strings.ReplaceAll(f.Name, " ", "."))),
			"password": demoPassword,
		}, &signup)

		if err != nil {
			log.Fatalf("signup for %s failed: %v", f.Name, err)
		}

		crops := cropSets[i%len(cropSets)]

		// Land big enough to hold the crops, with a little spare.
		landSize := 0.0
		cropAreas := make([]map[string]any, 0, len(crops))

		for _, crop := range crops {
			area := 0.4 + r.Float64()*1.6 // 0.4 to 2.0 hectares
			area = float64(int(area*100)) / 100
			landSize += area
			cropAreas = append(cropAreas, map[string]any{
				"crop": crop, "size_ha": area,
			})
		}
		landSize = float64(int((landSize+0.3)*100)) / 100

		var land struct {
			LandID int `json:"land_id"`
			Crops  []struct {
				LandCropID int     `json:"land_crop_id"`
				Crop       string  `json:"crop"`
				SizeHa     float64 `json:"size_ha"`
			} `json:"crops"`
		}

		err = post("/lands", signup.Token, map[string]any{
			"farmer_id":   signup.Farmer.FarmerID,
			"name":        fmt.Sprintf("%s field", strings.Split(f.Name, " ")[0]),
			"gn_division": p.Division,
			"size_ha":     landSize,
			"crops":       cropAreas,
		}, &land)

		if err != nil {
			log.Fatalf("land for %s failed: %v", f.Name, err)
		}

		s := seeded{
			FarmerID:  signup.Farmer.FarmerID,
			Token:     signup.Token,
			Division:  p.Division,
			LandID:    land.LandID,
			CropIDs:   map[string]int{},
			LandSizes: map[string]float64{},
			Place:     p,
		}
		for _, c := range land.Crops {
			s.CropIDs[c.Crop] = c.LandCropID
			s.LandSizes[c.Crop] = c.SizeHa
		}

		all = append(all, s)
	}

	fmt.Printf("  %d farmers, each with land and crops\n", len(all))

	// ---------- 2. SOIL TESTS ----------
	//
	// Three per crop, spread over the last five months, so the Trends
	// screen has a line rather than a dot. The GPS point is nudged slightly
	// each time, which is what a real phone does - and it exercises the
	// anchor snapping from Phase 3, so all three land on one field.
	readings := 0
	flagged := 0

	for i, s := range all {
		for crop, cropID := range s.CropIDs {
			for step := 0; step < 3; step++ {

				// A few deliberately wild readings, so the quality rules
				// have something to catch and the dashboards show a
				// FLAGGED row. Every third farmer, on their last test.
				wild := i%7 == 3 && step == 2

				n, p, k, ph := soilFor(r, crop, float64(step))
				if wild {
					n = n * 6 // a jump the Phase 4 rules will not accept
				}

				// Within 40 metres, so Phase 3 snaps them to one anchor.
				lat := s.Place.Lat + (r.Float64()*2-1)*0.0003
				lng := s.Place.Lng + (r.Float64()*2-1)*0.0003

				var created struct {
					ReadingID int `json:"reading_id"`
				}

				err := post("/readings", s.Token, map[string]any{
					"raw_lat": lat, "raw_lng": lng,
					"n": n, "p": p, "k": k, "ph": ph,
					"crop": crop, "stage": "vegetative",
					"target_yield": targetYieldFor(crop),
					"area":         s.LandSizes[crop],
					"farmer_id":    s.FarmerID,
					"land_id":      s.LandID,
					"land_crop_id": cropID,
				}, &created)

				if err != nil {
					log.Fatalf("reading for %s failed: %v", crop, err)
				}

				// BACK-DATE IT.
				//
				// One of the two things the API will not do, and rightly:
				// nobody should be able to claim a soil test happened five
				// months ago. For a demonstration we need the history to
				// have a shape, so it is done here in SQL and nowhere else.
				daysAgo := (2-step)*50 + r.Intn(10)
				// make_interval rather than building a string and casting
				// it: Postgres cannot work out the type of an integer
				// glued onto ' days', and this says plainly what is meant.
				_, err = db.Exec(ctx, `
					UPDATE readings
					SET created_at = NOW() - make_interval(days => $1)
					WHERE reading_id = $2
				`, daysAgo, created.ReadingID)
				if err != nil {
					log.Fatal("could not back-date a reading: ", err)
				}

				readings++
				if wild {
					flagged++
				}
			}
		}
	}

	fmt.Printf("  %d soil tests over the last five months\n", readings)

	// ---------- 3. DISASTERS ----------

	deptToken, err := login("DEPT0000001", "dept1234")
	if err != nil {
		log.Fatal("could not log in as the department officer. "+
			"Run ./seedofficers first. ", err)
	}

	type declared struct {
		EventID int `json:"event_id"`
	}

	var floodGampaha declared
	err = post("/officer/disasters", deptToken, map[string]any{
		"name":          "Flood - Gampaha - September 2026",
		"disaster_type": "FLOOD",
		"started_on":    time.Now().AddDate(0, 0, -38).Format("2006-01-02"),
		"ended_on":      time.Now().AddDate(0, 0, -34).Format("2006-01-02"),
		"description":   "Ma Oya burst its banks after four days of rain.",
		"divisions":     []string{"Negombo", "Minuwangoda"},
		"rates": []map[string]any{
			{"crop": "rice", "rate_per_hectare": 150000},
			{"crop": "banana", "rate_per_hectare": 120000},
			{"crop": "tea", "rate_per_hectare": 200000},
			{"crop": "tomato", "rate_per_hectare": 110000},
			{"crop": "chilli", "rate_per_hectare": 90000},
		},
	}, &floodGampaha)
	if err != nil {
		log.Fatal("could not declare the Gampaha flood: ", err)
	}

	var droughtKandy declared
	err = post("/officer/disasters", deptToken, map[string]any{
		"name":          "Drought - Kandy - August 2026",
		"disaster_type": "DROUGHT",
		"started_on":    time.Now().AddDate(0, 0, -75).Format("2006-01-02"),
		"ended_on":      time.Now().AddDate(0, 0, -50).Format("2006-01-02"),
		"description":   "Eleven weeks without meaningful rain.",
		"divisions":     []string{"Gampola", "Akurana"},
		"rates": []map[string]any{
			{"crop": "rice", "rate_per_hectare": 140000},
			{"crop": "maize", "rate_per_hectare": 100000},
			{"crop": "potato", "rate_per_hectare": 160000},
			{"crop": "cabbage", "rate_per_hectare": 130000},
			{"crop": "chilli", "rate_per_hectare": 90000},
			{"crop": "banana", "rate_per_hectare": 120000},
		},
	}, &droughtKandy)
	if err != nil {
		log.Fatal("could not declare the Kandy drought: ", err)
	}

	fmt.Println("  2 disasters declared")

	// ---------- 4. CLAIMS, AT EVERY STAGE ----------
	//
	// The point of a demonstration is that every queue has something in it.
	// A dashboard where four of the five tabs are empty teaches nobody
	// anything about how the system works.

	gnTokens := map[string]string{}
	for division, nic := range map[string]string{
		"Negombo":     "GNO00000005",
		"Minuwangoda": "GNO00000006",
		"Gampola":     "GNO00000007",
		"Akurana":     "GNO00000008",
	} {
		t, err := login(nic, "gn1234")
		if err != nil {
			log.Fatalf("could not log in as the %s officer. "+
				"Run ./seedofficers first. %v", division, err)
		}
		gnTokens[division] = t
	}

	// How far each claim should travel.
	stages := []string{
		"PAID", "PAID", "APPROVED", "APPROVED",
		"VERIFIED", "VERIFIED", "REJECTED", "SUBMITTED",
		"SUBMITTED", "SUBMITTED",
	}

	counts := map[string]int{}
	stageAt := 0

	for _, s := range all {
		eventID := 0
		switch s.Division {
		case "Negombo", "Minuwangoda":
			eventID = floodGampaha.EventID
		case "Gampola", "Akurana":
			eventID = droughtKandy.EventID
		default:
			continue // Colombo divisions were not affected
		}

		for crop, cropID := range s.CropIDs {
			target := stages[stageAt%len(stages)]
			stageAt++

			size := s.LandSizes[crop]
			claimed := float64(int(size*0.8*100)) / 100
			if claimed <= 0 {
				continue
			}

			var claim struct {
				ClaimID int `json:"claim_id"`
			}

			err := post("/claims", s.Token, map[string]any{
				"farmer_id":       s.FarmerID,
				"event_id":        eventID,
				"land_crop_id":    cropID,
				"claimed_area_ha": claimed,
				"farmer_note":     "The crop was destroyed. Nothing could be saved.",
			}, &claim)

			// A crop this scheme does not cover is refused, which is
			// correct. Move on rather than treating it as a failure.
			if err != nil {
				continue
			}

			counts["SUBMITTED"]++
			if target == "SUBMITTED" {
				continue
			}

			gn := gnTokens[s.Division]

			if target == "REJECTED" {
				err = post(fmt.Sprintf("/officer/claims/%d/reject",
					claim.ClaimID), gn, map[string]any{
					"note": "Visited the field. This plot is on high ground " +
						"and was not affected.",
				}, nil)
				if err == nil {
					counts["REJECTED"]++
					counts["SUBMITTED"]--
				}
				continue
			}

			// Verified a little under what was claimed, which is the
			// realistic case and exercises the "say why" rule.
			verified := float64(int(claimed*0.85*100)) / 100

			err = post(fmt.Sprintf("/officer/claims/%d/verify",
				claim.ClaimID), gn, map[string]any{
				"verified_area_ha": verified,
				"note": "Inspected the field. Part of the plot on higher " +
					"ground survived.",
			}, nil)
			if err != nil {
				continue
			}
			counts["VERIFIED"]++
			counts["SUBMITTED"]--

			if target == "VERIFIED" {
				continue
			}

			err = post(fmt.Sprintf("/officer/claims/%d/approve",
				claim.ClaimID), deptToken, map[string]any{
				"note": "Approved under the declared relief scheme.",
			}, nil)
			if err != nil {
				continue
			}
			counts["APPROVED"]++
			counts["VERIFIED"]--

			if target == "APPROVED" {
				continue
			}

			err = post(fmt.Sprintf("/officer/claims/%d/pay",
				claim.ClaimID), deptToken, map[string]any{
				"note": "Collected at the divisional secretariat.",
			}, nil)
			if err == nil {
				counts["PAID"]++
				counts["APPROVED"]--
			}
		}
	}

	fmt.Printf("  claims: %d waiting to verify, %d verified, %d approved, "+
		"%d paid, %d rejected\n",
		counts["SUBMITTED"], counts["VERIFIED"], counts["APPROVED"],
		counts["PAID"], counts["REJECTED"])

	fmt.Println()
	fmt.Println("Done. Every farmer logs in with:")
	fmt.Println()
	fmt.Printf("  NIC      %s  ...  %s\n", nicFor(0), nicFor(len(farmers)-1))
	fmt.Printf("  password %s\n", demoPassword)
	fmt.Println()
	fmt.Fprintln(os.Stderr,
		"This is demonstration data. Delete it before the system is used "+
			"with real farmers.")
}
