import type {
  NormalizedSnapshot,
  StoredTelemetrySnapshot,
  TelemetryContext,
} from "@scriora/analytics";
import type { TelemetryPollSlot } from "@scriora/domain";
import type { Pool, PoolClient } from "pg";
import { withWorkspace } from "../tenancy.js";

export function createPostgresTelemetryStore(pool: Pool) {
  return {
    async loadContext(
      workspaceId: string,
      idempotencyKey: string,
    ): Promise<TelemetryContext | null> {
      return withWorkspace(pool, workspaceId, async (client) => {
        const result = await client.query(
          `select a.id, a.cap_analytics, a.granted_scopes, p.external_post_id
           from publish_attempts p
           join social_accounts a
             on a.workspace_id = p.workspace_id
            and a.platform = 'linkedin'
           where p.idempotency_key = $1
           limit 1`,
          [idempotencyKey],
        );
        const row = result.rows[0];
        if (!row) {
          return null;
        }
        return {
          socialAccountId: row.id as string,
          externalPostId: (row.external_post_id as string | null) ?? null,
          capAnalytics: Boolean(row.cap_analytics),
          grantedScopes: row.granted_scopes as string[],
        };
      });
    },
    async getBySlot(
      workspaceId: string,
      externalPostId: string,
      pollSlot: TelemetryPollSlot,
    ): Promise<StoredTelemetrySnapshot | null> {
      return withWorkspace(pool, workspaceId, async (client) => {
        const result = await client.query(
          `select s.id
           from analytics_snapshots s
           where s.external_post_id = $1 and s.poll_slot = $2`,
          [externalPostId, pollSlot],
        );
        const id = result.rows[0]?.id as string | undefined;
        if (!id) {
          return null;
        }
        return loadSnapshot(client, id);
      });
    },
    async listForPost(workspaceId: string, externalPostId: string) {
      return withWorkspace(pool, workspaceId, async (client) => {
        const result = await client.query(
          `select id from analytics_snapshots
           where external_post_id = $1
           order by recorded_at`,
          [externalPostId],
        );
        const rows: StoredTelemetrySnapshot[] = [];
        for (const row of result.rows) {
          const snapshot = await loadSnapshot(client, row.id as string);
          if (snapshot) {
            rows.push(snapshot);
          }
        }
        return rows;
      });
    },
    async saveSnapshot(input: {
      workspaceId: string;
      socialAccountId: string;
      externalPostId: string;
      pollSlot: TelemetryPollSlot;
      grantedScopes: string[];
      snapshot: NormalizedSnapshot;
    }): Promise<StoredTelemetrySnapshot> {
      return withWorkspace(pool, input.workspaceId, async (client) => {
        const inserted = await client.query(
          `insert into analytics_snapshots (
             workspace_id, social_account_id, external_post_id, snapshot_type,
             poll_slot, data_capability, source_product, granted_scopes, raw_payload
           ) values ($1, $2, $3, $4, $5, $6, 'linkedin.share', $7, $8)
           on conflict (workspace_id, external_post_id, poll_slot) do nothing
           returning id`,
          [
            input.workspaceId,
            input.socialAccountId,
            input.externalPostId,
            input.pollSlot === "manual" ? "MANUAL" : "SCHEDULED",
            input.pollSlot,
            input.snapshot.dataCapability,
            input.grantedScopes,
            input.snapshot.raw,
          ],
        );
        const snapshotId =
          (inserted.rows[0]?.id as string | undefined) ??
          ((
            await client.query(
              `select id from analytics_snapshots
               where external_post_id = $1 and poll_slot = $2`,
              [input.externalPostId, input.pollSlot],
            )
          ).rows[0].id as string);
        if (inserted.rows[0]?.id) {
          for (const metric of input.snapshot.metrics) {
            await client.query(
              `insert into analytics_metrics (
                 snapshot_id, workspace_id, metric, value, status
               ) values ($1, $2, $3, $4, $5)`,
              [
                snapshotId,
                input.workspaceId,
                metric.metric,
                metric.value,
                metric.status,
              ],
            );
          }
        }
        const stored = await loadSnapshot(client, snapshotId);
        if (!stored) {
          throw new Error("telemetry snapshot missing after save");
        }
        return stored;
      });
    },
  };
}

async function loadSnapshot(
  client: PoolClient,
  id: string,
): Promise<StoredTelemetrySnapshot | null> {
  const snapshot = await client.query(
    `select id, workspace_id, social_account_id, external_post_id, snapshot_type,
            poll_slot, data_capability, source_product, granted_scopes, raw_payload
     from analytics_snapshots where id = $1`,
    [id],
  );
  const row = snapshot.rows[0];
  if (!row) {
    return null;
  }
  const metrics = await client.query(
    `select metric, value, status from analytics_metrics where snapshot_id = $1`,
    [id],
  );
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    socialAccountId: row.social_account_id as string,
    externalPostId: row.external_post_id as string,
    snapshotType: row.snapshot_type as "MANUAL" | "SCHEDULED",
    pollSlot: row.poll_slot as TelemetryPollSlot,
    dataCapability: row.data_capability as NormalizedSnapshot["dataCapability"],
    sourceProduct: row.source_product as string,
    grantedScopes: row.granted_scopes as string[],
    rawPayload: row.raw_payload as Record<string, unknown>,
    metrics: metrics.rows.map((metric) => ({
      metric:
        metric.metric as StoredTelemetrySnapshot["metrics"][number]["metric"],
      value:
        metric.value === null || metric.value === undefined
          ? null
          : Number(metric.value),
      status:
        metric.status as StoredTelemetrySnapshot["metrics"][number]["status"],
    })),
  };
}
