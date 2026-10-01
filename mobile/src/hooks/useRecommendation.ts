import { useAppDispatch } from "../store";
import { getRecommendation, FlaggedReadingError } from "../api/recommendationApi";
import {
  recommendationStarted,
  recommendationSucceeded,
  recommendationFlagged,
  recommendationFailed,
} from "../store/recommendationSlice";

export function useRecommendation() {
  const dispatch = useAppDispatch();

  async function fetchRecommendation(readingId: number) {

    // STEP 1: tell the store we started.
    // The button will change to "Getting advice...".
    dispatch(recommendationStarted());

    try {
      // STEP 2: ask the Go API.
      const result = await getRecommendation(readingId);

      // STEP 3: save it. The app moves to the recommendation screen.
      dispatch(recommendationSucceeded(result));

    } catch (e) {

      // STEP 4: was the reading FLAGGED in the quality check?
      //
      // This is not really an error. The request was fine.
      // The DATA is the problem. So we show a calm orange
      // explanation, not a red crash message.
      if (e instanceof FlaggedReadingError) {
        dispatch(recommendationFlagged(e.message));
        return;
      }

      // STEP 5: a real error. No connection, or the AI service is down.
      const message =
        e instanceof Error
          ? e.message
          : "Could not get the recommendation. Check the connection.";

      dispatch(recommendationFailed(message));
    }
  }

  return { fetchRecommendation };
}
