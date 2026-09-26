import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// base "./": Electron carga dist/index.html desde disco (file://).
export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), react()],
});
