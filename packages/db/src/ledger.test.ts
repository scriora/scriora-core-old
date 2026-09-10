import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appDatabaseUrl, migrate, withWorkspace } from "./index.js";
import { createPostgresLinkedInOAuthStore } from "./oauth-store.js";

const adminUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!adminUrl)("vault envelopes and unused ledgers", () => {
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

  it("persists unused ledgers and hides them from other tenants", async () => {
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
        [workspaceA, `led-a-${workspaceA.slice(0, 8)}`, ownerA],
      );
      await client.query(
        `insert into secret_envelopes (workspace_id, name, key_version, iv, tag, ciphertext)
         values ($1, 'linkedin.refresh', 1, $2, $3, $4)`,
        [
          workspaceA,
          Buffer.alloc(12, 1),
          Buffer.alloc(16, 2),
          Buffer.from("ct"),
        ],
      );
      await client.query(
        `insert into publish_attempts
           (workspace_id, idempotency_key, request_fingerprint, status, attempt_number)
         values ($1, 'pub-1', 'fp-a', 'RESERVED', 1)`,
        [workspaceA],
      );
      await client.query(
        `insert into llm_usage_entries
           (workspace_id, prompt_tokens, completion_tokens, estimated_cost)
         values ($1, 12, 4, 0.0100)`,
        [workspaceA],
      );
      await client.query(
        `insert into media_usage_entries (workspace_id, bytes) values ($1, 2048)`,
        [workspaceA],
      );
    });

    await withWorkspace(app, workspaceB, async (client) => {
      await client.query(
        `insert into workspaces (id, name, slug, purpose, owner_user_id)
         values ($1, 'Beta', $2, 'WORK', $3)`,
        [workspaceB, `led-b-${workspaceB.slice(0, 8)}`, ownerB],
      );
    });

    const asA = await withWorkspace(app, workspaceA, async (client) => {
      const envelopes = await client.query(
        "select name, key_version from secret_envelopes",
      );
      const attempts = await client.query(
        "select idempotency_key, status from publish_attempts",
      );
      const llm = await client.query(
        "select prompt_tokens from llm_usage_entries",
      );
      const media = await client.query("select bytes from media_usage_entries");
      return {
        envelopes: envelopes.rows,
        attempts: attempts.rows,
        llm: llm.rows,
        media: media.rows,
      };
    });

    expect(asA.envelopes).toEqual([
      { name: "linkedin.refresh", key_version: 1 },
    ]);
    expect(asA.attempts).toEqual([
      { idempotency_key: "pub-1", status: "RESERVED" },
    ]);
    expect(asA.llm).toEqual([{ prompt_tokens: 12 }]);
    expect(asA.media).toEqual([{ bytes: "2048" }]);

    const asB = await withWorkspace(app, workspaceB, async (client) => {
      const envelopes = await client.query("select id from secret_envelopes");
      const attempts = await client.query("select id from publish_attempts");
      const llm = await client.query("select id from llm_usage_entries");
      const media = await client.query("select id from media_usage_entries");
      return {
        envelopes: envelopes.rows,
        attempts: attempts.rows,
        llm: llm.rows,
        media: media.rows,
      };
    });

    expect(asB).toEqual({
      envelopes: [],
      attempts: [],
      llm: [],
      media: [],
    });
  });

  it("keeps llm and media usage in separate unused ledgers", async () => {
    const columns = await admin.query(`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('llm_usage_entries', 'media_usage_entries')
      order by table_name, column_name
    `);
    const names = columns.rows.map(
      (row: { table_name: string; column_name: string }) =>
        `${row.table_name}.${row.column_name}`,
    );
    expect(names).toContain("llm_usage_entries.prompt_tokens");
    expect(names).toContain("media_usage_entries.bytes");
    expect(names).not.toContain("llm_usage_entries.bytes");
    expect(names).not.toContain("media_usage_entries.prompt_tokens");
  });

  it("hides connected social accounts from other tenants", async () => {
    const owner = randomUUID();
    const workspaceA = randomUUID();
    const workspaceB = randomUUID();
    await app.query(`insert into users (id, email, name) values ($1, $2, $3)`, [
      owner,
      `${owner}@social.test`,
      "Social",
    ]);
    await withWorkspace(app, workspaceA, async (client) => {
      await client.query(
        `insert into workspaces (id, name, slug, purpose, owner_user_id)
         values ($1, 'Alpha', $2, 'PERSONAL', $3)`,
        [workspaceA, `soc-a-${workspaceA.slice(0, 8)}`, owner],
      );
    });
    await withWorkspace(app, workspaceB, async (client) => {
      await client.query(
        `insert into workspaces (id, name, slug, purpose, owner_user_id)
         values ($1, 'Beta', $2, 'WORK', $3)`,
        [workspaceB, `soc-b-${workspaceB.slice(0, 8)}`, owner],
      );
    });

    const store = createPostgresLinkedInOAuthStore(app);
    await store.saveConnectedAccount({
      workspaceId: workspaceA,
      account: {
        externalAccountId: "urn:li:person:a",
        displayName: "Ada",
        grantedScopes: ["w_member_social"],
        capabilities: {
          oauth: true,
          publish: true,
          comments: false,
          analytics: false,
          inbox: false,
        },
        refreshMode: "reauthorize",
        tokenExpiresAt: null,
      },
      tokenEnvelope: {
        keyVersion: 1,
        iv: new Uint8Array(12),
        tag: new Uint8Array(16),
        ciphertext: new Uint8Array([1, 2, 3]),
      },
    });

    const asB = await withWorkspace(app, workspaceB, (client) =>
      client.query("select id from social_accounts"),
    );
    expect(asB.rows).toEqual([]);
  });
});
