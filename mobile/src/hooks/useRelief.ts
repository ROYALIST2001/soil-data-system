import { useCallback, useEffect, useState } from "react";

import { useAppSelector } from "../store";
import * as reliefApi from "../api/reliefApi";
import { Claim, DisasterEvent, NewClaim } from "../types/relief";

// Disaster relief, on the farmer's phone.
//
// NO REDUX SLICE FOR THIS ONE, deliberately.
//
// The other features keep their data in the store because several screens
// need it at once - the soil test screen and the My Lands tab both read the
// same lands. Relief is read by one screen, which opens, loads, and closes.
// A slice would be machinery with nothing to carry.
//
// This is worth saying out loud because "we used Redux for everything" is a
// worse answer than "we used Redux where two screens shared state".

function messageFrom(e: unknown): string {
  return e instanceof Error
    ? e.message
    : "Could not reach the server. Check your connection.";
}

export function useRelief() {
  const farmer = useAppSelector((s) => s.auth.farmer);

  const [disasters, setDisasters] = useState<DisasterEvent[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // useCallback so the identity stays stable, which lets the effect below
  // list it as a dependency without re-running on every render.
  const load = useCallback(async () => {
    if (!farmer) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      // Both at once. They do not depend on each other, so waiting for one
      // then the other would make the screen twice as slow for nothing.
      const [d, c] = await Promise.all([
        reliefApi.getOpenDisasters(farmer.farmer_id),
        reliefApi.getMyClaims(farmer.farmer_id),
      ]);

      setDisasters(d);
      setClaims(c);
    } catch (e) {
      setErrorMessage(messageFrom(e));
    } finally {
      setLoading(false);
    }
  }, [farmer]);

  useEffect(() => {
    load();
  }, [load]);

  // Ask for compensation. Returns true if it worked, so the screen knows
  // whether to close the form.
  async function claim(
    eventId: number,
    landCropId: number,
    areaHa: number,
    note: string
  ): Promise<boolean> {
    if (!farmer) {
      return false;
    }

    setSaving(true);
    setErrorMessage(null);

    const body: NewClaim = {
      farmer_id: farmer.farmer_id,
      event_id: eventId,
      land_crop_id: landCropId,
      claimed_area_ha: areaHa,
      farmer_note: note,
    };

    try {
      await reliefApi.submitClaim(body);

      // Reload rather than pushing the new claim into the list by hand.
      // The server fills in the crop name, the rate and the registered
      // area, and guessing those here would be a second copy of its rules.
      await load();
      return true;
    } catch (e) {
      setErrorMessage(messageFrom(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function clearError() {
    setErrorMessage(null);
  }

  return {
    disasters,
    claims,
    loading,
    saving,
    errorMessage,
    reload: load,
    claim,
    clearError,
  };
}
