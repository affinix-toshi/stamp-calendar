import { it, expect } from "vitest";

it("tests/app runs in jsdom", () => {
  expect(typeof document).not.toBe("undefined");
});
