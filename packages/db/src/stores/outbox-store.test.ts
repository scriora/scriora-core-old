import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appDatabaseUrl,
  createPostgresOutboxStore,
  migrate,
  withWorkspace,
} from "../index.js";

const adminUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!adminUrl)("outbox claim", () => {
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

  it("gives each worker a different command under skip locked", async () => {
    const owner = randomUUID();
    const workspaceId = randomUUID();
    await app.query(`insert into users (id, email, name) values ($1, $2, $3)`, [
      owner,
      `${owner}@outbox.test`,
      "Outbox",
    ]);
    await withWorkspace(app, workspaceId, async (client) => {
      await client.query(
        `insert into workspaces (id, name, slug, purpose, owner_user_id)
         values ($1, 'Outbox', $2, 'PERSONAL', $3)`,
        [workspaceId, `ob-${workspaceId.slice(0, 8)}`, owner],
      );
    });
    const store = createPostgresOutboxStore(app);
    await store.enqueue({
      workspaceId,
      idempotencyKey: "a",
      text: "one",
    });
    await store.enqueue({
      workspaceId,
      idempotencyKey: "b",
      text: "two",
    });
    const [first, second] = await Promise.all([
      store.claimDue(1),
      store.claimDue(1),
    ]);
    const ids = [...first, ...second].map((row) => row.idempotencyKey).sort();
    expect(ids).toEqual(["a", "b"]);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });
});
