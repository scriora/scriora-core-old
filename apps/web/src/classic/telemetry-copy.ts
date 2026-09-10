export function telemetryValueLabel(input: {
  value: number | null;
  status: string;
  unavailable: string;
}): string {
  if (input.status === "OBSERVED" && input.value !== null) {
    return String(input.value);
  }
  return input.unavailable;
}
