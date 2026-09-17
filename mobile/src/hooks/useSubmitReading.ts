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
    dispatch(submitStarted());

    try {
      // STEP 2: send the reading. We get back only the new id.
      const created = await createReading(reading);

      // STEP 3: read the full reading back, so we can show
      // the anchor and district the Go server worked out.
      const full = await getReading(created.reading_id);

      // STEP 4: put the result in the store.
      dispatch(submitSucceeded(full));

    } catch (e) {
      // STEP 5: CHANGED - show the REAL message.
      //
      // Before, every error showed "check the connection",
      // even a clear pH problem. That was confusing.
      //
      // In TypeScript, the caught value has type "unknown",
      // because JavaScript lets you throw anything.
      // So we must CHECK before we can read e.message.
      const message =
        e instanceof Error
          ? e.message // the real message, e.g. "pH must be between 0 and 14"
          : "Could not save the reading. Check the connection.";

      dispatch(submitFailed(message));
    }
  }

  return { submit };
}
