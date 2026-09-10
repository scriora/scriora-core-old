import { describe, expect, it } from "vitest";
import { evaluateLiveDispatch, requiresHumanApproval } from "./index.js";

describe("autonomy", () => {
  it("keeps a human gate below L4", () => {
    expect(requiresHumanApproval(0)).toBe(true);
    expect(requiresHumanApproval(3)).toBe(true);
  });
});

describe("live dispatch gate", () => {
  it("rejects drafts and paused workspaces", () => {
    expect(
      evaluateLiveDispatch({
        dispatchPaused: false,
        contentState: "DRAFT",
        approvalStatus: null,
      }),
    ).toEqual({ ok: false, error: "unapproved" });
    expect(
      evaluateLiveDispatch({
        dispatchPaused: true,
        contentState: "APPROVED",
        approvalStatus: "APPROVED",
      }),
    ).toEqual({ ok: false, error: "killswitch" });
  });

  it("allows only approved live content", () => {
    expect(
      evaluateLiveDispatch({
        dispatchPaused: false,
        contentState: "APPROVED",
        approvalStatus: "APPROVED",
      }),
    ).toEqual({ ok: true });
  });
});
