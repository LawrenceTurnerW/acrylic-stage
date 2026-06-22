import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vite は renderer/ をルートとしてビルドする。
// 出力は renderer/dist/。Electron は dev 時 localhost:5173 を読みに行く。
export default defineConfig({
  root: path.resolve(__dirname, "renderer"),
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
