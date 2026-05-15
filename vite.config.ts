import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;
// scripts/dev-instance.sh sets these so multiple worktrees can run `tauri dev`
// in parallel without colliding on port 1422. Defaults match the single-instance
// baseline so plain `npm run dev` still works.
const port = Number(process.env.ALETHEIA_PORT ?? 1422);
const hmrPort = Number(process.env.ALETHEIA_HMR_PORT ?? port + 1);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  clearScreen: false,
  server: {
    port,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: hmrPort } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
