import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "test" ? [] : [cloudflare()])],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    environmentMatchGlobs: [["tests/app/**", "jsdom"]],
  },
}));
