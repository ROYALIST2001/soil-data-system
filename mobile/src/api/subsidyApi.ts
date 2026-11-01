import { API_BASE_URL } from "../config";
import { postJson, requestJson } from "./http";
import {
  NewSubsidyApplication, SubsidyApplication, SubsidyDetail, SubsidyRound,
} from "../types/subsidy";

// Which subsidy rounds can this farmer apply to right now?
//
// The server returns only OPEN rounds covering their own division, so the
// app never has to work out whether an application is allowed - if it is in
// this list, it is.
export async function getOpenRounds(
  farmerId: number
): Promise<SubsidyRound[]> {
  const body = await requestJson<{ rounds: SubsidyRound[] }>(
    `${API_BASE_URL}/farmers/${farmerId}/subsidy-rounds`
  );
  return body.rounds ?? [];
}

// Every application this farmer has made, newest first.
export async function getMyApplications(
  farmerId: number
): Promise<SubsidyApplication[]> {
  const body = await requestJson<{ applications: SubsidyApplication[] }>(
    `${API_BASE_URL}/farmers/${farmerId}/subsidies`
  );
  return body.applications ?? [];
}

// Apply for the subsidy on one crop.
export async function apply(
  application: NewSubsidyApplication
): Promise<SubsidyApplication> {
  return requestJson<SubsidyApplication>(
    `${API_BASE_URL}/subsidies`,
    postJson(application)
  );
}

// THE FARMER'S OWN TWO MOVES.
//
// Every other workflow in this app is moved along by officers. These two
// belong to the farmer, and they are what make the payment accountable to
// the person it was meant for.

// "Yes, the money arrived."
export async function confirmReceived(
  applicationId: number,
  farmerId: number,
  note: string
): Promise<SubsidyDetail> {
  return requestJson<SubsidyDetail>(
    `${API_BASE_URL}/subsidies/${applicationId}/received`,
    postJson({ farmer_id: farmerId, note })
  );
}

// "No, it never reached me." This goes straight into a queue the department
// has to work through.
export async function dispute(
  applicationId: number,
  farmerId: number,
  note: string
): Promise<SubsidyDetail> {
  return requestJson<SubsidyDetail>(
    `${API_BASE_URL}/subsidies/${applicationId}/dispute`,
    postJson({ farmer_id: farmerId, note })
  );
}
