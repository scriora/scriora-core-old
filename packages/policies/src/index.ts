export const autonomyLevels = [0, 1, 2, 3, 4] as const;
export type AutonomyLevel = (typeof autonomyLevels)[number];

export function requiresHumanApproval(level: AutonomyLevel): boolean {
  return level < 4;
}

export {
  createMemoryGovernanceStore,
  type GovernanceApproval,
  type GovernanceContent,
  type GovernancePolicy,
  type GovernanceStore,
} from "./memory-store.js";
export {
  type ApprovalStatus,
  approvalStatuses,
  type ClassicAutonomyMode,
  classicAutonomyModes,
  evaluateLiveDispatch,
  type LiveDispatchDenial,
} from "./publish-gate.js";
