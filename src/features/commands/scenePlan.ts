import { colorStyles } from '../canvas/colorStyles'
import { createSemanticGroupSummaries } from '../canvas/semanticGroups'
import type { CanvasState, ShapeObject } from '../canvas/types'
import { colorLabels, shapeLabels } from './commandLabels'
import type { CommandColor, SceneCommand, SceneElement } from './types'

export type ScenePlanElementSummary = {
  id: string
  label: string
  partLabel?: string
  shapeLabel: string
  colorLabel: string
  detail?: string
  text?: string
}

export type ScenePlanGroupSummary = {
  id: string
  label: string
  referenceLabels?: string[]
  selected?: boolean
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

type IndexedSceneShape = {
  shape: ShapeObject
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

function sortSceneShapes(shapes: ShapeObject[]): IndexedSceneShape[] {
  return shapes
    .map((shape, index) => ({ shape, index }))
    .sort(
      (a, b) =>
        (a.shape.zIndex ?? a.index) - (b.shape.zIndex ?? b.index) ||
        a.index - b.index,
    )
}

function formatTextPreview(text: string) {
  const trimmed = text.trim()

  return trimmed.length > 12 ? `${trimmed.slice(0, 12)}...` : trimmed
}

function formatShapeText(shape: ShapeObject) {
  return shape.text ? formatTextPreview(shape.text) : undefined
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
    detail: `${colorLabels[element.color]}${shapeLabels[element.shape]}`,
    text: element.shape === 'text' ? element.text : undefined,
  }
}

function hasSceneMetadata(shape: ShapeObject) {
  return Boolean(shape.groupId || shape.groupLabel || shape.partLabel)
}

function getShapeGroupKey(shape: ShapeObject, index: number) {
  return shape.groupId ?? shape.groupLabel ?? shape.partLabel ?? `shape-${index}`
}

function getShapeColorLabel(shape: ShapeObject) {
  const fill = shape.fill.toLowerCase()
  const stroke = shape.stroke.toLowerCase()
  const colorEntry = (
    Object.entries(colorStyles) as Array<[CommandColor, (typeof colorStyles)[CommandColor]]>
  ).find(
    ([, style]) =>
      style.fill.toLowerCase() === fill ||
      style.stroke.toLowerCase() === stroke ||
      style.fill.toLowerCase() === stroke,
  )

  if (colorEntry) {
    return colorLabels[colorEntry[0]]
  }

  return fill === 'transparent' ? '透明' : '自定义颜色'
}

function getShapePositionLabel(
  shape: ShapeObject,
  canvas: Pick<CanvasState, 'width' | 'height'>,
) {
  const centerX = shape.x + shape.width / 2
  const centerY = shape.y + shape.height / 2
  const horizontal =
    centerX < canvas.width / 3
      ? 'left'
      : centerX > (canvas.width * 2) / 3
        ? 'right'
        : 'center'
  const vertical =
    centerY < canvas.height / 3
      ? 'top'
      : centerY > (canvas.height * 2) / 3
        ? 'bottom'
        : 'middle'

  if (horizontal === 'center' && vertical === 'middle') {
    return '画布中心'
  }

  if (horizontal === 'center') {
    return vertical === 'top' ? '上方' : '下方'
  }

  if (vertical === 'middle') {
    return horizontal === 'left' ? '左侧' : '右侧'
  }

  if (vertical === 'top') {
    return horizontal === 'left' ? '左上方' : '右上方'
  }

  return horizontal === 'left' ? '左下方' : '右下方'
}

function formatShapeSize(shape: ShapeObject) {
  if (shape.type === 'line') {
    return `${Math.round(shape.width)} px`
  }

  return `${Math.round(shape.width)} x ${Math.round(shape.height)}`
}

function describeSceneShape(shape: ShapeObject) {
  if (shape.groupLabel && shape.partLabel) {
    return `${shape.groupLabel}的${shape.partLabel}`
  }

  if (shape.partLabel) {
    return shape.partLabel
  }

  if (shape.groupLabel) {
    return shape.groupLabel
  }

  const text = formatShapeText(shape)

  if (shape.type === 'text' && text) {
    return `${getShapeColorLabel(shape)}文本“${text}”`
  }

  return `${getShapeColorLabel(shape)}${shapeLabels[shape.type]}`
}

function getShapeGroupLabel(shape: ShapeObject) {
  return shape.groupLabel ?? shape.partLabel ?? describeSceneShape(shape)
}

function summarizeShape(
  shape: ShapeObject,
  canvas: Pick<CanvasState, 'width' | 'height'>,
): ScenePlanElementSummary {
  const detailParts = [
    `${getShapeColorLabel(shape)}${shapeLabels[shape.type]}`,
    getShapePositionLabel(shape, canvas),
    formatShapeSize(shape),
  ]
  const textPreview = formatShapeText(shape)

  if (textPreview) {
    detailParts.push(`“${textPreview}”`)
  }

  return {
    id: shape.id,
    label: describeSceneShape(shape),
    partLabel: shape.partLabel,
    shapeLabel: shapeLabels[shape.type],
    colorLabel: getShapeColorLabel(shape),
    detail: detailParts.join(' / '),
    text: shape.type === 'text' ? shape.text : undefined,
  }
}

export function createScenePlanSummary(command: SceneCommand): ScenePlanSummary {
  const groups = new Map<string, ScenePlanGroupSummary>()
  const sortedElements = sortSceneElements(command.elements)
  const semanticGroups = createSemanticGroupSummaries(
    sortedElements.map(({ element }) => ({
      id: element.id,
      x: element.bbox.x,
      y: element.bbox.y,
      width: element.bbox.width,
      height: element.bbox.height,
      groupId: element.groupId,
      groupLabel: element.groupLabel,
      partLabel: element.partLabel,
      zIndex: element.zIndex,
    })),
  )
  const semanticGroupById = new Map(
    semanticGroups.map((group) => [group.id, group]),
  )

  sortedElements.forEach(({ element, index }) => {
    const groupKey = getGroupKey(element, index)
    const existingGroup = groups.get(groupKey)
    const semanticGroup = semanticGroupById.get(groupKey)

    if (existingGroup) {
      existingGroup.elements.push(summarizeElement(element))
      return
    }

    groups.set(groupKey, {
      id: groupKey,
      label: semanticGroup?.displayLabel ?? getGroupLabel(element),
      referenceLabels: semanticGroup?.referenceLabels,
      selected: semanticGroup?.selected,
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

export function createScenePlanSummaryFromShapes(
  canvas: Pick<
    CanvasState,
    'width' | 'height' | 'shapes' | 'selectedId' | 'selectedGroupId'
  >,
): ScenePlanSummary | null {
  const sceneShapes = canvas.shapes.filter(hasSceneMetadata)

  if (sceneShapes.length === 0) {
    return null
  }

  const groups = new Map<string, ScenePlanGroupSummary>()
  const sortedShapes = sortSceneShapes(sceneShapes)
  const semanticGroups = createSemanticGroupSummaries(
    sortedShapes.map(({ shape }) => shape),
    {
      selectedId: canvas.selectedId,
      selectedGroupId: canvas.selectedGroupId,
    },
  )
  const semanticGroupById = new Map(
    semanticGroups.map((group) => [group.id, group]),
  )

  sortedShapes.forEach(({ shape, index }) => {
    const groupKey = getShapeGroupKey(shape, index)
    const existingGroup = groups.get(groupKey)
    const semanticGroup = semanticGroupById.get(groupKey)

    if (existingGroup) {
      existingGroup.elements.push(summarizeShape(shape, canvas))
      return
    }

    groups.set(groupKey, {
      id: groupKey,
      label: semanticGroup?.displayLabel ?? getShapeGroupLabel(shape),
      referenceLabels: semanticGroup?.referenceLabels,
      selected: semanticGroup?.selected,
      elements: [summarizeShape(shape, canvas)],
    })
  })

  return {
    title: '当前场景描述',
    elementCount: sceneShapes.length,
    groupCount: groups.size,
    groups: Array.from(groups.values()),
    steps: sortedShapes.map(({ shape }) => `保留${describeSceneShape(shape)}`),
  }
}
