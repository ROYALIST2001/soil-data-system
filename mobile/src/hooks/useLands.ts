import { useEffect, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "../store";
import * as landApi from "../api/landApi";
import { NewLandCrop } from "../types/land";
import {
  cropAdded,
  cropRemoved,
  errorCleared,
  landAdded,
  landRemoved,
  landsFailed,
  landsLoaded,
  landsLoading,
  saveFailed,
  saveStarted,
} from "../store/landSlice";

// The longest the app will EVER sit on the startup spinner.
//
// Comfortably longer than the 12 second request timeout, so in normal use
// the request decides the outcome and this never fires. It exists purely so
// that nothing can leave the farmer stuck.
const MAX_WAIT_MS = 15000;

// Turn any thrown thing into a sentence we can show.
function messageFrom(e: unknown): string {
  return e instanceof Error
    ? e.message
    : "Could not reach the server. Check your connection.";
}

// ---------------------------------------------------------------------
// useLandsBootstrap - fetches the farmer's lands once, after they log in.
//
// SEPARATE FROM useLands BELOW, and called in exactly ONE place:
// AppNavigator. Same lesson as the session restore in useAuth: an effect
// inside a shared hook runs again on every screen that uses the hook, and
// a slow reply can then overwrite work the farmer has just done.
// ---------------------------------------------------------------------
export function useLandsBootstrap() {
  const dispatch = useAppDispatch();

  const authStatus = useAppSelector((s) => s.auth.status);
  const farmer = useAppSelector((s) => s.auth.farmer);
  const landStatus = useAppSelector((s) => s.land.status);

  // Which farmer we have already started loading for.
  //
  // THIS REPLACES A CHECK ON landStatus, AND THE REASON MATTERS.
  //
  // The obvious way to write "only load once" is to look at the status and
  // skip if it is no longer "unloaded". That is what this did, with
  // landStatus listed as a dependency - and it quietly broke itself.
  //
  // The first thing the load does is dispatch landsLoading(), which CHANGES
  // landStatus. Changing a dependency re-runs the effect, and re-running an
  // effect first fires the previous run's cleanup, which set cancelled to
  // true. So the request that had just been started was cancelled a
  // millisecond later, the lands arrived and were thrown away, and the
  // status sat on "loading" for ever.
  //
  // The farmer saw "Loading your land...", then the registration form -
  // every single time they logged in, even with land already registered.
  //
  // A ref does not re-run the effect when it changes, so the thing that
  // records "we started" can no longer interrupt the start.
  const startedFor = useRef<number | null>(null);

  useEffect(() => {
    // Logged out: let the next farmer load their own land.
    if (authStatus !== "loggedIn" || !farmer) {
      startedFor.current = null;
      return;
    }

    // Already loading or loaded for this farmer.
    if (startedFor.current === farmer.farmer_id) {
      return;
    }
    startedFor.current = farmer.farmer_id;

    let cancelled = false;

    async function load() {
      dispatch(landsLoading());

      try {
        const lands = await landApi.getLands(farmer!.farmer_id);
        if (!cancelled) {
          dispatch(landsLoaded(lands));
        }
      } catch (e) {
        if (!cancelled) {
          dispatch(landsFailed(messageFrom(e)));
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };

    // landStatus is deliberately NOT a dependency. See the comment above.
  }, [authStatus, farmer, dispatch]);

  // A LAST-RESORT STOP.
  //
  // Everything below this line exists because the app once sat on a
  // "Loading your land" spinner forever. The request never came back, the
  // timeout we relied on was ignored, and the farmer had no way forward.
  //
  // So this no longer trusts the request to finish at all. After a few
  // seconds we stop waiting, whatever the network is doing. Being wrong
  // about how many lands somebody has is a small problem. An app that
  // never opens is not.
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (landStatus !== "unloaded" && landStatus !== "loading") {
      // Finished, one way or the other. Clear the flag so a later login on
      // the same phone starts its wait fresh rather than inheriting a
      // give-up from the previous farmer.
      setGaveUp(false);
      return;
    }

    const timer = setTimeout(() => setGaveUp(true), MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [landStatus]);

  return {
    // True while we genuinely do not know yet whether this farmer has land,
    // and have not waited too long.
    checking:
      !gaveUp && (landStatus === "unloaded" || landStatus === "loading"),
  };
}

// ---------------------------------------------------------------------
// useLands - reading and changing the lands. No effects on mount.
// ---------------------------------------------------------------------
export function useLands() {
  const dispatch = useAppDispatch();

  const farmer = useAppSelector((s) => s.auth.farmer);
  const lands = useAppSelector((s) => s.land.lands);
  const status = useAppSelector((s) => s.land.status);
  const saving = useAppSelector((s) => s.land.saving);
  const errorMessage = useAppSelector((s) => s.land.errorMessage);

  // Ask the server again from scratch. Used by pull-to-refresh and by the
  // retry button after a failure.
  async function reload() {
    if (!farmer) {
      return;
    }

    dispatch(landsLoading());

    try {
      const fresh = await landApi.getLands(farmer.farmer_id);
      dispatch(landsLoaded(fresh));
    } catch (e) {
      dispatch(landsFailed(messageFrom(e)));
    }
  }

  // Register a new land with its crops.
  //
  // Returns true on success, so the screen knows whether to go back. We
  // return a value instead of navigating in here, because a hook that knows
  // about screens is a hook that can only ever be used by one screen.
  async function addLand(
    name: string,
    gnDivision: string,
    sizeHa: number,
    crops: NewLandCrop[]
  ): Promise<boolean> {
    if (!farmer) {
      return false;
    }

    dispatch(saveStarted());

    try {
      const land = await landApi.createLand({
        farmer_id: farmer.farmer_id,
        name,
        gn_division: gnDivision,
        size_ha: sizeHa,
        crops,
      });

      dispatch(landAdded(land));
      return true;
    } catch (e) {
      dispatch(saveFailed(messageFrom(e)));
      return false;
    }
  }

  // Add one more crop to a land that already exists.
  async function addCropToLand(
    landId: number,
    crop: string,
    sizeHa: number
  ): Promise<boolean> {
    if (!farmer) {
      return false;
    }

    dispatch(saveStarted());

    try {
      const saved = await landApi.addCrop(landId, {
        farmer_id: farmer.farmer_id,
        crop,
        size_ha: sizeHa,
      });

      dispatch(cropAdded({ landId, crop: saved }));
      return true;
    } catch (e) {
      dispatch(saveFailed(messageFrom(e)));
      return false;
    }
  }

  // Remove a whole land.
  async function removeLand(landId: number): Promise<boolean> {
    if (!farmer) {
      return false;
    }

    dispatch(saveStarted());

    try {
      await landApi.deleteLand(landId, farmer.farmer_id);
      dispatch(landRemoved(landId));
      return true;
    } catch (e) {
      dispatch(saveFailed(messageFrom(e)));
      return false;
    }
  }

  // Remove one crop.
  //
  // The server refuses to remove the LAST crop on a land, and sends back a
  // sentence saying why. We show that rather than inventing our own, so the
  // rule only lives in one place.
  async function removeCrop(cropId: number): Promise<boolean> {
    if (!farmer) {
      return false;
    }

    dispatch(saveStarted());

    try {
      await landApi.deleteCrop(cropId, farmer.farmer_id);
      dispatch(cropRemoved(cropId));
      return true;
    } catch (e) {
      dispatch(saveFailed(messageFrom(e)));
      return false;
    }
  }

  function clearError() {
    dispatch(errorCleared());
  }

  return {
    lands,
    status,
    saving,
    errorMessage,
    reload,
    addLand,
    addCropToLand,
    removeLand,
    removeCrop,
    clearError,
  };
}
