import { validatePlannedCommand } from './commandValidator'
import type { CommandPlanner, CommandPlannerResult } from './types'
import { getNormalizationDecision } from './normalizationPolicy'
import type { ParsedCommand } from '../commands/types'

type PlannerApiResponse = {
  rawCommand?: unknown
  error?: string
  message?: string
}

export const aiPlanner: CommandPlanner = async (input): Promise<CommandPlannerResult> => {
  try {
    const response = await fetch('/api/plan-command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })

    const body = (await response.json()) as PlannerApiResponse

    if (!response.ok) {
      return {
        status: 'invalid',
        reason: body.error ?? 'planner-api-error',
        rawValue: body,
      }
    }

    return validatePlannedCommand(body.rawCommand, {
      canvas: input.canvas,
      sourceText: input.sourceText,
      localCommand: input.localCommand,
    })
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : 'planner-network-error',
      rawValue: error,
    }
  }
}

export function shouldUseAiPlanner(sourceText: string, localCommand: ParsedCommand) {
  return getNormalizationDecision(sourceText, localCommand).useAi
}
