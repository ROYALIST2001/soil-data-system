import { useAppDispatch } from "../store";
import {
  getFieldHistory,
  getAreaHistory,
  getDistrictHistory,
  getClusters,
  NotEnoughDataError,
} from "../api/analyticsApi";
import {
  historyStarted,
  historySucceeded,
  historyFailed,
  clustersStarted,
  clustersSucceeded,
  clustersNotEnoughData,
  clustersFailed,
} from "../store/analyticsSlice";

export function useAnalytics() {
  const dispatch = useAppDispatch();

  // ---------- HISTORY ----------
  //
  // One function handles all three zoom levels.
  // The 'level' decides which endpoint to call.
  async function fetchHistory(
    level: "field" | "area" | "district",
    params: { anchorId?: number; lat?: number; lng?: number; districtId?: number }
  ) {
    dispatch(historyStarted());

    try {
      let result;

      if (level === "field" && params.anchorId !== undefined) {
        result = await getFieldHistory(params.anchorId);

      } else if (level === "area" && params.lat !== undefined && params.lng !== undefined) {
        result = await getAreaHistory(params.lat, params.lng);

      } else if (level === "district" && params.districtId !== undefined) {
        result = await getDistrictHistory(params.districtId);

      } else {
        dispatch(historyFailed("Missing information for this zoom level."));
        return;
      }

      dispatch(historySucceeded(result));

    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not load the history.";
      dispatch(historyFailed(message));
    }
  }

  // ---------- CLUSTERS ----------
  async function fetchClusters() {
    dispatch(clustersStarted());

    try {
      const result = await getClusters();
      dispatch(clustersSucceeded(result));

    } catch (e) {
      // Not enough districts yet. This is NORMAL, not an error.
      // We show a calm explanation, not a red crash message.
      if (e instanceof NotEnoughDataError) {
        dispatch(clustersNotEnoughData(e.message));
        return;
      }

      const message =
        e instanceof Error ? e.message : "Could not load the regions.";
      dispatch(clustersFailed(message));
    }
  }

  return { fetchHistory, fetchClusters };
}
