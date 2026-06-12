import { createFallbackPlannerResult } from './fallbackPlanner'
import { createPlannerInput } from './types'
import type { CanvasState } from '../canvas/types'
import type { CommandPlannerResult } from './types'
import './PlannerPreview.css'

type PlannerPreviewProps = {
  canvasState: CanvasState
  enabled: boolean
  isPlanning?: boolean
  result?: CommandPlannerResult | null
  sourceText: string
}

export function PlannerPreview({
  canvasState,
  enabled,
  isPlanning = false,
  result,
  sourceText,
}: PlannerPreviewProps) {
  if (!enabled || !sourceText) {
    return null
  }

  const input = createPlannerInput(sourceText, canvasState)
  const previewResult = result ?? createFallbackPlannerResult(input)

  return (
    <div className="planner-preview" aria-live="polite">
      <h3>Planner Fallback</h3>
      {isPlanning ? <p>AI planner is interpreting this command...</p> : null}
      {!isPlanning && previewResult.status === 'needs-ai' ? (
        <p>
          Local rules could not safely parse this command. The AI planner can use
          the structured canvas context below.
        </p>
      ) : null}
      {!isPlanning && previewResult.status === 'planned' ? (
        <p>AI planner returned a valid command and it was executed.</p>
      ) : null}
      {!isPlanning && previewResult.status === 'invalid' ? (
        <p>AI planner returned an invalid command: {previewResult.reason}</p>
      ) : null}
      <pre>
        {JSON.stringify(
          previewResult.status === 'needs-ai'
            ? {
                reason: previewResult.reason,
                sourceText: previewResult.input.sourceText,
                selectedId: previewResult.input.canvas.selectedId,
                objectCount: previewResult.input.canvas.objects.length,
              }
            : previewResult,
          null,
          2,
        )}
      </pre>
    </div>
  )
}
