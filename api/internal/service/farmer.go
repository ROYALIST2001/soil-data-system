package service

import (
	"errors"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"soil-data-system/api/internal/locationcatalog"
	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// ---------- THE RULES, AS PATTERNS ----------
//
// We compile these ONCE, here, instead of inside the functions.
// Compiling a regular expression is slow; matching with it is fast.
// Doing it once at startup means every signup after that is cheap.

var (
	// Sri Lankan NIC, old style: 9 digits then V or X.
	//   871234567V
	nicOldPattern = regexp.MustCompile(`^[0-9]{9}[VX]$`)

	// Sri Lankan NIC, new style: 12 digits.
	//   198712345678
	nicNewPattern = regexp.MustCompile(`^[0-9]{12}$`)

	// Sri Lankan mobile, local style: 10 digits starting 07.
	//   0771234567
	mobileLocalPattern = regexp.MustCompile(`^07[0-9]{8}$`)

	// Sri Lankan mobile, international style.
	//   +94771234567
	mobileIntlPattern = regexp.MustCompile(`^\+947[0-9]{8}$`)

	// Deliberately simple: something, @, something, dot, something.
	// A full RFC-correct email pattern is enormous and still cannot tell
	// you whether the address actually exists. Catching obvious typing
	// mistakes is all this is for.
	emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
)

// The shortest password we accept.
//
// HONEST NOTE FOR THE REPORT: 6 is a compromise. Security guidance says 8
// or more. We chose 6 because our users are farmers typing on a phone in a
// field, and a rule so strict that people write the password on paper makes
// things WORSE, not better.
const minPasswordLength = 6

// ---------- THE ERROR KINDS ----------

// ValidationError means the CALLER sent bad data, so the answer is 400.
//
// NOTE: in reading.go we separated 400 from 500 by looking at the words in
// the message. That worked, but it breaks the moment someone rewords a
// message. This is the proper Go way: a type the controller can test for
// with errors.As(), no matter what the text says.
type ValidationError struct {
	Message string
}

// Error makes ValidationError satisfy Go's error interface.
func (e ValidationError) Error() string {
	return e.Message
}

// ErrNICTaken means somebody already registered with that NIC.
var ErrNICTaken = errors.New("that NIC is already registered")

// ErrInvalidCredentials means the NIC or the password was wrong.
//
// ONE error for BOTH cases, on purpose. See Login below.
var ErrInvalidCredentials = errors.New("NIC or password is incorrect")

// ---------- THE SERVICE ----------

// FarmerService creates accounts and checks logins.
type FarmerService struct {
	farmerRepo  *repository.FarmerRepository
	sessionRepo *repository.SessionRepository
}

// NewFarmerService builds the service.
func NewFarmerService(
	farmerRepo *repository.FarmerRepository,
	sessionRepo *repository.SessionRepository,
) *FarmerService {
	return &FarmerService{farmerRepo: farmerRepo, sessionRepo: sessionRepo}
}

// StartSession issues a token for an account that has already been checked.
//
// Kept separate from Signup and Login so there is exactly ONE place a token
// is created. If issuing a session ever needs to change - shorter expiry,
// logging, a limit on how many a person may hold - there is one function to
// edit rather than two that might drift apart.
func (s *FarmerService) StartSession(
	farmerID int,
) (string, time.Time, error) {
	return s.sessionRepo.Create(farmerID)
}

// EndSession logs one session out.
func (s *FarmerService) EndSession(token string) error {
	return s.sessionRepo.Delete(token)
}

// Signup creates one new farmer account.
func (s *FarmerService) Signup(req model.SignupRequest) (model.Farmer, error) {

	// ---------- STEP 1: tidy the input ----------
	//
	// Phones add spaces, and keyboards capitalise. We clean FIRST, then
	// check, so a farmer is never rejected for a stray space they cannot
	// even see.
	nic := strings.ToUpper(strings.TrimSpace(req.NIC))
	fullName := strings.TrimSpace(req.FullName)
	gnDivision := strings.TrimSpace(req.GNDivision)
	if official, ok := locationcatalog.Resolve(gnDivision); ok {
		gnDivision = official.Value
	}
	mobile := strings.ReplaceAll(strings.TrimSpace(req.Mobile), " ", "")
	email := strings.ToLower(strings.TrimSpace(req.Email))

	// The password is NOT trimmed. A space is a legitimate character in a
	// password, and silently removing it would lock the farmer out later.
	password := req.Password

	// ---------- STEP 2: check every field ----------
	if err := validateFullName(fullName); err != nil {
		return model.Farmer{}, err
	}
	if err := validateNIC(nic); err != nil {
		return model.Farmer{}, err
	}
	if err := validateGNDivision(gnDivision); err != nil {
		return model.Farmer{}, err
	}
	if err := validateMobile(mobile); err != nil {
		return model.Farmer{}, err
	}
	if err := validateEmail(email); err != nil {
		return model.Farmer{}, err
	}
	if err := validatePassword(password); err != nil {
		return model.Farmer{}, err
	}

	// ---------- STEP 3: is this NIC free? ----------
	//
	// We check here so we can give a clear, friendly message. The UNIQUE
	// constraint in the database is still there as the real guarantee,
	// for the case where two people sign up in the same instant.
	taken, err := s.farmerRepo.ExistsByNIC(nic)
	if err != nil {
		return model.Farmer{}, err
	}
	if taken {
		return model.Farmer{}, ErrNICTaken
	}

	// ---------- STEP 4: hash the password ----------
	//
	// bcrypt does two things a plain hash like SHA-256 does not:
	//   1. it adds a random SALT, so two farmers with the same password
	//      get different hashes and cannot be spotted as a pair
	//   2. it is deliberately SLOW, which makes guessing millions of
	//      passwords expensive instead of instant
	//
	// DefaultCost is bcrypt's own recommended setting. We do not lower it
	// to make login feel faster; that is the one thing it must not be.
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return model.Farmer{}, err
	}

	// ---------- STEP 5: save ----------
	//
	// Note what is passed on: the HASH. The real password exists only in
	// memory for the length of this function and is never written anywhere.
	return s.farmerRepo.Insert(
		nic, fullName, gnDivision, mobile, email, string(hashed),
	)
}

