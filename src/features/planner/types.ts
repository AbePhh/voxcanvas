import type { ParsedCommand } from '../commands/types'
import type { CanvasState, ShapeObject } from '../canvas/types'

export type PlannerCanvasObject = Pick<
  ShapeObject,
  'id' | 'type' | 'x' | 'y' | 'width' | 'height' | 'fill' | 'text'
>

export type CommandPlannerInput = {
  sourceText: string
  canvas: {
    width: number
    height: number
    selectedId?: string
    objects: PlannerCanvasObject[]
  }
}

export type CommandPlannerResult =
  | {
      status: 'planned'
      command: ParsedCommand
      source: 'local-fallback' | 'ai'
    }
  | {
      status: 'needs-ai'
      reason: string
      input: CommandPlannerInput
    }
  | {
      status: 'invalid'
      reason: string
      rawValue: unknown
    }

export type CommandPlanner = (
  input: CommandPlannerInput,
) => Promise<CommandPlannerResult> | CommandPlannerResult

export function createPlannerInput(
  sourceText: string,
  canvasState: CanvasState,
): CommandPlannerInput {
  return {
    sourceText,
    canvas: {
      width: canvasState.width,
      height: canvasState.height,
      selectedId: canvasState.selectedId,
      objects: canvasState.shapes.map((shape) => ({
        id: shape.id,
        type: shape.type,
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        fill: shape.fill,
        text: shape.text,
      })),
    },
  }
}
