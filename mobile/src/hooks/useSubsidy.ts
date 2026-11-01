import { useCallback, useEffect, useState } from "react";

import { useAppSelector } from "../store";
import * as subsidyApi from "../api/subsidyApi";
import {
  NewSubsidyApplication, SubsidyApplication, SubsidyRound,
} from "../types/subsidy";

// The fertilizer subsidy, on the farmer's phone.
//
// NO REDUX SLICE, for the same reason as the relief screen: one screen
// reads this, and it opens, loads and closes. A slice would be machinery
// carrying nothing.

function messageFrom(e: unknown): string {
  return e instanceof Error
    ? e.message
    : "Could not reach the server. Check your connection.";
}

export function useSubsidy() {
  const farmer = useAppSelector((s) => s.auth.farmer);

  const [rounds, setRounds] = useState<SubsidyRound[]>([]);
  const [applications, setApplications] = useState<SubsidyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!farmer) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      // Both at once: they do not depend on each other, so waiting for one
      // then the other would make the screen twice as slow for nothing.
      const [r, a] = await Promise.all([
        subsidyApi.getOpenRounds(farmer.farmer_id),
        subsidyApi.getMyApplications(farmer.farmer_id),
      ]);

      setRounds(r);
      setApplications(a);
    } catch (e) {
      setErrorMessage(messageFrom(e));
    } finally {
      setLoading(false);
    }
  }, [farmer]);

  useEffect(() => {
    load();
  }, [load]);

  // Apply for the subsidy on one crop.
  async function apply(
    roundId: number,
    landCropId: number,
    note: string
  ): Promise<boolean> {
    if (!farmer) return false;

    setSaving(true);
    setErrorMessage(null);

    const body: NewSubsidyApplication = {
      farmer_id: farmer.farmer_id,
      round_id: roundId,
      land_crop_id: landCropId,
      farmer_note: note,
    };

    try {
      await subsidyApi.apply(body);

      // Reload rather than pushing the new row in by hand. The server fills
      // in the crop name, the rate and the registered area, and guessing
      // those here would be a second copy of its rules.
      await load();
      return true;
    } catch (e) {
      setErrorMessage(messageFrom(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // ---------- THE FARMER'S OWN TWO MOVES ----------

  // "Yes, the money arrived."
  async function confirmReceived(applicationId: number): Promise<boolean> {
    return farmerMove(() =>
      subsidyApi.confirmReceived(applicationId, farmer!.farmer_id, "")
    );
  }

  // "No, it never reached me."
  async function dispute(
    applicationId: number,
    note: string
  ): Promise<boolean> {
    return farmerMove(() =>
      subsidyApi.dispute(applicationId, farmer!.farmer_id, note)
    );
  }

  async function farmerMove(run: () => Promise<unknown>): Promise<boolean> {
    if (!farmer) return false;

    setSaving(true);
    setErrorMessage(null);

    try {
      await run();
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
    rounds,
    applications,
    loading,
    saving,
    errorMessage,
    reload: load,
    apply,
    confirmReceived,
    dispute,
    clearError,
  };
}
