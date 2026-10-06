// One farmer account, as the server sends it back.
//
// NOTE what is NOT here: the password. The server never sends it, and the
// app never stores it. The only place it exists is inside the text box for
// the moment the farmer is typing it.
export interface Farmer {
  farmer_id: number;
  nic: string;
  full_name: string;
  gn_division: string;
  mobile: string;
  email: string;
  created_at: string;
}

// What we SEND when a new farmer signs up.
export interface SignupData {
  nic: string;
  full_name: string;
  gn_division: string;
  mobile: string;
  email: string;
  password: string;
}

// What we SEND when an existing farmer logs in.
export interface LoginData {
  nic: string;
  password: string;
}

// What the server sends back for BOTH signup and login.
export interface AuthResponse {
  farmer: Farmer;
}
