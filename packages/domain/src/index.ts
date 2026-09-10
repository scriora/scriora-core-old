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
  | { kind: "dispatch"; attempt: ExistingPublishAttempt }
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
  if (existing.status === "RESERVED") {
    return { kind: "dispatch", attempt: existing };
  }
  if (
    existing.status === "SUCCEEDED" ||
    existing.status === "FAILED_PERMANENT"
  ) {
    return { kind: "replay", attempt: existing };
  }
  return { kind: "reconcile_only", attempt: existing };
}

export type LinkedInCreateObservation =
  | { kind: "candidate"; restliId: string }
  | { kind: "unknown_external_state" }
  | { kind: "permanent_failure"; detail: string };

export function observeLinkedInCreate(
  httpStatus: number,
  restliId: string | null,
): LinkedInCreateObservation {
  if ((httpStatus === 200 || httpStatus === 201) && restliId) {
    return { kind: "candidate", restliId };
  }
  if (httpStatus === 200 || httpStatus === 201) {
    return { kind: "unknown_external_state" };
  }
  if (
    httpStatus === 400 ||
    httpStatus === 401 ||
    httpStatus === 403 ||
    httpStatus === 404 ||
    httpStatus === 422
  ) {
    return { kind: "permanent_failure", detail: `http ${httpStatus}` };
  }
  return { kind: "unknown_external_state" };
}

export function observeLinkedInVerify(
  httpStatus: number,
): "verified" | "pending" {
  return httpStatus === 200 ? "verified" : "pending";
}

export function finalizePublishStatus(input: {
  create: LinkedInCreateObservation;
  verify: "verified" | "pending" | null;
}): {
  status: PublishAttemptStatus;
  remoteOperationId: string | null;
  externalPostId: string | null;
} {
  if (input.create.kind === "permanent_failure") {
    return {
      status: "FAILED_PERMANENT",
      remoteOperationId: null,
      externalPostId: null,
    };
  }
  if (input.create.kind === "unknown_external_state") {
    return {
      status: "UNKNOWN_EXTERNAL_STATE",
      remoteOperationId: null,
      externalPostId: null,
    };
  }
  if (input.verify === "verified") {
    return {
      status: "SUCCEEDED",
      remoteOperationId: input.create.restliId,
      externalPostId: input.create.restliId,
    };
  }
  return {
    status: "PLATFORM_PENDING",
    remoteOperationId: input.create.restliId,
    externalPostId: input.create.restliId,
  };
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
