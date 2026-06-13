import { ScenePlanPreview } from '../commands/ScenePlanPreview'
import { createScenePlanSummaryFromShapes } from '../commands/scenePlan'
import type { CanvasState } from './types'
import './CanvasSceneSummary.css'

type CanvasSceneSummaryProps = {
  canvasState: CanvasState
}

export function CanvasSceneSummary({ canvasState }: CanvasSceneSummaryProps) {
  const sceneSummary = createScenePlanSummaryFromShapes(canvasState)

  return (
    <section className="canvas-scene-summary" aria-label="Current scene description">
      <h2>Scene Description</h2>
      {sceneSummary ? (
        <ScenePlanPreview summary={sceneSummary} />
      ) : (
        <p className="canvas-scene-summary__empty">
          Scene graph objects will stay here after AI scene commands run.
        </p>
      )}
    </section>
  )
}
