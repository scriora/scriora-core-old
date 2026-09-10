import { randomUUID } from "node:crypto";
import { collectDescriptiveTelemetry } from "@scriora/analytics";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appDatabaseUrl,
  createPostgresTelemetryStore,
  migrate,
  withWorkspace,
} from "../index.js";

const adminUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!adminUrl)("telemetry snapshots", () => {
  let admin: pg.Pool;
  let app: pg.Pool;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: adminUrl });
    app = new pg.Pool({
      connectionString: appDatabaseUrl(adminUrl),
      max: 4,
    });
    await admin.query("drop schema if exists public cascade");
    await admin.query("create schema public");
    await migrate(admin);
    await admin.query(
      "alter role scriora_app with login password 'scriora_app'",
    );
  });

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  it("stores a permission-limited poll once and hides it from other tenants", async () => {
    const owner = randomUUID();
    const workspaceA = randomUUID();
    const workspaceB = randomUUID();
    await app.query(`insert into users (id, email, name) values ($1, $2, $3)`, [
      owner,
      `${owner}@telemetry.test`,
      "Telemetry",
    ]);
    await withWorkspace(app, workspaceA, async (client) => {
      await client.query(
        `insert into workspaces (id, name, slug, purpose, owner_user_id)
         values ($1, 'Alpha', $2, 'PERSONAL', $3)`,
        [workspaceA, `tel-a-${workspaceA.slice(0, 8)}`, owner],
      );
      await client.query(
        `insert into social_accounts (
           workspace_id, platform, external_account_id, display_name,
           granted_scopes, refresh_mode, cap_oauth, cap_publish,
           cap_comments, cap_analytics, cap_inbox
         ) values ($1, 'linkedin', 'urn:li:person:a', 'Ada',
           ARRAY['w_member_social'], 'reauthorize', true, true, false, false, false)`,
        [workspaceA],
      );
      await client.query(
        `insert into publish_attempts (
           workspace_id, idempotency_key, request_fingerprint, status,
           attempt_number, external_post_id
         ) values ($1, 'pub-1', 'fp', 'PLATFORM_PENDING', 1, 'urn:li:share:1')`,
        [workspaceA],
      );
    });
    await withWorkspace(app, workspaceB, async (client) => {
      await client.query(
        `insert into workspaces (id, name, slug, purpose, owner_user_id)
         values ($1, 'Beta', $2, 'WORK', $3)`,
        [workspaceB, `tel-b-${workspaceB.slice(0, 8)}`, owner],
      );
    });

    const store = createPostgresTelemetryStore(app);
    const context = await store.loadContext(workspaceA, "pub-1");
    expect(context?.capAnalytics).toBe(false);
    const normalized = await collectDescriptiveTelemetry({
      canAnalytics: false,
    });
    const first = await store.saveSnapshot({
      workspaceId: workspaceA,
      socialAccountId: context?.socialAccountId ?? "",
      externalPostId: "urn:li:share:1",
      pollSlot: "manual",
      grantedScopes: context?.grantedScopes ?? [],
      snapshot: normalized,
    });
    const second = await store.saveSnapshot({
      workspaceId: workspaceA,
      socialAccountId: context?.socialAccountId ?? "",
      externalPostId: "urn:li:share:1",
      pollSlot: "manual",
      grantedScopes: context?.grantedScopes ?? [],
      snapshot: normalized,
    });
    expect(second.id).toBe(first.id);
    expect(first.metrics.every((row) => row.value === null)).toBe(true);
    expect(
      first.metrics.every((row) => row.status === "PERMISSION_DENIED"),
    ).toBe(true);

    const asB = await withWorkspace(app, workspaceB, async (client) => {
      const snapshots = await client.query(
        "select id from analytics_snapshots",
      );
      const metrics = await client.query("select id from analytics_metrics");
      return { snapshots: snapshots.rows, metrics: metrics.rows };
    });
    expect(asB).toEqual({ snapshots: [], metrics: [] });
  });
});
