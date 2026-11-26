import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "test" ? [] : [cloudflare()])],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/app/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "app",
          environment: "jsdom",
          include: ["tests/app/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
}));
