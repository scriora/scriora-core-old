import { mkdirSync } from "node:fs";
import path from "node:path";
import { createVault } from "@scriora/crypto";
import {
  createPostgresLinkedInOAuthStore,
  createPostgresLinkedInPublishStore,
  createPostgresOutboxStore,
} from "@scriora/db";
import pg from "pg";
import { buildApi } from "./app.js";
import {
  createLinkedInTextShare,
  exchangeLinkedInAuthorizationCode,
  fetchLinkedInMember,
  verifyLinkedInShare,
} from "./linkedin-http.js";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? "3001");
const vaultHex = process.env.VAULT_MASTER_KEY;
const databaseUrl = process.env.DATABASE_URL;
const clientId = process.env.LINKEDIN_CLIENT_ID;
const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
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

const linkedin =
  vault && pool && clientId && clientSecret && redirectUri
    ? {
        now: () => new Date(),
        vault,
        store: createPostgresLinkedInOAuthStore(pool),
        clientId,
        redirectUri,
        requestedScopes:
          process.env.LINKEDIN_SCOPES ?? "openid profile w_member_social",
        exchangeAuthorizationCode: (input: {
          code: string;
          redirectUri: string;
        }) =>
          exchangeLinkedInAuthorizationCode({
            ...input,
            clientId,
            clientSecret,
          }),
        fetchMember: fetchLinkedInMember,
      }
    : undefined;

const linkedinPublish =
  vault && pool
    ? {
        now: () => new Date(),
        vault,
        store: createPostgresLinkedInPublishStore(pool),
        outbox: createPostgresOutboxStore(pool),
        createShare: createLinkedInTextShare,
        verifyShare: verifyLinkedInShare,
      }
    : undefined;

if (vaultHex) {
  mkdirSync(mediaRoot, { recursive: true });
}

const media = vaultHex
  ? {
      hmacSecret: vaultHex,
      rootDir: mediaRoot,
      ...(pool ? { pool } : {}),
    }
  : undefined;

const app = await buildApi({
  ...(linkedin ? { linkedin } : {}),
  ...(linkedinPublish ? { linkedinPublish } : {}),
  ...(media ? { media } : {}),
});
await app.listen({ host, port });
