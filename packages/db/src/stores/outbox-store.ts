import type { Pool } from "pg";
import { withWorkspace } from "../tenancy.js";

export type OutboxCommandRow = {
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  command: string;
  payload: { text: string; mediaAssetId?: string };
  state: "PENDING" | "PROCESSING" | "PUBLISHED" | "FAILED";
  attemptCount: number;
};

export function createPostgresOutboxStore(pool: Pool) {
  return {
    async enqueue(input: {
      workspaceId: string;
      idempotencyKey: string;
      text: string;
      mediaAssetId?: string;
      nextAttemptAt?: Date;
    }) {
      await withWorkspace(pool, input.workspaceId, async (client) => {
        await client.query(
          `insert into outbox_commands (
             workspace_id, idempotency_key, command, payload, state, next_attempt_at
           ) values ($1, $2, 'linkedin.publish_text', $3::jsonb, 'PENDING', coalesce($4, now()))
           on conflict (workspace_id, idempotency_key) do nothing`,
          [
            input.workspaceId,
            input.idempotencyKey,
            JSON.stringify({
              text: input.text,
              ...(input.mediaAssetId
                ? { mediaAssetId: input.mediaAssetId }
                : {}),
            }),
            input.nextAttemptAt ?? null,
          ],
        );
      });
    },
    async claimDue(limit: number): Promise<OutboxCommandRow[]> {
      const result = await pool.query(
        `select id, workspace_id, idempotency_key, command, payload, state, attempt_count
         from claim_outbox_commands($1)`,
        [limit],
      );
      return result.rows.map((row) =>
        mapRow({
          ...row,
          payload:
            typeof row.payload === "string"
              ? JSON.parse(row.payload)
              : row.payload,
        }),
      );
    },
    async listByState(
      workspaceId: string,
      state: OutboxCommandRow["state"],
    ): Promise<OutboxCommandRow[]> {
      return withWorkspace(pool, workspaceId, async (client) => {
        const result = await client.query(
          `select id, workspace_id, idempotency_key, command, payload, state, attempt_count
           from outbox_commands
           where state = $1
           order by updated_at desc`,
          [state],
        );
        return result.rows.map((row) =>
          mapRow({
            ...row,
            payload:
              typeof row.payload === "string"
                ? JSON.parse(row.payload)
                : row.payload,
          }),
        );
      });
    },
    async complete(input: {
      workspaceId: string;
      id: string;
      state: "PUBLISHED" | "FAILED" | "PENDING";
      lastError: string | null;
      nextAttemptAt?: Date;
    }) {
      await withWorkspace(pool, input.workspaceId, async (client) => {
        await client.query(
          `update outbox_commands
           set state = $2,
               last_error = $3,
               next_attempt_at = coalesce($4, next_attempt_at),
               lock_expires_at = case when $2 = 'PENDING' then null else lock_expires_at end,
               updated_at = now()
           where id = $1`,
          [input.id, input.state, input.lastError, input.nextAttemptAt ?? null],
        );
      });
    },
    async reschedule(input: {
      workspaceId: string;
      idempotencyKey: string;
      nextAttemptAt: Date;
    }) {
      return withWorkspace(pool, input.workspaceId, async (client) => {
        const found = await client.query(
          `select state from outbox_commands where idempotency_key = $1`,
          [input.idempotencyKey],
        );
        const row = found.rows[0] as
          | { state: OutboxCommandRow["state"] }
          | undefined;
        if (!row) {
          return "not_found" as const;
        }
        if (row.state !== "PENDING") {
          return "not_pending" as const;
        }
        await client.query(
          `update outbox_commands
           set next_attempt_at = $2, updated_at = now()
           where idempotency_key = $1 and state = 'PENDING'`,
          [input.idempotencyKey, input.nextAttemptAt],
        );
        return "ok" as const;
      });
    },
  };
}

function mapRow(row: {
  id: string;
  workspace_id: string;
  idempotency_key: string;
  command: string;
  payload: { text: string; mediaAssetId?: string };
  state: OutboxCommandRow["state"];
  attempt_count: number;
}): OutboxCommandRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    idempotencyKey: row.idempotency_key,
    command: row.command,
    payload: row.payload,
    state: row.state,
    attemptCount: row.attempt_count,
  };
}
