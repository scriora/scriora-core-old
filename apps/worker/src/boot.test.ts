import { describe, expect, it } from "vitest";
import { bootWorker } from "./boot.js";

describe("worker", () => {
  it("starts idle until queues exist", () => {
    expect(bootWorker().status).toBe("idle");
  });
});
