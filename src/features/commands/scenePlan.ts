import type { SceneCommand, SceneElement } from './types'
import { colorLabels, shapeLabels } from './commandLabels'

export type ScenePlanElementSummary = {
  id: string
  label: string
  partLabel?: string
  shapeLabel: string
  colorLabel: string
  text?: string
}

export type ScenePlanGroupSummary = {
  id: string
  label: string
  elements: ScenePlanElementSummary[]
}

export type ScenePlanSummary = {
  title: string
  elementCount: number
  groupCount: number
  groups: ScenePlanGroupSummary[]
  steps: string[]
}

type IndexedSceneElement = {
  element: SceneElement
  index: number
}

function sortSceneElements(elements: SceneElement[]): IndexedSceneElement[] {
  return elements
    .map((element, index) => ({ element, index }))
    .sort(
      (a, b) =>
        (a.element.zIndex ?? a.index) - (b.element.zIndex ?? b.index) ||
        a.index - b.index,
    )
}

function formatTextPreview(text: string) {
  const trimmed = text.trim()

  return trimmed.length > 12 ? `${trimmed.slice(0, 12)}...` : trimmed
}

export function describeSceneElement(element: SceneElement) {
  if (element.groupLabel && element.partLabel) {
    return `${element.groupLabel}的${element.partLabel}`
  }

  if (element.partLabel) {
    return element.partLabel
  }

  if (element.groupLabel) {
    return element.groupLabel
  }

  if (element.shape === 'text' && element.text) {
    return `${colorLabels[element.color]}文本“${formatTextPreview(element.text)}”`
  }

  return `${colorLabels[element.color]}${shapeLabels[element.shape]}`
}

function getGroupKey(element: SceneElement, index: number) {
  return element.groupId ?? element.groupLabel ?? `element-${index}`
}

function getGroupLabel(element: SceneElement) {
  return element.groupLabel ?? element.partLabel ?? describeSceneElement(element)
}

function summarizeElement(element: SceneElement): ScenePlanElementSummary {
  return {
    id: element.id,
    label: describeSceneElement(element),
    partLabel: element.partLabel,
    shapeLabel: shapeLabels[element.shape],
    colorLabel: colorLabels[element.color],
    text: element.shape === 'text' ? element.text : undefined,
  }
}

export function createScenePlanSummary(command: SceneCommand): ScenePlanSummary {
  const groups = new Map<string, ScenePlanGroupSummary>()
  const sortedElements = sortSceneElements(command.elements)

  sortedElements.forEach(({ element, index }) => {
    const groupKey = getGroupKey(element, index)
    const existingGroup = groups.get(groupKey)

    if (existingGroup) {
      existingGroup.elements.push(summarizeElement(element))
      return
    }

    groups.set(groupKey, {
      id: groupKey,
      label: getGroupLabel(element),
      elements: [summarizeElement(element)],
    })
  })

  return {
    title: command.title?.trim() || '未命名场景',
    elementCount: command.elements.length,
    groupCount: groups.size,
    groups: Array.from(groups.values()),
    steps: sortedElements.map(({ element }) => `创建${describeSceneElement(element)}`),
  }
}
