import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { withWorkspace } from "../tenancy.js";

export type WorkspaceRecord = {
  id: string;
  name: string;
};

export type OperatorRecord = {
  userId: string;
  email: string;
  name: string;
};

export type WorkspaceStore = {
  upsertOperator(
    email: string,
    name?: string,
  ): Promise<OperatorRecord | { ok: false; error: "empty" }>;
  list(userId?: string): Promise<WorkspaceRecord[]>;
  create(
    name: string,
    ownerUserId?: string,
  ): Promise<
    | { ok: true; workspace: WorkspaceRecord }
    | { ok: false; error: "empty" | "duplicate" }
  >;
};

function slugFor(name: string, id: string) {
  return `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "workspace"
  }-${id.slice(0, 8)}`;
}

export function createPostgresWorkspaceStore(pool: Pool): WorkspaceStore {
  return {
    async upsertOperator(email, name) {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed.includes("@")) {
        return { ok: false, error: "empty" };
      }
      const display = name?.trim() || trimmed.split("@")[0] || "operator";
      const result = await pool.query(
        `insert into users (email, name)
         values ($1, $2)
         on conflict (email) do update set name = excluded.name, updated_at = now()
         returning id, email, name`,
        [trimmed, display],
      );
      const row = result.rows[0];
      if (!row) {
        return { ok: false, error: "empty" };
      }
      return {
        userId: row.id as string,
        email: row.email as string,
        name: row.name as string,
      };
    },
    async list(userId) {
      if (!userId) {
        return [];
      }
      const result = await pool.query(
        `select w.id, w.name
         from workspaces w
         join workspace_members m on m.workspace_id = w.id
         where m.user_id = $1 and w.deleted_at is null
         order by w.created_at desc`,
        [userId],
      );
      return result.rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
      }));
    },
    async create(name, ownerUserId) {
      const trimmed = name.trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        return { ok: false, error: "empty" };
      }
      const existing = await pool.query(
        `select 1 from workspaces where lower(name) = lower($1) and deleted_at is null`,
        [trimmed],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        return { ok: false, error: "duplicate" };
      }
      const id = randomUUID();
      await withWorkspace(pool, id, async (client) => {
        await client.query(
          `insert into workspaces (id, name, slug, purpose, owner_user_id)
           values ($1, $2, $3, 'PERSONAL', $4)`,
          [id, trimmed, slugFor(trimmed, id), ownerUserId ?? null],
        );
        if (ownerUserId) {
          await client.query(
            `insert into workspace_members (workspace_id, user_id, workspace_role)
             values ($1, $2, 'OWNER')`,
            [id, ownerUserId],
          );
        }
      });
      return { ok: true, workspace: { id, name: trimmed } };
    },
  };
}

export function createMemoryWorkspaceStore(): WorkspaceStore {
  const users = new Map<string, OperatorRecord>();
  const rows = new Map<string, WorkspaceRecord>();
  const members = new Map<string, Set<string>>();
  return {
    async upsertOperator(email, name) {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed.includes("@")) {
        return { ok: false, error: "empty" };
      }
      const existing = [...users.values()].find((row) => row.email === trimmed);
      if (existing) {
        if (name?.trim()) {
          existing.name = name.trim();
        }
        return existing;
      }
      const created: OperatorRecord = {
        userId: randomUUID(),
        email: trimmed,
        name: name?.trim() || trimmed.split("@")[0] || "operator",
      };
      users.set(created.userId, created);
      return created;
    },
    async list(userId) {
      if (!userId) {
        return [];
      }
      return [...rows.values()].filter((row) =>
        members.get(row.id)?.has(userId),
      );
    },
    async create(name, ownerUserId) {
      const trimmed = name.trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        return { ok: false as const, error: "empty" as const };
      }
      for (const row of rows.values()) {
        if (row.name.toLowerCase() === trimmed.toLowerCase()) {
          return { ok: false as const, error: "duplicate" as const };
        }
      }
      const workspace = { id: randomUUID(), name: trimmed };
      rows.set(workspace.id, workspace);
      if (ownerUserId) {
        members.set(workspace.id, new Set([ownerUserId]));
      }
      return { ok: true as const, workspace };
    },
  };
}
