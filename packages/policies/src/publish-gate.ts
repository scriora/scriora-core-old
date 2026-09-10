import { type ContentState, canLiveDispatch } from "@scriora/domain";

export const classicAutonomyModes = ["CAREFUL", "BALANCED"] as const;
export type ClassicAutonomyMode = (typeof classicAutonomyModes)[number];

export const approvalStatuses = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];

export type LiveDispatchDenial = "killswitch" | "unapproved";

export function evaluateLiveDispatch(input: {
  dispatchPaused: boolean;
  contentState: ContentState;
  approvalStatus: ApprovalStatus | null;
}): { ok: true } | { ok: false; error: LiveDispatchDenial } {
  if (input.dispatchPaused) {
    return { ok: false, error: "killswitch" };
  }
  if (
    !canLiveDispatch(input.contentState) ||
    input.approvalStatus !== "APPROVED"
  ) {
    return { ok: false, error: "unapproved" };
  }
  return { ok: true };
}
