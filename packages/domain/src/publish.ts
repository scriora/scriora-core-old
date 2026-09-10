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

export const outboxRetryCapsMs = [30_000, 120_000, 480_000] as const;
export const maxOutboxAttempts = 3;

export function retryDelayMs(
  attemptNumber: number,
  random: () => number = Math.random,
): number {
  const index =
    Math.min(Math.max(attemptNumber, 1), outboxRetryCapsMs.length) - 1;
  const cap = outboxRetryCapsMs[index] ?? outboxRetryCapsMs[0];
  return Math.floor(random() * cap);
}

export function outboxFollowUp(
  attemptStatus: PublishAttemptStatus,
  attemptCount: number,
): "delivered" | "dead" | "retry" {
  if (attemptStatus === "SUCCEEDED" || attemptStatus === "PLATFORM_PENDING") {
    return "delivered";
  }
  if (
    attemptStatus === "FAILED_PERMANENT" ||
    attemptStatus === "UNKNOWN_EXTERNAL_STATE" ||
    attemptCount >= maxOutboxAttempts
  ) {
    return "dead";
  }
  return "retry";
}
