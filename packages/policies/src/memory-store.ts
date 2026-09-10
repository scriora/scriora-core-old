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
};

export type GovernanceApproval = {
  id: string;
  workspaceId: string;
  contentId: string;
  status: ApprovalStatus;
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
    async createDraft(input: { workspaceId: string; body: string }) {
      await ensurePolicy(input.workspaceId);
      const content: GovernanceContent = {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        status: "DRAFT",
        body: input.body,
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
      };
      approvals.set(approval.id, approval);
      return { ok: true as const, content, approval };
    },
    async decide(input: {
      workspaceId: string;
      approvalId: string;
      decision: "APPROVED" | "REJECTED";
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
      return { ok: true as const, content, approval };
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
        gate,
      };
    },
  };
}

export type GovernanceStore = ReturnType<typeof createMemoryGovernanceStore>;
