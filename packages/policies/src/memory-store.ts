import { randomUUID } from "node:crypto";
import { type ContentState, transition } from "@scriora/domain";
import {
  type ApprovalStatus,
  type ClassicAutonomyMode,
  evaluateLiveDispatch,
} from "./publish-gate.js";

export type GovernanceContent = {
  id: string;
  workspaceId: string;
  status: ContentState;
  body: string;
  originMode: "CLASSIC";
  source: "human";
  scheduledAt: string | null;
  mediaAssetIds: string[];
};

export type GovernanceApproval = {
  id: string;
  workspaceId: string;
  contentId: string;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
};

export type GovernancePolicy = {
  workspaceId: string;
  mode: ClassicAutonomyMode;
  dispatchPaused: boolean;
};

export function createMemoryGovernanceStore() {
  const policies = new Map<string, GovernancePolicy>();
  const contents = new Map<string, GovernanceContent>();
  const approvals = new Map<string, GovernanceApproval>();

  async function ensurePolicy(workspaceId: string) {
    const existing = policies.get(workspaceId);
    if (existing) {
      return existing;
    }
    const created: GovernancePolicy = {
      workspaceId,
      mode: "BALANCED",
      dispatchPaused: false,
    };
    policies.set(workspaceId, created);
    return created;
  }

  return {
    async createDraft(input: {
      workspaceId: string;
      body: string;
      mediaAssetIds?: string[];
    }) {
      await ensurePolicy(input.workspaceId);
      const content: GovernanceContent = {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        status: "DRAFT",
        body: input.body,
        originMode: "CLASSIC",
        source: "human",
        scheduledAt: null,
        mediaAssetIds: input.mediaAssetIds ?? [],
      };
      contents.set(content.id, content);
      return content;
    },
    async submit(workspaceId: string, contentId: string) {
      const content = contents.get(contentId);
      if (!content || content.workspaceId !== workspaceId) {
        return { ok: false as const, error: "not_found" };
      }
      const next = transition(content.status, "IN_REVIEW");
      if (!next.ok) {
        return { ok: false as const, error: "illegal_transition" };
      }
      content.status = next.value;
      for (const approval of approvals.values()) {
        if (approval.contentId === contentId && approval.status === "PENDING") {
          approval.status = "CANCELLED";
        }
      }
      const approval: GovernanceApproval = {
        id: randomUUID(),
        workspaceId,
        contentId,
        status: "PENDING",
        decidedBy: null,
        decidedAt: null,
      };
      approvals.set(approval.id, approval);
      return { ok: true as const, content, approval };
    },
    async decide(input: {
      workspaceId: string;
      approvalId: string;
      decision: "APPROVED" | "REJECTED";
      actor: string;
    }) {
      const approval = approvals.get(input.approvalId);
      if (!approval || approval.workspaceId !== input.workspaceId) {
        return { ok: false as const, error: "not_found" };
      }
      if (approval.status !== "PENDING") {
        return { ok: false as const, error: "not_pending" };
      }
      const content = contents.get(approval.contentId);
      if (!content) {
        return { ok: false as const, error: "not_found" };
      }
      const next = transition(content.status, input.decision);
      if (!next.ok) {
        return { ok: false as const, error: "illegal_transition" };
      }
      content.status = next.value;
      approval.status = input.decision;
      approval.decidedBy = input.actor;
      approval.decidedAt = new Date().toISOString();
      return { ok: true as const, content, approval };
    },
    async getPolicy(workspaceId: string) {
      return ensurePolicy(workspaceId);
    },
    async listContents(workspaceId: string) {
      await ensurePolicy(workspaceId);
      return [...contents.values()].filter(
        (row) => row.workspaceId === workspaceId,
      );
    },
    async listPendingApprovals(workspaceId: string) {
      return [...approvals.values()].filter(
        (row) => row.workspaceId === workspaceId && row.status === "PENDING",
      );
    },
    async listApprovalHistory(workspaceId: string) {
      return [...approvals.values()].filter(
        (row) =>
          row.workspaceId === workspaceId &&
          (row.status === "APPROVED" || row.status === "REJECTED"),
      );
    },
    async reschedule(input: {
      workspaceId: string;
      contentId: string;
      scheduledAt: Date;
    }) {
      const content = contents.get(input.contentId);
      if (!content || content.workspaceId !== input.workspaceId) {
        return { ok: false as const, error: "not_found" };
      }
      if (content.status !== "SCHEDULED") {
        return { ok: false as const, error: "not_scheduled" };
      }
      const minute = Math.floor(input.scheduledAt.getTime() / 60_000);
      for (const row of contents.values()) {
        if (
          row.workspaceId === input.workspaceId &&
          row.id !== input.contentId &&
          row.scheduledAt &&
          Math.floor(new Date(row.scheduledAt).getTime() / 60_000) === minute
        ) {
          return { ok: false as const, error: "conflict" };
        }
      }
      content.scheduledAt = input.scheduledAt.toISOString();
      return { ok: true as const, content };
    },
    async markScheduled(input: {
      workspaceId: string;
      contentId: string;
      scheduledAt: Date;
    }) {
      const content = contents.get(input.contentId);
      if (!content || content.workspaceId !== input.workspaceId) {
        return { ok: false as const, error: "not_found" };
      }
      const minute = Math.floor(input.scheduledAt.getTime() / 60_000);
      for (const row of contents.values()) {
        if (
          row.workspaceId === input.workspaceId &&
          row.id !== input.contentId &&
          row.scheduledAt &&
          Math.floor(new Date(row.scheduledAt).getTime() / 60_000) === minute
        ) {
          return { ok: false as const, error: "conflict" };
        }
      }
      if (content.status === "SCHEDULED") {
        content.scheduledAt = input.scheduledAt.toISOString();
        return { ok: true as const, content };
      }
      const next = transition(content.status, "SCHEDULED");
      if (!next.ok) {
        return { ok: false as const, error: "illegal_transition" };
      }
      content.status = next.value;
      content.scheduledAt = input.scheduledAt.toISOString();
      return { ok: true as const, content };
    },
    async setDispatchPaused(workspaceId: string, dispatchPaused: boolean) {
      const policy = await ensurePolicy(workspaceId);
      policy.dispatchPaused = dispatchPaused;
      return policy;
    },
    async loadForPublish(workspaceId: string, contentId: string) {
      const content = contents.get(contentId);
      if (!content || content.workspaceId !== workspaceId) {
        return null;
      }
      const policy = await ensurePolicy(workspaceId);
      const approval =
        [...approvals.values()].find(
          (row) => row.contentId === contentId && row.status === "APPROVED",
        ) ??
        [...approvals.values()].find(
          (row) => row.contentId === contentId && row.status === "PENDING",
        ) ??
        null;
      const gate = evaluateLiveDispatch({
        dispatchPaused: policy.dispatchPaused,
        contentState: content.status,
        approvalStatus: approval?.status ?? null,
      });
      return {
        body: content.body,
        mediaAssetIds: content.mediaAssetIds,
        gate,
      };
    },
  };
}

export type GovernanceStore = ReturnType<typeof createMemoryGovernanceStore>;
