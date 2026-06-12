import type { CommandPlanner, CommandPlannerInput } from './types'

export const fallbackPlanner: CommandPlanner = (input) => ({
  status: 'needs-ai',
  reason: 'local-parser-could-not-understand-command',
  input,
})

export function createFallbackPlannerResult(input: CommandPlannerInput) {
  return {
    status: 'needs-ai',
    reason: 'local-parser-could-not-understand-command',
    input,
  } as const
}
