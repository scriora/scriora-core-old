import { randomUUID } from "node:crypto";
import { outboxFollowUp, retryDelayMs } from "@scriora/domain";
import {
  type LinkedInPublishPorts,
  type PublicPublishAttempt,
  publicationFingerprint,
  publishLinkedInText,
  type StoredPublishAttempt,
} from "../linkedin/publish.js";

export type OutboxCommand = {
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  command: string;
  payload: { text: string; mediaAssetId?: string };
  state: "PENDING" | "PROCESSING" | "PUBLISHED" | "FAILED";
  attemptCount: number;
};

export type OutboxStore = {
  enqueue(input: {
    workspaceId: string;
    idempotencyKey: string;
    text: string;
    mediaAssetId?: string;
    nextAttemptAt?: Date;
  }): Promise<void>;
  claimDue(limit: number): Promise<OutboxCommand[]>;
  listByState(
    workspaceId: string,
    state: OutboxCommand["state"],
  ): Promise<OutboxCommand[]>;
  complete(input: {
    workspaceId: string;
    id: string;
    state: "PUBLISHED" | "FAILED" | "PENDING";
    lastError: string | null;
    nextAttemptAt?: Date;
  }): Promise<void>;
  reschedule(input: {
    workspaceId: string;
    idempotencyKey: string;
    nextAttemptAt: Date;
  }): Promise<"ok" | "not_found" | "not_pending">;
};

export type LinkedInDispatchPorts = LinkedInPublishPorts & {
  outbox: OutboxStore;
};

export function createMemoryOutboxStore(): OutboxStore {
  const rows = new Map<string, OutboxCommand & { nextAttemptAt: number }>();
  return {
    async enqueue(input) {
      const key = `${input.workspaceId}:${input.idempotencyKey}`;
      if (rows.has(key)) {
        return;
      }
      rows.set(key, {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
        command: "linkedin.publish_text",
        payload: {
          text: input.text,
          ...(input.mediaAssetId ? { mediaAssetId: input.mediaAssetId } : {}),
        },
        state: "PENDING",
        attemptCount: 0,
        nextAttemptAt: input.nextAttemptAt?.getTime() ?? 0,
      });
    },
    async listByState(workspaceId, state) {
      return [...rows.values()]
        .filter((row) => row.workspaceId === workspaceId && row.state === state)
        .map((row) => ({ ...row }));
    },
    async claimDue(limit) {
      const now = Date.now();
      const claimed: OutboxCommand[] = [];
      for (const row of rows.values()) {
        if (claimed.length >= limit) {
          break;
        }
        if (
          (row.state === "PENDING" || row.state === "PROCESSING") &&
          row.nextAttemptAt <= now
        ) {
          row.state = "PROCESSING";
          row.attemptCount += 1;
          claimed.push({ ...row });
        }
      }
      return claimed;
    },
    async complete(input) {
      for (const row of rows.values()) {
        if (row.id !== input.id) {
          continue;
        }
        row.state = input.state;
        if (input.nextAttemptAt) {
          row.nextAttemptAt = input.nextAttemptAt.getTime();
        }
      }
    },
    async reschedule(input) {
      const key = `${input.workspaceId}:${input.idempotencyKey}`;
      const row = rows.get(key);
      if (!row) {
        return "not_found";
      }
      if (row.state !== "PENDING") {
        return "not_pending";
      }
      row.nextAttemptAt = input.nextAttemptAt.getTime();
      return "ok";
    },
  };
}

export async function enqueueLinkedInText(
  ports: LinkedInDispatchPorts,
  input: {
    workspaceId: string;
    idempotencyKey: string;
    text: string;
    mediaAssetId?: string;
    nextAttemptAt?: Date;
  },
): Promise<
  | { ok: true }
  | { ok: false; error: "conflict" | "not_connected" | "publish_denied" }
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
  if (existing && existing.fingerprint !== fingerprint) {
    return { ok: false, error: "conflict" };
  }
  if (!existing) {
    const reserved: StoredPublishAttempt = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      fingerprint,
      status: "RESERVED",
      remoteOperationId: null,
      externalPostId: null,
      lastError: null,
      confirmedAt: null,
    };
    await ports.store.saveAttempt(reserved);
  }
  await ports.outbox.enqueue(input);
  return { ok: true };
}

export async function processDueOutbox(
  ports: LinkedInDispatchPorts,
  input: { limit?: number; now?: Date } = {},
): Promise<number> {
  const claimed = await ports.outbox.claimDue(input.limit ?? 8);
  for (const command of claimed) {
    const result = await publishLinkedInText(ports, {
      workspaceId: command.workspaceId,
      idempotencyKey: command.idempotencyKey,
      text: command.payload.text,
      ...(command.payload.mediaAssetId
        ? { mediaAssetId: command.payload.mediaAssetId }
        : {}),
    });
    if (!result.ok) {
      await ports.outbox.complete({
        workspaceId: command.workspaceId,
        id: command.id,
        state: "FAILED",
        lastError: result.error,
      });
      continue;
    }
    const follow = outboxFollowUp(result.attempt.status, command.attemptCount);
    if (follow === "delivered") {
      await ports.outbox.complete({
        workspaceId: command.workspaceId,
        id: command.id,
        state: "PUBLISHED",
        lastError: null,
      });
      continue;
    }
    if (follow === "dead") {
      await ports.outbox.complete({
        workspaceId: command.workspaceId,
        id: command.id,
        state: "FAILED",
        lastError: result.attempt.lastError ?? result.attempt.status,
      });
      continue;
    }
    await ports.outbox.complete({
      workspaceId: command.workspaceId,
      id: command.id,
      state: "PENDING",
      lastError: result.attempt.lastError,
      nextAttemptAt: new Date(
        (input.now ?? new Date()).getTime() +
          retryDelayMs(command.attemptCount),
      ),
    });
  }
  return claimed.length;
}

export async function dispatchLinkedInText(
  ports: LinkedInDispatchPorts,
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
  const queued = await enqueueLinkedInText(ports, input);
  if (!queued.ok) {
    return queued;
  }
  await processDueOutbox(ports);
  const stored = await ports.store.getAttempt(
    input.workspaceId,
    input.idempotencyKey,
  );
  if (!stored) {
    return { ok: false, error: "not_connected" };
  }
  return {
    ok: true,
    attempt: {
      idempotencyKey: stored.idempotencyKey,
      status: stored.status,
      remoteOperationId: stored.remoteOperationId,
      externalPostId: stored.externalPostId,
      confirmedAt: stored.confirmedAt,
      lastError: stored.lastError,
    },
  };
}
