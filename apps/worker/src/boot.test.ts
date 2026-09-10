import { describe, expect, it } from "vitest";
import { bootWorker } from "./boot.js";

describe("worker", () => {
  it("is ready to poll the publish outbox", () => {
    expect(bootWorker().status).toBe("ready");
  });
});
