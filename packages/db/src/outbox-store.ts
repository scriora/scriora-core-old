import type { Pool } from "pg";
import { withWorkspace } from "./index.js";

export type OutboxCommandRow = {
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  command: string;
  payload: { text: string };
  state: "PENDING" | "PROCESSING" | "PUBLISHED" | "FAILED";
  attemptCount: number;
};

export function createPostgresOutboxStore(pool: Pool) {
  return {
    async enqueue(input: {
      workspaceId: string;
      idempotencyKey: string;
      text: string;
    }) {
      await withWorkspace(pool, input.workspaceId, async (client) => {
        await client.query(
          `insert into outbox_commands (
             workspace_id, idempotency_key, command, payload, state
           ) values ($1, $2, 'linkedin.publish_text', $3::jsonb, 'PENDING')
           on conflict (workspace_id, idempotency_key) do nothing`,
          [
            input.workspaceId,
            input.idempotencyKey,
            JSON.stringify({ text: input.text }),
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
  };
}

function mapRow(row: {
  id: string;
  workspace_id: string;
  idempotency_key: string;
  command: string;
  payload: { text: string };
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
