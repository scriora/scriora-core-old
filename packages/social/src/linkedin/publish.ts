import { randomUUID } from "node:crypto";
import type { CipherRecord, Vault } from "@scriora/crypto";
import { sha256Hex } from "@scriora/crypto";
import {
  decideIdempotency,
  finalizePublishStatus,
  observeLinkedInCreate,
  observeLinkedInVerify,
  type PublishAttemptStatus,
} from "@scriora/domain";

export type StoredPublishAttempt = {
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  fingerprint: string;
  status: PublishAttemptStatus;
  remoteOperationId: string | null;
  externalPostId: string | null;
  lastError: string | null;
  confirmedAt: Date | null;
};

export type LinkedInPublisher = {
  workspaceId: string;
  memberId: string;
  canPublish: boolean;
  tokenEnvelope: CipherRecord;
};

export type LinkedInShareCall = {
  httpStatus: number;
  restliId: string | null;
};

export type LinkedInPublishStore = {
  loadPublisher(workspaceId: string): Promise<LinkedInPublisher | null>;
  getAttempt(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<StoredPublishAttempt | null>;
  saveAttempt(attempt: StoredPublishAttempt): Promise<void>;
};

export type LinkedInPublishPorts = {
  now(): Date;
  vault: Vault;
  store: LinkedInPublishStore;
  createShare(input: {
    accessToken: string;
    authorUrn: string;
    text: string;
    workspaceId?: string;
    mediaAssetId?: string;
    imageAssetUrn?: string | null;
  }): Promise<LinkedInShareCall>;
  verifyShare(input: {
    accessToken: string;
    restliId: string;
  }): Promise<number>;
};

export type PublicPublishAttempt = {
  idempotencyKey: string;
  status: PublishAttemptStatus;
  remoteOperationId: string | null;
  externalPostId: string | null;
  confirmedAt: Date | null;
  lastError: string | null;
};

export function linkedinPersonUrn(memberId: string): string {
  return memberId.startsWith("urn:") ? memberId : `urn:li:person:${memberId}`;
}

export function linkedinTextShareBody(authorUrn: string, text: string) {
  return {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };
}

export function linkedinImageShareBody(
  authorUrn: string,
  text: string,
  assetUrn: string,
) {
  return {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "IMAGE",
        media: [
          {
            status: "READY",
            media: assetUrn,
          },
        ],
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };
}

export function publicationFingerprint(input: {
  workspaceId: string;
  memberId: string;
  text: string;
  mediaAssetId?: string;
}): string {
  return sha256Hex(
    `${input.workspaceId}|${input.memberId}|${input.text}|${input.mediaAssetId ?? ""}`,
  );
}

export function createMemoryLinkedInPublishStore(
  publishers: LinkedInPublisher[] = [],
): LinkedInPublishStore {
  const byWorkspace = new Map(
    publishers.map((publisher) => [publisher.workspaceId, publisher]),
  );
  const attempts = new Map<string, StoredPublishAttempt>();
  return {
    async loadPublisher(workspaceId) {
      return byWorkspace.get(workspaceId) ?? null;
    },
    async getAttempt(workspaceId, idempotencyKey) {
      return attempts.get(`${workspaceId}:${idempotencyKey}`) ?? null;
    },
    async saveAttempt(attempt) {
      attempts.set(`${attempt.workspaceId}:${attempt.idempotencyKey}`, attempt);
    },
  };
}

function toPublic(attempt: StoredPublishAttempt): PublicPublishAttempt {
  return {
    idempotencyKey: attempt.idempotencyKey,
    status: attempt.status,
    remoteOperationId: attempt.remoteOperationId,
    externalPostId: attempt.externalPostId,
    confirmedAt: attempt.confirmedAt,
    lastError: attempt.lastError,
  };
}

function readAccessToken(ports: LinkedInPublishPorts, envelope: CipherRecord) {
  const parsed = JSON.parse(
    new TextDecoder().decode(ports.vault.decrypt(envelope)),
  ) as { accessToken?: string };
  return parsed.accessToken ?? "";
}

async function verifyExisting(
  ports: LinkedInPublishPorts,
  publisher: LinkedInPublisher,
  attempt: StoredPublishAttempt,
): Promise<StoredPublishAttempt> {
  if (!attempt.remoteOperationId && !attempt.externalPostId) {
    return attempt;
  }
  const restliId = attempt.remoteOperationId ?? attempt.externalPostId;
  if (!restliId) {
    return attempt;
  }
  const accessToken = readAccessToken(ports, publisher.tokenEnvelope);
  let httpStatus = 0;
  try {
    httpStatus = await ports.verifyShare({ accessToken, restliId });
  } catch {
    return attempt;
  }
  const verify = observeLinkedInVerify(httpStatus);
  if (verify !== "verified") {
    return attempt;
  }
  const confirmed: StoredPublishAttempt = {
    ...attempt,
    status: "SUCCEEDED",
    confirmedAt: ports.now(),
    lastError: null,
  };
  await ports.store.saveAttempt(confirmed);
  return confirmed;
}

async function dispatchShare(
  ports: LinkedInPublishPorts,
  publisher: LinkedInPublisher,
  attempt: StoredPublishAttempt,
  text: string,
  image?: { mediaAssetId?: string; imageAssetUrn?: string | null },
): Promise<StoredPublishAttempt> {
  const accessToken = readAccessToken(ports, publisher.tokenEnvelope);
  const authorUrn = linkedinPersonUrn(publisher.memberId);
  let created: LinkedInShareCall;
  try {
    created = await ports.createShare({
      accessToken,
      authorUrn,
      text,
      workspaceId: publisher.workspaceId,
      ...(image?.mediaAssetId ? { mediaAssetId: image.mediaAssetId } : {}),
      ...(image?.imageAssetUrn ? { imageAssetUrn: image.imageAssetUrn } : {}),
    });
  } catch {
    const unknown: StoredPublishAttempt = {
      ...attempt,
      status: "UNKNOWN_EXTERNAL_STATE",
      lastError: "provider_call_interrupted",
    };
    await ports.store.saveAttempt(unknown);
    return unknown;
  }
  const observation = observeLinkedInCreate(
    created.httpStatus,
    created.restliId,
  );
  if (observation.kind === "candidate") {
    const pending: StoredPublishAttempt = {
      ...attempt,
      status: "PLATFORM_PENDING",
      remoteOperationId: observation.restliId,
      externalPostId: observation.restliId,
      lastError: null,
    };
    await ports.store.saveAttempt(pending);
    let verify: "verified" | "pending" = "pending";
    try {
      verify = observeLinkedInVerify(
        await ports.verifyShare({
          accessToken,
          restliId: observation.restliId,
        }),
      );
    } catch {
      verify = "pending";
    }
    const finalized = finalizePublishStatus({
      create: observation,
      verify,
    });
    const next: StoredPublishAttempt = {
      ...pending,
      status: finalized.status,
      remoteOperationId: finalized.remoteOperationId,
      externalPostId: finalized.externalPostId,
      confirmedAt:
        finalized.status === "SUCCEEDED" ? ports.now() : pending.confirmedAt,
      lastError:
        finalized.status === "PLATFORM_PENDING"
          ? "unverified_permission_limited"
          : null,
    };
    await ports.store.saveAttempt(next);
    return next;
  }
  const finalized = finalizePublishStatus({
    create: observation,
    verify: null,
  });
  const next: StoredPublishAttempt = {
    ...attempt,
    status: finalized.status,
    lastError:
      observation.kind === "permanent_failure"
        ? observation.detail
        : "ambiguous_provider_response",
  };
  await ports.store.saveAttempt(next);
  return next;
}

export async function publishLinkedInText(
  ports: LinkedInPublishPorts,
  input: {
    workspaceId: string;
    idempotencyKey: string;
    text: string;
    mediaAssetId?: string;
  },
): Promise<
  | { ok: true; attempt: PublicPublishAttempt }
  | {
      ok: false;
      error: "conflict" | "not_connected" | "publish_denied";
    }
> {
  const publisher = await ports.store.loadPublisher(input.workspaceId);
  if (!publisher) {
    return { ok: false, error: "not_connected" };
  }
  if (!publisher.canPublish) {
    return { ok: false, error: "publish_denied" };
  }
  const fingerprint = publicationFingerprint({
    workspaceId: input.workspaceId,
    memberId: publisher.memberId,
    text: input.text,
    ...(input.mediaAssetId ? { mediaAssetId: input.mediaAssetId } : {}),
  });
  const existing = await ports.store.getAttempt(
    input.workspaceId,
    input.idempotencyKey,
  );
  const decision = decideIdempotency(
    existing
      ? {
          id: existing.id,
          fingerprint: existing.fingerprint,
          status: existing.status,
        }
      : null,
    fingerprint,
  );
  if (decision.kind === "conflict") {
    return { ok: false, error: "conflict" };
  }
  if (decision.kind === "replay" && existing) {
    return { ok: true, attempt: toPublic(existing) };
  }
  if (decision.kind === "reconcile_only" && existing) {
    return {
      ok: true,
      attempt: toPublic(await verifyExisting(ports, publisher, existing)),
    };
  }
  const attempt: StoredPublishAttempt =
    decision.kind === "dispatch" && existing
      ? { ...existing, status: "DISPATCHING" }
      : {
          id: randomUUID(),
          workspaceId: input.workspaceId,
          idempotencyKey: input.idempotencyKey,
          fingerprint,
          status: "DISPATCHING",
          remoteOperationId: null,
          externalPostId: null,
          lastError: null,
          confirmedAt: null,
        };
  await ports.store.saveAttempt(attempt);
  const dispatched = await dispatchShare(
    ports,
    publisher,
    attempt,
    input.text,
    {
      ...(input.mediaAssetId ? { mediaAssetId: input.mediaAssetId } : {}),
    },
  );
  return { ok: true, attempt: toPublic(dispatched) };
}
