import Fastify from "fastify";
import type { ApiDeps } from "./deps.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerContentRoutes } from "./routes/contents.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerLinkedInOAuthRoutes } from "./routes/linkedin-oauth.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerPublicationRoutes } from "./routes/publications.js";
import { registerQueueRoutes } from "./routes/queue.js";
import { registerTelemetryRoutes } from "./routes/telemetry.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";

export type { ApiDeps } from "./deps.js";

export async function buildApi(deps: ApiDeps = {}) {
  const app = Fastify({ logger: false, bodyLimit: 21 * 1024 * 1024 });

  for (const mime of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/octet-stream",
  ]) {
    app.addContentTypeParser(mime, (_request, payload, done) => {
      done(null, payload);
    });
  }

  registerHealthRoutes(app);
  registerWorkspaceRoutes(app, deps);
  registerLinkedInOAuthRoutes(app, deps);
  registerMediaRoutes(app, deps);
  registerContentRoutes(app, deps);
  registerApprovalRoutes(app, deps);
  registerPublicationRoutes(app, deps);
  registerQueueRoutes(app, deps);
  registerTelemetryRoutes(app, deps);

  return app;
}
