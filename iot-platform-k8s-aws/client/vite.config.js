import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
    allowedHosts: [
     
      "all",

      // Se pot adauga si alte tuneluri Cloudflare daca se testeaza mai multe
    ],
  },
});
