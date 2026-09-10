import { normalizeLinkedInShareStats } from "./normalize.js";

export async function collectDescriptiveTelemetry(input: {
  canAnalytics: boolean;
  fetchStats?: () => Promise<{ httpStatus: number; body: unknown }>;
}) {
  if (!input.canAnalytics) {
    return normalizeLinkedInShareStats({
      canAnalytics: false,
      fetchAttempted: false,
      httpStatus: null,
      body: null,
    });
  }
  if (!input.fetchStats) {
    return normalizeLinkedInShareStats({
      canAnalytics: true,
      fetchAttempted: false,
      httpStatus: null,
      body: null,
    });
  }
  const observed = await input.fetchStats();
  return normalizeLinkedInShareStats({
    canAnalytics: true,
    fetchAttempted: true,
    httpStatus: observed.httpStatus,
    body: observed.body,
  });
}
