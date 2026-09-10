export type MetricSource = "platform" | "invented";

export function assertHonestMetric(source: MetricSource): void {
  if (source === "invented") {
    throw new Error(
      "Analytics must come from platform data, never invented lift",
    );
  }
}
