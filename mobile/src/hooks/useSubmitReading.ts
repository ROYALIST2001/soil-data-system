import { useAppDispatch } from "../store";
import { createReading, getReading } from "../api/readingApi";
import { NewReading } from "../types/reading";
import {
  submitStarted,
  submitSucceeded,
  submitFailed,
} from "../store/readingSlice";

export function useSubmitReading() {
  const dispatch = useAppDispatch();

  async function submit(reading: NewReading) {

    // STEP 1: tell the store we started.
    // The screen sees this and shows "Saving...".
    dispatch(submitStarted());

    try {
      // STEP 2: send the reading. We get back only the new id.
      const created = await createReading(reading);

      // STEP 3: read the FULL reading back.
      //
      // Why? Because we want to show the anchor_id and district_id,
      // which the Go server worked out. The POST reply has only the id.
      //
      // IMPROVEMENT FOR LATER: make POST return the full reading,
      // so we only need one request instead of two.
      const full = await getReading(created.reading_id);

      // STEP 4: put the result in the store.
      // The app automatically moves to the result screen.
      dispatch(submitSucceeded(full));

    } catch (e) {
      // STEP 5: anything went wrong. Show one clear message.
      // This covers: no WiFi, wrong address, server error, bad data.
      dispatch(submitFailed("Could not save the reading. Check the connection."));
    }
  }

  // Give the screen one simple function to call.
  return { submit };
}
