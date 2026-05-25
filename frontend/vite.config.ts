import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:3000",
      "/keys": "http://localhost:3000",
      "/instances": "http://localhost:3000",
      "/contact-lists": "http://localhost:3000",
      "/group-lists": "http://localhost:3000",
      "/admin": {
        target: "http://localhost:3000",
        bypass(req) {
          // Let browser page navigations fall through to the SPA
          if (req.headers.accept?.includes("text/html")) return req.url;
          return null;
        },
      },
    },
  },
});