// Login checks a NIC and password, and returns the farmer.
func (s *FarmerService) Login(req model.LoginRequest) (model.Farmer, error) {

	nic := strings.ToUpper(strings.TrimSpace(req.NIC))

	if nic == "" || req.Password == "" {
		return model.Farmer{}, ValidationError{
			Message: "Please enter your NIC number and password.",
		}
	}

	farmer, err := s.farmerRepo.FindByNIC(nic)

	// ---------- WHY BOTH FAILURES LOOK THE SAME ----------
	//
	// Nobody has that NIC, and the password was wrong, both return
	// ErrInvalidCredentials with the same wording.
	//
	// If we said "no such NIC" for one and "wrong password" for the other,
	// the login screen would become a tool for discovering which NIC
	// numbers are registered. Someone could work through NIC numbers and
	// build a list of real farmers in the system. Telling the two apart is
	// a small convenience for the farmer and a real gift to an attacker.
	if errors.Is(err, repository.ErrFarmerNotFound) {
		return model.Farmer{}, ErrInvalidCredentials
	}
	if err != nil {
		return model.Farmer{}, err
	}

	// CompareHashAndPassword hashes the attempt with the SAME salt that is
	// stored inside the saved hash, then compares. We never decrypt the
	// stored hash, because a hash cannot be decrypted at all.
	err = bcrypt.CompareHashAndPassword(
		[]byte(farmer.PasswordHash), []byte(req.Password),
	)
	if err != nil {
		return model.Farmer{}, ErrInvalidCredentials
	}

	return farmer, nil
}

// GetFarmer loads one farmer by id.
func (s *FarmerService) GetFarmer(farmerID int) (model.Farmer, error) {
	return s.farmerRepo.FindByID(farmerID)
}

// ---------- THE FIELD RULES ----------
//
// One function per field, each with ONE job. Every message says what is
// wrong AND what good looks like, because "invalid NIC" helps nobody.

func validateFullName(name string) error {
	if name == "" {
		return ValidationError{Message: "Please enter your full name."}
	}
	if len(name) < 3 {
		return ValidationError{
			Message: "Please enter your full name (at least 3 letters).",
		}
	}
	return nil
}

func validateNIC(nic string) error {
	if nic == "" {
		return ValidationError{Message: "Please enter your NIC number."}
	}

	if nicOldPattern.MatchString(nic) || nicNewPattern.MatchString(nic) {
		return nil
	}

	return ValidationError{
		Message: "NIC must be 9 numbers then V (like 871234567V), " +
			"or 12 numbers (like 198712345678).",
	}
}

func validateGNDivision(division string) error {
	if _, ok := locationcatalog.Resolve(division); !ok {
		return ValidationError{
			Message: "Please choose your district and Grama Niladhari division from the list.",
		}
	}
	return nil
}

func validateMobile(mobile string) error {
	if mobile == "" {
		return ValidationError{Message: "Please enter your mobile number."}
	}

	if mobileLocalPattern.MatchString(mobile) ||
		mobileIntlPattern.MatchString(mobile) {
		return nil
	}

	return ValidationError{
		Message: "Mobile number must be 10 digits starting with 07 " +
			"(like 0771234567).",
	}
}

func validateEmail(email string) error {
	if email == "" {
		return ValidationError{Message: "Please enter your email address."}
	}

	if !emailPattern.MatchString(email) {
		return ValidationError{
			Message: "Please enter a valid email address (like name@example.com).",
		}
	}
	return nil
}

func validatePassword(password string) error {
	if password == "" {
		return ValidationError{Message: "Please choose a password."}
	}

	// COUNT CHARACTERS, NOT BYTES.
	//
	// len() on a Go string counts BYTES. A Sinhala or Tamil letter is
	// several bytes, so len() would let a 2-letter Sinhala password pass
	// a 6-byte check. Converting to runes counts actual characters.
	if len([]rune(password)) < minPasswordLength {
		return ValidationError{
			Message: "Password must be at least 6 characters.",
		}
	}
	return nil
}
