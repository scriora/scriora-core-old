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

export const publishAttemptStatuses = [
  "RESERVED",
  "DISPATCHING",
  "PLATFORM_PENDING",
  "SUCCEEDED",
  "UNKNOWN_EXTERNAL_STATE",
  "FAILED_PERMANENT",
] as const;
export type PublishAttemptStatus = (typeof publishAttemptStatuses)[number];

export type ExistingPublishAttempt = {
  id: string;
  fingerprint: string;
  status: PublishAttemptStatus;
};

export type IdempotencyDecision =
  | { kind: "reserve" }
  | { kind: "replay"; attempt: ExistingPublishAttempt }
  | { kind: "reconcile_only"; attempt: ExistingPublishAttempt }
  | { kind: "conflict"; status: 409 };

export function decideIdempotency(
  existing: ExistingPublishAttempt | null,
  fingerprint: string,
): IdempotencyDecision {
  if (!existing) {
    return { kind: "reserve" };
  }
  if (existing.fingerprint !== fingerprint) {
    return { kind: "conflict", status: 409 };
  }
  if (existing.status === "UNKNOWN_EXTERNAL_STATE") {
    return { kind: "reconcile_only", attempt: existing };
  }
  return { kind: "replay", attempt: existing };
}

export const oauthStateTtlMs = 10 * 60 * 1000;

export type OAuthPendingDecision = "ok" | "expired" | "reused";

export function inspectOAuthPending(input: {
  consumedAt: Date | null;
  expiresAt: Date;
  now: Date;
}): OAuthPendingDecision {
  if (input.consumedAt) {
    return "reused";
  }
  if (input.now >= input.expiresAt) {
    return "expired";
  }
  return "ok";
}
