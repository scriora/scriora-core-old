import { type ContentState, transition } from "@scriora/domain";
import type { GovernanceStore } from "@scriora/policies";
import { evaluateLiveDispatch } from "@scriora/policies";
import type { Pool } from "pg";
import { withWorkspace } from "../tenancy.js";

export function createPostgresGovernanceStore(pool: Pool): GovernanceStore {
  async function ensurePolicy(workspaceId: string) {
    return withWorkspace(pool, workspaceId, async (client) => {
      await client.query(
        `insert into autonomy_policies (workspace_id, mode, dispatch_paused)
         values ($1, 'BALANCED', false)
         on conflict (workspace_id) do nothing`,
        [workspaceId],
      );
      const result = await client.query(
        `select workspace_id, mode, dispatch_paused from autonomy_policies`,
      );
      const row = result.rows[0];
      return {
        workspaceId: row.workspace_id as string,
        mode: row.mode as "CAREFUL" | "BALANCED",
        dispatchPaused: Boolean(row.dispatch_paused),
      };
    });
  }

  return {
    async createDraft(input) {
      await ensurePolicy(input.workspaceId);
      return withWorkspace(pool, input.workspaceId, async (client) => {
        const inserted = await client.query(
          `insert into contents (workspace_id, status, origin_mode)
           values ($1, 'DRAFT', 'CLASSIC')
           returning id, workspace_id, status`,
          [input.workspaceId],
        );
        const row = inserted.rows[0];
        await client.query(
          `insert into content_versions (workspace_id, content_id, version_number, body)
           values ($1, $2, 1, $3)`,
          [input.workspaceId, row.id, input.body],
        );
        return {
          id: row.id as string,
          workspaceId: row.workspace_id as string,
          status: row.status as ContentState,
          body: input.body,
        };
      });
    },
    async submit(workspaceId, contentId) {
      await ensurePolicy(workspaceId);
      return withWorkspace(pool, workspaceId, async (client) => {
        const found = await client.query(
          `select c.id, c.status, v.body
           from contents c
           join content_versions v
             on v.content_id = c.id and v.version_number = 1
           where c.id = $1`,
          [contentId],
        );
        const row = found.rows[0];
        if (!row) {
          return { ok: false as const, error: "not_found" };
        }
        const next = transition(row.status as ContentState, "IN_REVIEW");
        if (!next.ok) {
          return { ok: false as const, error: "illegal_transition" };
        }
        await client.query(
          `update contents set status = $2, updated_at = now() where id = $1`,
          [contentId, next.value],
        );
        await client.query(
          `update approvals
           set status = 'CANCELLED', updated_at = now()
           where resource_type = 'CONTENT' and resource_id = $1 and status = 'PENDING'`,
          [contentId],
        );
        const approval = await client.query(
          `insert into approvals (workspace_id, resource_type, resource_id, status)
           values ($1, 'CONTENT', $2, 'PENDING')
           returning id, workspace_id, resource_id, status`,
          [workspaceId, contentId],
        );
        const created = approval.rows[0];
        return {
          ok: true as const,
          content: {
            id: contentId,
            workspaceId,
            status: next.value,
            body: row.body as string,
          },
          approval: {
            id: created.id as string,
            workspaceId: created.workspace_id as string,
            contentId: created.resource_id as string,
            status: created.status as "PENDING",
          },
        };
      });
    },
    async decide(input) {
      return withWorkspace(pool, input.workspaceId, async (client) => {
        const found = await client.query(
          `select a.id, a.resource_id, a.status as approval_status, c.status as content_status, v.body
           from approvals a
           join contents c on c.id = a.resource_id
           join content_versions v on v.content_id = c.id and v.version_number = 1
           where a.id = $1`,
          [input.approvalId],
        );
        const row = found.rows[0];
        if (!row) {
          return { ok: false as const, error: "not_found" };
        }
        if (row.approval_status !== "PENDING") {
          return { ok: false as const, error: "not_pending" };
        }
        const next = transition(
          row.content_status as ContentState,
          input.decision,
        );
        if (!next.ok) {
          return { ok: false as const, error: "illegal_transition" };
        }
        await client.query(
          `update contents set status = $2, updated_at = now() where id = $1`,
          [row.resource_id, next.value],
        );
        await client.query(
          `update approvals set status = $2, updated_at = now() where id = $1`,
          [input.approvalId, input.decision],
        );
        return {
          ok: true as const,
          content: {
            id: row.resource_id as string,
            workspaceId: input.workspaceId,
            status: next.value,
            body: row.body as string,
          },
          approval: {
            id: input.approvalId,
            workspaceId: input.workspaceId,
            contentId: row.resource_id as string,
            status: input.decision,
          },
        };
      });
    },
    async setDispatchPaused(workspaceId, dispatchPaused) {
      const policy = await ensurePolicy(workspaceId);
      return withWorkspace(pool, workspaceId, async (client) => {
        await client.query(
          `update autonomy_policies
           set dispatch_paused = $1, updated_at = now()`,
          [dispatchPaused],
        );
        return { ...policy, dispatchPaused };
      });
    },
    async loadForPublish(workspaceId, contentId) {
      await ensurePolicy(workspaceId);
      return withWorkspace(pool, workspaceId, async (client) => {
        const found = await client.query(
          `select c.status, v.body, p.dispatch_paused,
                  (
                    select a.status
                    from approvals a
                    where a.resource_type = 'CONTENT'
                      and a.resource_id = c.id
                      and a.status = 'APPROVED'
                    order by a.updated_at desc
                    limit 1
                  ) as approval_status
           from contents c
           join content_versions v
             on v.content_id = c.id and v.version_number = 1
           join autonomy_policies p on p.workspace_id = c.workspace_id
           where c.id = $1`,
          [contentId],
        );
        const row = found.rows[0];
        if (!row) {
          return null;
        }
        return {
          body: row.body as string,
          gate: evaluateLiveDispatch({
            dispatchPaused: Boolean(row.dispatch_paused),
            contentState: row.status as ContentState,
            approvalStatus: (row.approval_status as "APPROVED" | null) ?? null,
          }),
        };
      });
    },
  };
}
