import type { Pool } from "pg";
import { withWorkspace } from "../tenancy.js";

type Envelope = {
  keyVersion: number;
  iv: Uint8Array;
  tag: Uint8Array;
  ciphertext: Uint8Array;
};

type AccountRow = {
  workspaceId: string;
  account: {
    externalAccountId: string;
    displayName: string;
    grantedScopes: string[];
    capabilities: {
      oauth: boolean;
      publish: boolean;
      comments: boolean;
      analytics: boolean;
      inbox: boolean;
    };
    refreshMode: "refresh" | "reauthorize";
    tokenExpiresAt: Date | null;
  };
  tokenEnvelope: Envelope;
};

export function createPostgresLinkedInOAuthStore(pool: Pool) {
  return {
    async savePending(record: {
      workspaceId: string;
      stateHash: string;
      redirectUri: string;
      envelope: Envelope;
      expiresAt: Date;
    }) {
      await withWorkspace(pool, record.workspaceId, async (client) => {
        await client.query(
          `insert into oauth_pending_states
             (workspace_id, platform, state_hash, redirect_uri, key_version, iv, tag, ciphertext, expires_at)
           values ($1, 'linkedin', $2, $3, $4, $5, $6, $7, $8)`,
          [
            record.workspaceId,
            record.stateHash,
            record.redirectUri,
            record.envelope.keyVersion,
            Buffer.from(record.envelope.iv),
            Buffer.from(record.envelope.tag),
            Buffer.from(record.envelope.ciphertext),
            record.expiresAt,
          ],
        );
      });
    },
    async takePending(workspaceId: string, stateHash: string) {
      return withWorkspace(pool, workspaceId, async (client) => {
        const result = await client.query(
          `update oauth_pending_states
           set consumed_at = now()
           where workspace_id = $1
             and state_hash = $2
             and consumed_at is null
           returning redirect_uri, key_version, iv, tag, ciphertext, expires_at, consumed_at`,
          [workspaceId, stateHash],
        );
        const row = result.rows[0];
        if (!row) {
          return null;
        }
        return {
          workspaceId,
          stateHash,
          redirectUri: row.redirect_uri as string,
          envelope: {
            keyVersion: row.key_version as number,
            iv: new Uint8Array(row.iv as Buffer),
            tag: new Uint8Array(row.tag as Buffer),
            ciphertext: new Uint8Array(row.ciphertext as Buffer),
          },
          expiresAt: row.expires_at as Date,
          consumedAt: row.consumed_at as Date,
        };
      });
    },
    async saveConnectedAccount(input: AccountRow) {
      await withWorkspace(pool, input.workspaceId, async (client) => {
        await client.query(
          `insert into social_accounts (
             workspace_id, platform, external_account_id, display_name, granted_scopes,
             token_expires_at, refresh_mode, cap_oauth, cap_publish, cap_comments,
             cap_analytics, cap_inbox
           ) values ($1, 'linkedin', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           on conflict (platform, external_account_id) do update set
             display_name = excluded.display_name,
             granted_scopes = excluded.granted_scopes,
             token_expires_at = excluded.token_expires_at,
             refresh_mode = excluded.refresh_mode,
             cap_oauth = excluded.cap_oauth,
             cap_publish = excluded.cap_publish,
             cap_comments = excluded.cap_comments,
             cap_analytics = excluded.cap_analytics,
             cap_inbox = excluded.cap_inbox,
             updated_at = now()`,
          [
            input.workspaceId,
            input.account.externalAccountId,
            input.account.displayName,
            input.account.grantedScopes,
            input.account.tokenExpiresAt,
            input.account.refreshMode,
            input.account.capabilities.oauth,
            input.account.capabilities.publish,
            input.account.capabilities.comments,
            input.account.capabilities.analytics,
            input.account.capabilities.inbox,
          ],
        );
        await client.query(
          `insert into secret_envelopes (workspace_id, name, key_version, iv, tag, ciphertext)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (workspace_id, name) do update set
             key_version = excluded.key_version,
             iv = excluded.iv,
             tag = excluded.tag,
             ciphertext = excluded.ciphertext,
             updated_at = now()`,
          [
            input.workspaceId,
            `linkedin.token.${input.account.externalAccountId}`,
            input.tokenEnvelope.keyVersion,
            Buffer.from(input.tokenEnvelope.iv),
            Buffer.from(input.tokenEnvelope.tag),
            Buffer.from(input.tokenEnvelope.ciphertext),
          ],
        );
      });
    },
  };
}
