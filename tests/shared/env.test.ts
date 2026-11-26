import { it, expect } from "vitest";

it("tests/shared runs in node", () => {
  expect(typeof document).toBe("undefined");
});
