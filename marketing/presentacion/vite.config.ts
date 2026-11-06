import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: import.meta.dirname,
  base: "/presentacion/",
  publicDir: path.resolve(import.meta.dirname, "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "../../client/public/presentacion"),
    // Keep media files while replacing generated JS/CSS. No app paths are touched.
    emptyOutDir: false,
  },
});
