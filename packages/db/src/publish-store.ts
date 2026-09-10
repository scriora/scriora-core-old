import type { Pool } from "pg";
import { withWorkspace } from "./index.js";

type StoredPublishAttempt = {
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  fingerprint: string;
  status:
    | "RESERVED"
    | "DISPATCHING"
    | "PLATFORM_PENDING"
    | "SUCCEEDED"
    | "UNKNOWN_EXTERNAL_STATE"
    | "FAILED_PERMANENT";
  remoteOperationId: string | null;
  externalPostId: string | null;
  lastError: string | null;
  confirmedAt: Date | null;
};

export function createPostgresLinkedInPublishStore(pool: Pool) {
  return {
    async loadPublisher(workspaceId: string) {
      return withWorkspace(pool, workspaceId, async (client) => {
        const result = await client.query(
          `select a.external_account_id, a.cap_publish, e.key_version, e.iv, e.tag, e.ciphertext
           from social_accounts a
           join secret_envelopes e
             on e.workspace_id = a.workspace_id
            and e.name = 'linkedin.token.' || a.external_account_id
           where a.workspace_id = $1 and a.platform = 'linkedin'
           limit 1`,
          [workspaceId],
        );
        const row = result.rows[0];
        if (!row) {
          return null;
        }
        return {
          workspaceId,
          memberId: row.external_account_id as string,
          canPublish: Boolean(row.cap_publish),
          tokenEnvelope: {
            keyVersion: row.key_version as number,
            iv: new Uint8Array(row.iv as Buffer),
            tag: new Uint8Array(row.tag as Buffer),
            ciphertext: new Uint8Array(row.ciphertext as Buffer),
          },
        };
      });
    },
    async getAttempt(workspaceId: string, idempotencyKey: string) {
      return withWorkspace(pool, workspaceId, async (client) => {
        const result = await client.query(
          `select id, workspace_id, idempotency_key, request_fingerprint, status,
                  remote_operation_id, external_post_id, last_error, confirmed_at
           from publish_attempts
           where idempotency_key = $1`,
          [idempotencyKey],
        );
        const row = result.rows[0];
        if (!row) {
          return null;
        }
        return mapAttempt(row);
      });
    },
    async saveAttempt(attempt: StoredPublishAttempt) {
      await withWorkspace(pool, attempt.workspaceId, async (client) => {
        await client.query(
          `insert into publish_attempts (
             id, workspace_id, idempotency_key, request_fingerprint, status, attempt_number,
             remote_operation_id, external_post_id, last_error, confirmed_at
           ) values ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9)
           on conflict (workspace_id, idempotency_key) do update set
             status = excluded.status,
             remote_operation_id = excluded.remote_operation_id,
             external_post_id = excluded.external_post_id,
             last_error = excluded.last_error,
             confirmed_at = excluded.confirmed_at,
             updated_at = now()`,
          [
            attempt.id,
            attempt.workspaceId,
            attempt.idempotencyKey,
            attempt.fingerprint,
            attempt.status,
            attempt.remoteOperationId,
            attempt.externalPostId,
            attempt.lastError,
            attempt.confirmedAt,
          ],
        );
      });
    },
  };
}

function mapAttempt(row: {
  id: string;
  workspace_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  status: StoredPublishAttempt["status"];
  remote_operation_id: string | null;
  external_post_id: string | null;
  last_error: string | null;
  confirmed_at: Date | null;
}): StoredPublishAttempt {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    idempotencyKey: row.idempotency_key,
    fingerprint: row.request_fingerprint,
    status: row.status,
    remoteOperationId: row.remote_operation_id,
    externalPostId: row.external_post_id,
    lastError: row.last_error,
    confirmedAt: row.confirmed_at,
  };
}
