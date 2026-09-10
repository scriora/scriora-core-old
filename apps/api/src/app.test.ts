import { describe, expect, it } from "vitest";
import { buildApi } from "./app.js";

describe("api", () => {
  it("serves health without claiming publish", async () => {
    const app = await buildApi();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: "scriora-api",
    });
    await app.close();
  });
});
