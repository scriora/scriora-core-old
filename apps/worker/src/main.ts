import path from "node:path";
import { createVault } from "@scriora/crypto";
import {
  createPostgresLinkedInPublishStore,
  createPostgresOutboxStore,
} from "@scriora/db";
import pg from "pg";
import {
  postgresLinkedInShare,
  verifyLinkedInShare,
} from "../../api/src/linkedin/http.js";
import {
  bootWorker,
  runOutboxLoop,
  runOutboxTick,
  workerPollMs,
} from "./boot.js";

const vaultHex = process.env.VAULT_MASTER_KEY;
const databaseUrl = process.env.DATABASE_URL;
const mediaRoot = path.resolve(process.env.MEDIA_ROOT ?? "./data/media");

function vaultFromEnv() {
  if (vaultHex?.length !== 64) {
    return null;
  }
  return createVault(new Map([[1, Buffer.from(vaultHex, "hex")]]), 1);
}

const vault = vaultFromEnv();
const pool = databaseUrl
  ? new pg.Pool({ connectionString: databaseUrl })
  : undefined;

const linkedinPublish =
  vault && pool
    ? {
        now: () => new Date(),
        vault,
        store: createPostgresLinkedInPublishStore(pool),
        outbox: createPostgresOutboxStore(pool),
        createShare: postgresLinkedInShare(pool, mediaRoot),
        verifyShare: verifyLinkedInShare,
      }
    : undefined;

const state = bootWorker();
console.log(`scriora-worker ${state.status}`);

const shuttingDown = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => shuttingDown.abort());
}

await runOutboxLoop({
  pollMs: workerPollMs(),
  signal: shuttingDown.signal,
  tick: async () => {
    if (!linkedinPublish) {
      return 0;
    }
    return runOutboxTick(linkedinPublish);
  },
});

await pool?.end();
