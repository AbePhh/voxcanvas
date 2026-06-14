import type { AddSceneObjectCommand, SceneCommand } from './types'
import { createScenePlanSummary } from './scenePlan'
import type { ScenePlanSummary } from './scenePlan'
import './ScenePlanPreview.css'

type ScenePlanPreviewProps = {
  command?: SceneCommand | AddSceneObjectCommand
  summary?: ScenePlanSummary
  showSteps?: boolean
}

export function ScenePlanPreview({
  command,
  summary,
  showSteps = false,
}: ScenePlanPreviewProps) {
  const scenePlan = summary ?? (command ? createScenePlanSummary(command) : null)

  if (!scenePlan) {
    return null
  }

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
          <li
            key={group.id}
            className={group.selected ? 'scene-plan__group is-selected' : 'scene-plan__group'}
          >
            <span>{group.label}</span>
            {group.referenceLabels?.length ? (
              <em>{group.referenceLabels.slice(0, 4).join(' / ')}</em>
            ) : null}
            <small>
              {group.elements
                .map((element) => {
                  const label = element.partLabel ?? element.label

                  return element.detail ? `${label}：${element.detail}` : label
                })
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
