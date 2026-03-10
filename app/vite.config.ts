import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Needed for Electron file:// loading in packaged app.
  base: "./",
  plugins: [react()],
});
