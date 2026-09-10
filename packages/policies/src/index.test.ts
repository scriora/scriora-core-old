import { describe, expect, it } from "vitest";
import {
  createMemoryGovernanceStore,
  evaluateLiveDispatch,
  requiresHumanApproval,
} from "./index.js";

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

describe("schedule collisions", () => {
  it("rejects a second post in the same UTC minute", async () => {
    const store = createMemoryGovernanceStore();
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    async function approvedDraft(body: string) {
      const draft = await store.createDraft({ workspaceId, body });
      const submitted = await store.submit(workspaceId, draft.id);
      if (!submitted.ok) {
        throw new Error(submitted.error);
      }
      const decided = await store.decide({
        workspaceId,
        approvalId: submitted.approval.id,
        decision: "APPROVED",
        actor: "Ada",
      });
      if (!decided.ok) {
        throw new Error(decided.error);
      }
      return decided.content.id;
    }
    const first = await approvedDraft("One");
    const second = await approvedDraft("Two");
    const at = new Date("2026-09-10T12:00:30.000Z");
    expect(
      await store.markScheduled({
        workspaceId,
        contentId: first,
        scheduledAt: at,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await store.markScheduled({
        workspaceId,
        contentId: second,
        scheduledAt: new Date("2026-09-10T12:00:59.000Z"),
      }),
    ).toEqual({ ok: false, error: "conflict" });
    expect(
      await store.markScheduled({
        workspaceId,
        contentId: second,
        scheduledAt: new Date("2026-09-10T12:01:00.000Z"),
      }),
    ).toMatchObject({ ok: true });
  });
});
