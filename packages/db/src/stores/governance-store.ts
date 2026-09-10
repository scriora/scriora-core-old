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
        for (const mediaAssetId of input.mediaAssetIds ?? []) {
          await client.query(
            `insert into content_media (workspace_id, content_id, media_asset_id)
             values ($1, $2, $3)`,
            [input.workspaceId, row.id, mediaAssetId],
          );
        }
        return {
          id: row.id as string,
          workspaceId: row.workspace_id as string,
          status: row.status as ContentState,
          body: input.body,
          originMode: "CLASSIC",
          source: "human",
          scheduledAt: null,
          mediaAssetIds: input.mediaAssetIds ?? [],
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
            originMode: "CLASSIC",
            source: "human",
            scheduledAt: null,
            mediaAssetIds: [],
          },
          approval: {
            id: created.id as string,
            workspaceId: created.workspace_id as string,
            contentId: created.resource_id as string,
            status: created.status as "PENDING",
            decidedBy: null,
            decidedAt: null,
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
          `update approvals
           set status = $2, decided_by = $3, decided_at = now(), updated_at = now()
           where id = $1`,
          [input.approvalId, input.decision, input.actor],
        );
        return {
          ok: true as const,
          content: {
            id: row.resource_id as string,
            workspaceId: input.workspaceId,
            status: next.value,
            body: row.body as string,
            originMode: "CLASSIC",
            source: "human",
            scheduledAt: null,
            mediaAssetIds: [],
          },
          approval: {
            id: input.approvalId,
            workspaceId: input.workspaceId,
            contentId: row.resource_id as string,
            status: input.decision,
            decidedBy: input.actor,
            decidedAt: new Date().toISOString(),
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
    async getPolicy(workspaceId) {
      return ensurePolicy(workspaceId);
    },
    async listContents(workspaceId) {
      await ensurePolicy(workspaceId);
      return withWorkspace(pool, workspaceId, async (client) => {
        const result = await client.query(
          `select c.id, c.workspace_id, c.status, v.body, c.origin_mode,
                  coalesce(v.source, 'human') as source,
                  s.scheduled_at,
                  coalesce(
                    (
                      select array_agg(m.media_asset_id::text)
                      from content_media m
                      where m.content_id = c.id
                    ),
                    '{}'::text[]
                  ) as media_asset_ids
           from contents c
           join content_versions v
             on v.content_id = c.id and v.version_number = 1
           left join content_schedules s
             on s.content_id = c.id and s.status = 'PENDING'
           order by c.created_at desc`,
        );
        return result.rows.map((row) => ({
          id: row.id as string,
          workspaceId: row.workspace_id as string,
          status: row.status as ContentState,
          body: row.body as string,
          originMode: "CLASSIC" as const,
          source: "human" as const,
          scheduledAt: row.scheduled_at
            ? new Date(row.scheduled_at as string).toISOString()
            : null,
          mediaAssetIds: (row.media_asset_ids as string[] | null) ?? [],
        }));
      });
    },
    async listPendingApprovals(workspaceId) {
      return withWorkspace(pool, workspaceId, async (client) => {
        const result = await client.query(
          `select id, workspace_id, resource_id, status, decided_by, decided_at
           from approvals
           where status = 'PENDING'
           order by created_at`,
        );
        return result.rows.map((row) => ({
          id: row.id as string,
          workspaceId: row.workspace_id as string,
          contentId: row.resource_id as string,
          status: row.status as "PENDING",
          decidedBy: (row.decided_by as string | null) ?? null,
          decidedAt: row.decided_at
            ? new Date(row.decided_at as string).toISOString()
            : null,
        }));
      });
    },
    async listApprovalHistory(workspaceId) {
      return withWorkspace(pool, workspaceId, async (client) => {
        const result = await client.query(
          `select id, workspace_id, resource_id, status, decided_by, decided_at
           from approvals
           where status in ('APPROVED', 'REJECTED')
           order by decided_at desc nulls last, updated_at desc`,
        );
        return result.rows.map((row) => ({
          id: row.id as string,
          workspaceId: row.workspace_id as string,
          contentId: row.resource_id as string,
          status: row.status as "APPROVED" | "REJECTED",
          decidedBy: (row.decided_by as string | null) ?? null,
          decidedAt: row.decided_at
            ? new Date(row.decided_at as string).toISOString()
            : null,
        }));
      });
    },
    async reschedule(input) {
      return withWorkspace(pool, input.workspaceId, async (client) => {
        const found = await client.query(
          `select c.id, c.status, v.body, s.scheduled_at
           from contents c
           join content_versions v
             on v.content_id = c.id and v.version_number = 1
           left join content_schedules s
             on s.content_id = c.id and s.status = 'PENDING'
           where c.id = $1`,
          [input.contentId],
        );
        const row = found.rows[0];
        if (!row) {
          return { ok: false as const, error: "not_found" };
        }
        if ((row.status as ContentState) !== "SCHEDULED") {
          return { ok: false as const, error: "not_scheduled" };
        }
        const clash = await client.query(
          `select 1 from content_schedules
           where status = 'PENDING'
             and content_id <> $2
             and date_trunc('minute', scheduled_at) = date_trunc('minute', $1::timestamptz)`,
          [input.scheduledAt, input.contentId],
        );
        if (clash.rowCount && clash.rowCount > 0) {
          return { ok: false as const, error: "conflict" };
        }
        try {
          await client.query(
            `update content_schedules
             set scheduled_at = $2
             where content_id = $1 and status = 'PENDING'`,
            [input.contentId, input.scheduledAt],
          );
        } catch (error) {
          if (isUniqueViolation(error)) {
            return { ok: false as const, error: "conflict" };
          }
          throw error;
        }
        return {
          ok: true as const,
          content: {
            id: input.contentId,
            workspaceId: input.workspaceId,
            status: "SCHEDULED" as const,
            body: row.body as string,
            originMode: "CLASSIC" as const,
            source: "human" as const,
            scheduledAt: input.scheduledAt.toISOString(),
            mediaAssetIds: [],
          },
        };
      });
    },
    async markScheduled(input) {
      return withWorkspace(pool, input.workspaceId, async (client) => {
        const found = await client.query(
          `select c.id, c.status, v.body
           from contents c
           join content_versions v
             on v.content_id = c.id and v.version_number = 1
           where c.id = $1`,
          [input.contentId],
        );
        const row = found.rows[0];
        if (!row) {
          return { ok: false as const, error: "not_found" };
        }
        let status = row.status as ContentState;
        if (status !== "SCHEDULED") {
          const next = transition(status, "SCHEDULED");
          if (!next.ok) {
            return { ok: false as const, error: "illegal_transition" };
          }
          status = next.value;
          await client.query(
            `update contents set status = $2, updated_at = now() where id = $1`,
            [input.contentId, status],
          );
        }
        const clash = await client.query(
          `select 1 from content_schedules
           where status = 'PENDING'
             and content_id <> $2
             and date_trunc('minute', scheduled_at) = date_trunc('minute', $1::timestamptz)`,
          [input.scheduledAt, input.contentId],
        );
        if (clash.rowCount && clash.rowCount > 0) {
          return { ok: false as const, error: "conflict" };
        }
        try {
          await client.query(
            `insert into content_schedules (
             workspace_id, content_id, scheduled_at, idempotency_key, status
           ) values ($1, $2, $3, $4, 'PENDING')
           on conflict (workspace_id, idempotency_key) do update set
             scheduled_at = excluded.scheduled_at,
             status = 'PENDING'`,
            [
              input.workspaceId,
              input.contentId,
              input.scheduledAt,
              `schedule:${input.contentId}`,
            ],
          );
        } catch (error) {
          if (isUniqueViolation(error)) {
            return { ok: false as const, error: "conflict" };
          }
          throw error;
        }
        return {
          ok: true as const,
          content: {
            id: input.contentId,
            workspaceId: input.workspaceId,
            status,
            body: row.body as string,
            originMode: "CLASSIC" as const,
            source: "human" as const,
            scheduledAt: input.scheduledAt.toISOString(),
            mediaAssetIds: [],
          },
        };
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
                  ) as approval_status,
                  coalesce(
                    (
                      select array_agg(m.media_asset_id::text)
                      from content_media m
                      where m.content_id = c.id
                    ),
                    '{}'::text[]
                  ) as media_asset_ids
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
          mediaAssetIds: (row.media_asset_ids as string[] | null) ?? [],
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
