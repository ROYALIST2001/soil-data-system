package model

import "time"

// ReadingValues is what is ACTUALLY stored for one reading: the farmer's
// original numbers and the officer's corrections, kept apart.
//
// Everywhere else in the system these two are merged with COALESCE, because
// what you want is "the value in force". This type exists for the one job
// that needs them separate: recording what a change changed FROM.
type ReadingValues struct {
	// What the farmer submitted. Never modified after insert.
	N           float64
	P           float64
	K           float64
	PH          float64
	QualityFlag string

	// What an officer corrected it to. NULL when untouched.
	CorrectedN  *float64
	CorrectedP  *float64
	CorrectedK  *float64
	CorrectedPH *float64
	OfficerFlag *string
}

// Effective returns the values actually in force: the correction when there
// is one, otherwise the farmer's original.
//
// The same rule as the COALESCE in the SQL, written once in Go so the two
// cannot drift apart.
func (v ReadingValues) Effective() (n, p, k, ph float64, flag string) {
	n, p, k, ph, flag = v.N, v.P, v.K, v.PH, v.QualityFlag

	if v.CorrectedN != nil {
		n = *v.CorrectedN
	}
	if v.CorrectedP != nil {
		p = *v.CorrectedP
	}
	if v.CorrectedK != nil {
		k = *v.CorrectedK
	}
	if v.CorrectedPH != nil {
		ph = *v.CorrectedPH
	}
	if v.OfficerFlag != nil {
		flag = *v.OfficerFlag
	}

	return n, p, k, ph, flag
}

// FieldChange is one thing an officer changed, ready to be written down.
//
// Values are TEXT so one audit table covers numbers and flags alike. They
// are only ever read by humans, never calculated with.
type FieldChange struct {
	Field    string // "n", "p", "k", "ph" or "flag"
	OldValue *string
	NewValue string
}

// Correction is one entry in a reading's history.
type Correction struct {
	CorrectionID int       `json:"correction_id"`
	ReadingID    int       `json:"reading_id"`
	OfficerID    int       `json:"officer_id"`
	OfficerName  string    `json:"officer_name"`
	FieldName    string    `json:"field_name"`
	OldValue     *string   `json:"old_value"`
	NewValue     *string   `json:"new_value"`
	Reason       string    `json:"reason"`
	CreatedAt    time.Time `json:"created_at"`
}

// ---------- WHAT THE DASHBOARD SENDS ----------

// CorrectRequest is an officer fixing a farmer's numbers.
//
// Every field is a POINTER so we can tell "leave this alone" (nil) from
// "set it to this" (a value). Without that, an officer correcting only the
// pH would silently overwrite N, P and K with zero.
type CorrectRequest struct {
	N  *float64 `json:"n"`
	P  *float64 `json:"p"`
	K  *float64 `json:"k"`
	PH *float64 `json:"ph"`

	// Required. A correction with no reason is indistinguishable from
	// tampering when somebody reads this table in six months.
	Reason string `json:"reason"`
}

// FlagRequest is an officer overruling the quality rules.
type FlagRequest struct {
	Flag   string `json:"flag"` // OK, FLAGGED or QUARANTINED
	Reason string `json:"reason"`
}

// ReadingDetail is one reading with everything an officer needs to judge it.
type ReadingDetail struct {
	Reading ReadingRow `json:"reading"`

	// The farmer's original numbers, shown next to the current ones so an
	// officer can see exactly what was changed and by how much.
	OriginalN  float64 `json:"original_n"`
	OriginalP  float64 `json:"original_p"`
	OriginalK  float64 `json:"original_k"`
	OriginalPH float64 `json:"original_ph"`

	// What the Phase 4 rules decided, separately from any human override.
	RuleFlag string `json:"rule_flag"`

	// Set only when an officer has overruled the rules.
	OfficerFlag *string `json:"officer_flag"`

	Corrections []Correction `json:"corrections"`
}
