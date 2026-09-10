import { describe, expect, it } from "vitest";
import { requiresHumanApproval } from "./index.js";

describe("autonomy", () => {
  it("keeps a human gate below L4", () => {
    expect(requiresHumanApproval(0)).toBe(true);
    expect(requiresHumanApproval(3)).toBe(true);
  });
});
