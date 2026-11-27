import { describe, it, expect } from "vitest";
import worker from "../src/worker/index";

describe("worker smoke", () => {
  it("GET /api/ping returns 200 {ok:true}", async () => {
    const res = await worker.fetch(new Request("http://localhost/api/ping"), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
