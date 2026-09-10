import { randomUUID } from "node:crypto";
import type { TelemetryPollSlot } from "@scriora/domain";
import type { NormalizedSnapshot } from "./normalize.js";

export type TelemetryContext = {
  socialAccountId: string;
  externalPostId: string | null;
  capAnalytics: boolean;
  grantedScopes: string[];
};

export type StoredTelemetrySnapshot = {
  id: string;
  workspaceId: string;
  socialAccountId: string;
  externalPostId: string;
  snapshotType: "MANUAL" | "SCHEDULED";
  pollSlot: TelemetryPollSlot;
  dataCapability: NormalizedSnapshot["dataCapability"];
  sourceProduct: string;
  grantedScopes: string[];
  rawPayload: Record<string, unknown>;
  metrics: NormalizedSnapshot["metrics"];
};

export function createMemoryTelemetryStore(
  contexts: Array<{
    workspaceId: string;
    idempotencyKey: string;
    context: TelemetryContext;
  }> = [],
) {
  const byAttempt = new Map(
    contexts.map((row) => [
      `${row.workspaceId}:${row.idempotencyKey}`,
      row.context,
    ]),
  );
  const snapshots: StoredTelemetrySnapshot[] = [];

  return {
    async loadContext(workspaceId: string, idempotencyKey: string) {
      return byAttempt.get(`${workspaceId}:${idempotencyKey}`) ?? null;
    },
    async getBySlot(
      workspaceId: string,
      externalPostId: string,
      pollSlot: TelemetryPollSlot,
    ) {
      return (
        snapshots.find(
          (row) =>
            row.workspaceId === workspaceId &&
            row.externalPostId === externalPostId &&
            row.pollSlot === pollSlot,
        ) ?? null
      );
    },
    async listForPost(workspaceId: string, externalPostId: string) {
      return snapshots.filter(
        (row) =>
          row.workspaceId === workspaceId &&
          row.externalPostId === externalPostId,
      );
    },
    async saveSnapshot(input: {
      workspaceId: string;
      socialAccountId: string;
      externalPostId: string;
      pollSlot: TelemetryPollSlot;
      grantedScopes: string[];
      snapshot: NormalizedSnapshot;
    }) {
      const existing = await this.getBySlot(
        input.workspaceId,
        input.externalPostId,
        input.pollSlot,
      );
      if (existing) {
        return existing;
      }
      const stored: StoredTelemetrySnapshot = {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        socialAccountId: input.socialAccountId,
        externalPostId: input.externalPostId,
        snapshotType: input.pollSlot === "manual" ? "MANUAL" : "SCHEDULED",
        pollSlot: input.pollSlot,
        dataCapability: input.snapshot.dataCapability,
        sourceProduct: "linkedin.share",
        grantedScopes: input.grantedScopes,
        rawPayload: input.snapshot.raw,
        metrics: input.snapshot.metrics,
      };
      snapshots.push(stored);
      return stored;
    },
  };
}

export type TelemetryStore = ReturnType<typeof createMemoryTelemetryStore>;
