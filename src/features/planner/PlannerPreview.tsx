import { createFallbackPlannerResult } from './fallbackPlanner'
import { createPlannerInput } from './types'
import type { CanvasState } from '../canvas/types'
import './PlannerPreview.css'

type PlannerPreviewProps = {
  canvasState: CanvasState
  enabled: boolean
  sourceText: string
}

export function PlannerPreview({
  canvasState,
  enabled,
  sourceText,
}: PlannerPreviewProps) {
  if (!enabled || !sourceText) {
    return null
  }

  const input = createPlannerInput(sourceText, canvasState)
  const result = createFallbackPlannerResult(input)

  if (result.status !== 'needs-ai') {
    return null
  }

  return (
    <div className="planner-preview" aria-live="polite">
      <h3>Planner Fallback</h3>
      <p>
        Local rules could not safely parse this command. A future AI planner can
        use the structured canvas context below.
      </p>
      <pre>
        {JSON.stringify(
          {
            reason: result.reason,
            sourceText: result.input.sourceText,
            selectedId: result.input.canvas.selectedId,
            objectCount: result.input.canvas.objects.length,
          },
          null,
          2,
        )}
      </pre>
    </div>
  )
}
