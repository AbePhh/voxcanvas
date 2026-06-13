import { createFallbackPlannerResult } from './fallbackPlanner'
import { createPlannerInput } from './types'
import type { CanvasState } from '../canvas/types'
import type { CommandPlannerResult } from './types'
import type { ParsedCommand } from '../commands/types'
import { ScenePlanPreview } from '../commands/ScenePlanPreview'
import './PlannerPreview.css'

type PlannerPreviewProps = {
  canvasState: CanvasState
  enabled: boolean
  isPlanning?: boolean
  localCommand?: ParsedCommand | null
  result?: CommandPlannerResult | null
  sourceText: string
}

export function PlannerPreview({
  canvasState,
  enabled,
  isPlanning = false,
  localCommand,
  result,
  sourceText,
}: PlannerPreviewProps) {
  if (!enabled || !sourceText) {
    return null
  }

  const input = createPlannerInput(sourceText, canvasState, localCommand ?? undefined)
  const previewResult = result ?? createFallbackPlannerResult(input)
  const plannedCommand =
    previewResult.status === 'planned' ? previewResult.command : null
  const plannedScene = plannedCommand?.action === 'scene' ? plannedCommand : null

  return (
    <div className="planner-preview" aria-live="polite">
      <h3>{plannedScene ? 'Scene Plan' : 'Planner Fallback'}</h3>
      {isPlanning ? <p>AI planner is interpreting this command...</p> : null}
      {!isPlanning && previewResult.status === 'needs-ai' ? (
        <p>
          Local rules could not safely parse this command. The AI planner can use
          the structured canvas context below.
        </p>
      ) : null}
      {!isPlanning && previewResult.status === 'planned' ? (
        <p>
          AI planner returned a valid {plannedScene ? 'scene plan' : 'command'} and
          it was executed.
        </p>
      ) : null}
      {!isPlanning && previewResult.status === 'invalid' ? (
        <p>AI planner returned an invalid command: {previewResult.reason}</p>
      ) : null}
      {plannedScene ? <ScenePlanPreview command={plannedScene} showSteps /> : null}
      {previewResult.status === 'planned' &&
      previewResult.command.action === 'create' &&
      localCommand?.action === 'unknown' ? (
        <p className="planner-preview__warning">
          This complex request was normalized to one shape instead of a scene graph.
          Try a more explicit multi-object command or improve the scene prompt.
        </p>
      ) : null}
      <pre>
        {JSON.stringify(
          previewResult.status === 'needs-ai'
            ? {
                reason: previewResult.reason,
                sourceText: previewResult.input.sourceText,
                localAction: previewResult.input.localCommand?.action,
                localReason:
                  previewResult.input.localCommand?.action === 'unknown'
                    ? previewResult.input.localCommand.reason
                    : undefined,
                selectedId: previewResult.input.canvas.selectedId,
                objectCount: previewResult.input.canvas.objects.length,
                sceneSpace: previewResult.input.sceneSpace,
                maxSceneElements: previewResult.input.sceneCapabilities.maxElements,
              }
            : previewResult,
          null,
          2,
        )}
      </pre>
    </div>
  )
}
