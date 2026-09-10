import type { TelemetryStore } from "@scriora/analytics";
import type { WorkspaceStore } from "@scriora/db";
import type { GovernanceStore } from "@scriora/policies";
import type {
  LinkedInDispatchPorts,
  LinkedInOAuthPorts,
} from "@scriora/social";
import type { Pool } from "pg";

export type ApiDeps = {
  classicAppOrigin?: string;
  linkedin?: LinkedInOAuthPorts;
  linkedinPublish?: LinkedInDispatchPorts;
  media?: {
    hmacSecret: string;
    rootDir: string;
    pool?: Pool;
  };
  telemetry?: {
    store: TelemetryStore;
    fetchStats?: (input: {
      postUrn: string;
    }) => Promise<{ httpStatus: number; body: unknown }>;
  };
  governance?: {
    store: GovernanceStore;
  };
  workspaces?: WorkspaceStore;
};
