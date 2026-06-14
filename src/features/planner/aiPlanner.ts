import { validatePlannedCommand } from './commandValidator'
import { createAlignmentFallbackCommand } from './alignmentFallback'
import { createImplicitMultiCreateBatchCommand } from '../commands/implicitMultiCreate'
import type { CommandPlanner, CommandPlannerResult } from './types'
import { getNormalizationDecision } from './normalizationPolicy'
import type { ParsedCommand } from '../commands/types'

type PlannerApiResponse = {
  rawCommand?: unknown
  error?: string
  message?: string
}

function validateAlignmentFallback(input: Parameters<CommandPlanner>[0]) {
  const fallbackCommand = createAlignmentFallbackCommand(input.sourceText)

  return fallbackCommand
    ? validatePlannedCommand(fallbackCommand, {
        canvas: input.canvas,
        sourceText: input.sourceText,
        localCommand: input.localCommand,
      })
    : null
}

function validateImplicitMultiCreateFallback(input: Parameters<CommandPlanner>[0]) {
  const fallbackCommand = createImplicitMultiCreateBatchCommand(input.sourceText)

  return fallbackCommand
    ? validatePlannedCommand(fallbackCommand, {
        canvas: input.canvas,
        sourceText: input.sourceText,
        localCommand: input.localCommand,
      })
    : null
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

    const plannedResult = validatePlannedCommand(body.rawCommand, {
      canvas: input.canvas,
      sourceText: input.sourceText,
      localCommand: input.localCommand,
    })

    if (
      plannedResult.status === 'invalid' &&
      (plannedResult.reason === 'unsupported-action' ||
        plannedResult.reason === 'multi-step-command-requires-batch' ||
        plannedResult.reason.startsWith('invalid-batch-step'))
    ) {
      const fallbackResult = validateImplicitMultiCreateFallback(input)

      if (fallbackResult) {
        return fallbackResult
      }
    }

    if (
      plannedResult.status === 'invalid' &&
      (plannedResult.reason === 'unsupported-action' ||
        plannedResult.reason === 'command-must-be-an-object-with-action')
    ) {
      const fallbackResult = validateAlignmentFallback(input)

      if (fallbackResult) {
        return fallbackResult
      }
    }

    return plannedResult
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
