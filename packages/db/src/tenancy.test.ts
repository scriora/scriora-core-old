import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appDatabaseUrl, migrate, withWorkspace } from "./index.js";

const adminUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!adminUrl)("workspace RLS", () => {
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

  it("lets Tenant A insert and read its own workspace, and hides it from Tenant B", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const workspaceA = randomUUID();
    const workspaceB = randomUUID();

    await app.query(
      `insert into users (id, email, name) values ($1, $2, $3), ($4, $5, $6)`,
      [ownerA, `${ownerA}@a.test`, "A", ownerB, `${ownerB}@b.test`, "B"],
    );

    await withWorkspace(app, workspaceA, async (client) => {
      await client.query(
        `insert into workspaces (id, name, slug, purpose, owner_user_id)
         values ($1, 'Alpha', $2, 'PERSONAL', $3)`,
        [workspaceA, `alpha-${workspaceA.slice(0, 8)}`, ownerA],
      );
      await client.query(
        `insert into workspace_members (workspace_id, user_id, workspace_role)
         values ($1, $2, 'OWNER')`,
        [workspaceA, ownerA],
      );
    });

    await withWorkspace(app, workspaceB, async (client) => {
      await client.query(
        `insert into workspaces (id, name, slug, purpose, owner_user_id)
         values ($1, 'Beta', $2, 'WORK', $3)`,
        [workspaceB, `beta-${workspaceB.slice(0, 8)}`, ownerB],
      );
    });

    const asA = await withWorkspace(app, workspaceA, async (client) => {
      const workspaces = await client.query("select id, name from workspaces");
      const members = await client.query(
        "select user_id from workspace_members",
      );
      return { workspaces: workspaces.rows, members: members.rows };
    });

    expect(asA.workspaces).toEqual([{ id: workspaceA, name: "Alpha" }]);
    expect(asA.members).toHaveLength(1);

    const asB = await withWorkspace(app, workspaceB, async (client) => {
      const stolen = await client.query(
        "select id from workspaces where id = $1",
        [workspaceA],
      );
      const update = await client.query(
        "update workspaces set name = 'Hijacked' where id = $1",
        [workspaceA],
      );
      const del = await client.query("delete from workspaces where id = $1", [
        workspaceA,
      ]);
      const members = await client.query(
        "select * from workspace_members where workspace_id = $1",
        [workspaceA],
      );
      return {
        stolen: stolen.rows,
        updated: update.rowCount,
        deleted: del.rowCount,
        members: members.rows,
      };
    });

    expect(asB.stolen).toEqual([]);
    expect(asB.updated).toBe(0);
    expect(asB.deleted).toBe(0);
    expect(asB.members).toEqual([]);
  });

  it("rejects a raw insert into another tenant even when workspace_id is spoofed", async () => {
    const owner = randomUUID();
    const workspaceA = randomUUID();
    const workspaceB = randomUUID();

    await app.query(`insert into users (id, email, name) values ($1, $2, $3)`, [
      owner,
      `${owner}@spoof.test`,
      "Spoof",
    ]);

    await withWorkspace(app, workspaceA, async (client) => {
      await client.query(
        `insert into workspaces (id, name, slug, purpose, owner_user_id)
         values ($1, 'Alpha', $2, 'PERSONAL', $3)`,
        [workspaceA, `spoof-a-${workspaceA.slice(0, 8)}`, owner],
      );
    });

    await expect(
      withWorkspace(app, workspaceB, async (client) => {
        await client.query(
          `insert into workspace_members (workspace_id, user_id, workspace_role)
           values ($1, $2, 'ADMIN')`,
          [workspaceA, owner],
        );
      }),
    ).rejects.toThrow(
      /workspace scope mismatch|new row violates row-level security/i,
    );

    const members = await withWorkspace(app, workspaceA, (client) =>
      client.query("select * from workspace_members"),
    );
    expect(members.rows).toEqual([]);
  });

  it("does not leak tenant context across pooled connections", async () => {
    const owner = randomUUID();
    const workspaceId = randomUUID();

    await app.query(`insert into users (id, email, name) values ($1, $2, $3)`, [
      owner,
      `${owner}@pool.test`,
      "Pool",
    ]);

    await withWorkspace(app, workspaceId, async (client) => {
      await client.query(
        `insert into workspaces (id, name, slug, purpose, owner_user_id)
         values ($1, 'Pooled', $2, 'CLIENT', $3)`,
        [workspaceId, `pool-${workspaceId.slice(0, 8)}`, owner],
      );
    });

    const leaked = await app.query("select id from workspaces");
    expect(leaked.rows).toEqual([]);

    const setting = await app.query(
      "select current_setting('app.current_workspace_id', true) as workspace_id",
    );
    expect(setting.rows[0]?.workspace_id).toBe("");
  });
});
