import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appDatabaseUrl,
  createPostgresGovernanceStore,
  migrate,
  withWorkspace,
} from "../index.js";

const adminUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!adminUrl)("governance rls", () => {
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

  it("hides drafts and approvals from other tenants", async () => {
    const owner = randomUUID();
    const workspaceA = randomUUID();
    const workspaceB = randomUUID();
    await app.query(`insert into users (id, email, name) values ($1, $2, $3)`, [
      owner,
      `${owner}@gov.test`,
      "Gov",
    ]);
    await withWorkspace(app, workspaceA, async (client) => {
      await client.query(
        `insert into workspaces (id, name, slug, purpose, owner_user_id)
         values ($1, 'Alpha', $2, 'PERSONAL', $3)`,
        [workspaceA, `gov-a-${workspaceA.slice(0, 8)}`, owner],
      );
    });
    await withWorkspace(app, workspaceB, async (client) => {
      await client.query(
        `insert into workspaces (id, name, slug, purpose, owner_user_id)
         values ($1, 'Beta', $2, 'WORK', $3)`,
        [workspaceB, `gov-b-${workspaceB.slice(0, 8)}`, owner],
      );
    });
    const store = createPostgresGovernanceStore(app);
    const draft = await store.createDraft({
      workspaceId: workspaceA,
      body: "Need approval",
    });
    await store.submit(workspaceA, draft.id);
    const asB = await withWorkspace(app, workspaceB, async (client) => {
      const contents = await client.query("select id from contents");
      const approvals = await client.query("select id from approvals");
      return { contents: contents.rows, approvals: approvals.rows };
    });
    expect(asB).toEqual({ contents: [], approvals: [] });
  });
});
