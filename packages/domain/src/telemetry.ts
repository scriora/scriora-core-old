export const telemetryPollSlots = [
  { id: "t_plus_2h", offsetMs: 2 * 60 * 60 * 1000 },
  { id: "t_plus_6h", offsetMs: 6 * 60 * 60 * 1000 },
  { id: "t_plus_12h", offsetMs: 12 * 60 * 60 * 1000 },
  { id: "t_plus_24h", offsetMs: 24 * 60 * 60 * 1000 },
  { id: "t_plus_48h", offsetMs: 48 * 60 * 60 * 1000 },
  { id: "t_plus_7d", offsetMs: 7 * 24 * 60 * 60 * 1000 },
] as const;

export type TelemetryPollSlot =
  | (typeof telemetryPollSlots)[number]["id"]
  | "manual";

const pollSlotIds = new Set<string>([
  "manual",
  ...telemetryPollSlots.map((slot) => slot.id),
]);

export function isTelemetryPollSlot(value: string): value is TelemetryPollSlot {
  return pollSlotIds.has(value);
}

export const descriptiveMetricNames = [
  "impressions",
  "reactions",
  "comments",
  "bookmarks",
] as const;
export type DescriptiveMetricName = (typeof descriptiveMetricNames)[number];

export const metricObservationStatuses = [
  "OBSERVED",
  "ZERO",
  "UNSUPPORTED",
  "PERMISSION_DENIED",
  "NOT_AVAILABLE",
] as const;
export type MetricObservationStatus =
  (typeof metricObservationStatuses)[number];

export function dueTelemetrySlots(
  publishedAt: Date,
  now: Date,
): Array<(typeof telemetryPollSlots)[number]["id"]> {
  const elapsed = now.getTime() - publishedAt.getTime();
  return telemetryPollSlots
    .filter((slot) => elapsed >= slot.offsetMs)
    .map((slot) => slot.id);
}
