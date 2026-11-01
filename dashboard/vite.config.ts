import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite is the tool that runs this website while you develop it, and bundles
// it for deployment. It is to this dashboard what Expo is to the phone app.
export default defineConfig({
  plugins: [react()],
  server: {
    // 5173 is Vite's default, and it is the address the Go API's CORS rules
    // allow. Change one and you must change the other, or the browser will
    // block every request. See api/internal/controller/cors.go.
    port: 5173,

    // Listen on all addresses, not just localhost, so the dashboard can be
    // opened from another computer on the same network - which is how an
    // officer would actually use it.
    host: true,
  },
});
