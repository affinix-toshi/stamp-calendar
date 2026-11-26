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
          exclude: ["tests/app/**", "tests/rules/**"],
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
      {
        // Database エミュレーターが必要。npm run test:rules からだけ動かす
        extends: true,
        test: {
          name: "rules",
          environment: "node",
          include: ["tests/rules/**/*.test.ts"],
          testTimeout: 20000,
          hookTimeout: 20000,
        },
      },
    ],
  },
}));
