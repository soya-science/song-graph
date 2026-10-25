import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset path relative, so dist/ works on any static host or subpath.
export default defineConfig({
  base: "./",
  plugins: [react()],
  optimizeDeps: {
    include: ["three", "three/examples/jsm/controls/OrbitControls.js", "@react-three/fiber", "react", "react-dom/client"],
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
