import type { ParsedCommand } from '../commands/types'
import { getSceneSpace, sceneGraphLimits } from '../canvas/sceneGraph'
import type { CanvasState, ShapeObject } from '../canvas/types'

export const plannerSceneCapabilities = {
  allowedShapes: ['circle', 'rect', 'triangle', 'line', 'text'],
  allowedColors: [
    'red',
    'orange',
    'yellow',
    'green',
    'blue',
    'purple',
    'black',
    'white',
    'gray',
  ],
  maxElements: sceneGraphLimits.maxElements,
} as const

export type PlannerCanvasObject = Pick<
  ShapeObject,
  'id' | 'type' | 'x' | 'y' | 'width' | 'height' | 'fill' | 'text'
>

export type CommandPlannerInput = {
  sourceText: string
  localCommand?: ParsedCommand
  sceneSpace: {
    width: number
    height: number
    origin: 'top-left'
    unit: 'normalized'
  }
  sceneCapabilities: typeof plannerSceneCapabilities
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
  localCommand?: ParsedCommand,
): CommandPlannerInput {
  return {
    sourceText,
    localCommand,
    sceneSpace: {
      ...getSceneSpace(canvasState),
      origin: 'top-left',
      unit: 'normalized',
    },
    sceneCapabilities: plannerSceneCapabilities,
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
