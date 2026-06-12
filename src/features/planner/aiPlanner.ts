import { validatePlannedCommand } from './commandValidator'
import type { CommandPlanner, CommandPlannerResult } from './types'

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

    return validatePlannedCommand(body.rawCommand, { canvas: input.canvas })
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : 'planner-network-error',
      rawValue: error,
    }
  }
}

export function shouldUseAiPlanner(sourceText: string, localAction: string) {
  return (
    localAction === 'unknown' ||
    /文本|文字|文本框|标题|写着|写上|内容是|内容为|插入/.test(sourceText)
  )
}
