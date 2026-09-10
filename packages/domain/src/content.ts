import { err, ok, type Result } from "@scriora/shared";

export const operatingModes = ["CLASSIC", "AGENT", "MISSION"] as const;
export type OperatingMode = (typeof operatingModes)[number];

export const contentStates = [
  "IDEA",
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
  "ARCHIVED",
] as const;
export type ContentState = (typeof contentStates)[number];

const allowed: Record<ContentState, ReadonlyArray<ContentState>> = {
  IDEA: ["DRAFT"],
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["SCHEDULED", "FAILED"],
  REJECTED: ["DRAFT"],
  SCHEDULED: ["PUBLISHED", "FAILED"],
  PUBLISHED: ["ARCHIVED"],
  FAILED: ["DRAFT"],
  ARCHIVED: [],
};

export function canTransition(from: ContentState, to: ContentState): boolean {
  return allowed[from].includes(to);
}

export function transition(
  from: ContentState,
  to: ContentState,
): Result<ContentState, string> {
  if (!canTransition(from, to)) {
    return err(`illegal content transition ${from} -> ${to}`);
  }
  return ok(to);
}

export function canLiveDispatch(state: ContentState): boolean {
  return state === "APPROVED" || state === "SCHEDULED";
}
