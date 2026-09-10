export const autonomyLevels = [0, 1, 2, 3, 4] as const;
export type AutonomyLevel = (typeof autonomyLevels)[number];

export function requiresHumanApproval(level: AutonomyLevel): boolean {
  return level < 4;
}
