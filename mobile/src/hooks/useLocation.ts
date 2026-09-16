import { useState } from "react";
import * as Location from "expo-location";

// The shape of the answer this hook gives.
interface Coordinates {
  lat: number;
  lng: number;
}

export function useLocation() {
  // Is the phone still finding the position?
  const [loading, setLoading] = useState(false);

  // Did something go wrong?
  const [error, setError] = useState<string | null>(null);

  // Ask the phone for the current position.
  async function getCurrentLocation(): Promise<Coordinates | null> {
    setLoading(true);
    setError(null); // clear any old error

    try {
      // STEP 1: ask the user for permission.
      // "Foreground" means only while the app is open. We do not need more.
      const { status } = await Location.requestForegroundPermissionsAsync();

      // STEP 2: the user said no. Handle it politely. Do NOT crash.
      if (status !== "granted") {
        setError("Location permission was denied.");
        return null;
      }

      // STEP 3: read the position.
      // Accuracy.High asks for the REAL GPS chip.
      // This is very important for our 100 metre anchor rule.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // STEP 4: return ONLY the two numbers we need.
      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

    } catch (e) {
      // Something unexpected happened. For example, GPS is switched off.
      setError("Could not get the location. Please try again.");
      return null;

    } finally {
      // finally ALWAYS runs, after success or after failure.
      // Without this, the button could say "Getting location..." forever.
      setLoading(false);
    }
  }

  // Give the screen a function to call, and two values to display.
  return { getCurrentLocation, loading, error };
}
