import {
  type DescriptiveMetricName,
  descriptiveMetricNames,
  type MetricObservationStatus,
} from "@scriora/domain";
import { assertHonestMetric } from "./honesty.js";

export type NormalizedMetric = {
  metric: DescriptiveMetricName;
  value: number | null;
  status: MetricObservationStatus;
};

export type SnapshotDataCapability =
  | "PERMISSION_LIMITED"
  | "OBSERVED"
  | "UNSUPPORTED"
  | "NOT_AVAILABLE";

export type NormalizedSnapshot = {
  dataCapability: SnapshotDataCapability;
  metrics: NormalizedMetric[];
  raw: Record<string, unknown>;
};

type FetchObservation = {
  canAnalytics: boolean;
  fetchAttempted: boolean;
  httpStatus: number | null;
  body: unknown;
};

const numericKeys: Record<DescriptiveMetricName, string[]> = {
  impressions: ["impressions", "impressionCount", "uniqueImpressions"],
  reactions: ["reactions", "likeCount", "likes"],
  comments: ["comments", "commentCount"],
  bookmarks: ["bookmarks", "bookmarkCount", "saves"],
};

export function normalizeLinkedInShareStats(
  input: FetchObservation,
): NormalizedSnapshot {
  assertHonestMetric("platform");
  if (!input.canAnalytics) {
    return {
      dataCapability: "PERMISSION_LIMITED",
      raw: {
        reason: "analytics_capability_false",
        fetchAttempted: false,
      },
      metrics: deniedMetrics("PERMISSION_DENIED"),
    };
  }
  if (!input.fetchAttempted) {
    return {
      dataCapability: "NOT_AVAILABLE",
      raw: {
        reason: "analytics_adapter_unconfigured",
        fetchAttempted: false,
      },
      metrics: deniedMetrics("NOT_AVAILABLE"),
    };
  }
  if (input.httpStatus === 403 || input.httpStatus === 401) {
    return {
      dataCapability: "PERMISSION_LIMITED",
      raw: {
        httpStatus: input.httpStatus,
        body: input.body ?? null,
      },
      metrics: deniedMetrics("PERMISSION_DENIED"),
    };
  }
  if (input.httpStatus !== 200) {
    return {
      dataCapability: "NOT_AVAILABLE",
      raw: {
        httpStatus: input.httpStatus,
        body: input.body ?? null,
      },
      metrics: deniedMetrics("NOT_AVAILABLE"),
    };
  }
  const record = asRecord(input.body);
  const metrics = descriptiveMetricNames.map((metric) =>
    observeNumber(metric, firstNumber(record, numericKeys[metric])),
  );
  const observed = metrics.some(
    (row) => row.status === "OBSERVED" || row.status === "ZERO",
  );
  return {
    dataCapability: observed ? "OBSERVED" : "NOT_AVAILABLE",
    raw: { httpStatus: 200, body: input.body ?? null },
    metrics,
  };
}

function deniedMetrics(status: MetricObservationStatus): NormalizedMetric[] {
  return descriptiveMetricNames.map((metric) => ({
    metric,
    value: null,
    status,
  }));
}

function observeNumber(
  metric: DescriptiveMetricName,
  value: number | undefined,
): NormalizedMetric {
  if (value === undefined) {
    return { metric, value: null, status: "NOT_AVAILABLE" };
  }
  if (value === 0) {
    return { metric, value: 0, status: "ZERO" };
  }
  return { metric, value, status: "OBSERVED" };
}

function firstNumber(
  record: Record<string, unknown> | null,
  keys: string[],
): number | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return undefined;
}

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}
