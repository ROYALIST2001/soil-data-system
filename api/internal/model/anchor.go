package model

import "time"

// Anchor is one exact field.
// It is stored as one centre point.
type Anchor struct {
	AnchorID  int       `json:"anchor_id"`   // the unique id number
	CenterLat float64   `json:"center_lat"`  // the field's centre latitude
	CenterLng float64   `json:"center_lng"`  // the field's centre longitude
	CreatedAt time.Time `json:"created_at"`  // when we first saw this field
}
