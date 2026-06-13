import type { SceneCommand } from './types'
import { createScenePlanSummary } from './scenePlan'
import './ScenePlanPreview.css'

type ScenePlanPreviewProps = {
  command: SceneCommand
  showSteps?: boolean
}

export function ScenePlanPreview({
  command,
  showSteps = false,
}: ScenePlanPreviewProps) {
  const scenePlan = createScenePlanSummary(command)

  return (
    <section className="scene-plan" aria-label="Scene plan">
      <div className="scene-plan__summary">
        <strong>{scenePlan.title}</strong>
        <span>
          {scenePlan.groupCount} groups / {scenePlan.elementCount} elements
        </span>
      </div>
      <ul className="scene-plan__groups">
        {scenePlan.groups.map((group) => (
          <li key={group.id}>
            <span>{group.label}</span>
            <small>
              {group.elements
                .map((element) => element.partLabel ?? element.label)
                .join('、')}
            </small>
          </li>
        ))}
      </ul>
      {showSteps ? (
        <ol className="scene-plan__steps">
          {scenePlan.steps.map((step, index) => (
            <li key={`${index}-${step}`}>{step}</li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
