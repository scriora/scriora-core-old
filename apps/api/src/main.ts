import { createVault } from "@scriora/crypto";
import { createPostgresLinkedInOAuthStore } from "@scriora/db";
import pg from "pg";
import { buildApi } from "./app.js";
import {
  exchangeLinkedInAuthorizationCode,
  fetchLinkedInMember,
} from "./linkedin-http.js";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? "3001");

function vaultFromEnv() {
  const hex = process.env.VAULT_MASTER_KEY;
  if (hex?.length !== 64) {
    return null;
  }
  return createVault(new Map([[1, Buffer.from(hex, "hex")]]), 1);
}

const vault = vaultFromEnv();
const databaseUrl = process.env.DATABASE_URL;
const clientId = process.env.LINKEDIN_CLIENT_ID;
const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

const linkedin =
  vault && databaseUrl && clientId && clientSecret && redirectUri
    ? {
        now: () => new Date(),
        vault,
        store: createPostgresLinkedInOAuthStore(
          new pg.Pool({ connectionString: databaseUrl }),
        ),
        clientId,
        redirectUri,
        requestedScopes:
          process.env.LINKEDIN_SCOPES ?? "openid profile w_member_social",
        exchangeAuthorizationCode: (input: {
          code: string;
          codeVerifier: string;
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

const app = await buildApi(linkedin ? { linkedin } : {});
await app.listen({ host, port });
