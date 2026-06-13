import type { SceneCommand, SceneElement } from '../commands/types'
import { colorStyles } from './colorStyles'
import type { CanvasState, ShapeObject } from './types'

export const sceneGraphLimits = {
  maxElements: 24,
  minSize: 12,
  sceneWidth: 1000,
  safeMargin: 24,
  maxOverflowRatio: 0.25,
  maxTextLength: 30,
}

export type SceneSpace = {
  width: number
  height: number
}

export function getSceneSpace(canvas: Pick<CanvasState, 'width' | 'height'>): SceneSpace {
  return {
    width: sceneGraphLimits.sceneWidth,
    height: Math.round((sceneGraphLimits.sceneWidth * canvas.height) / canvas.width),
  }
}

function createSceneShapeId(element: SceneElement) {
  const safeId = element.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40)

  return `scene-${safeId}-${Math.random().toString(36).slice(2, 7)}`
}

function getSceneBounds(elements: SceneElement[]) {
  const minX = Math.min(...elements.map((element) => element.bbox.x))
  const minY = Math.min(...elements.map((element) => element.bbox.y))
  const maxX = Math.max(
    ...elements.map((element) => element.bbox.x + element.bbox.width),
  )
  const maxY = Math.max(
    ...elements.map((element) => element.bbox.y + element.bbox.height),
  )

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function fitElementsToSceneSpace(
  elements: SceneElement[],
  sceneSpace: SceneSpace,
): SceneElement[] {
  const bounds = getSceneBounds(elements)
  const scale = Math.min(
    1,
    (sceneSpace.width - sceneGraphLimits.safeMargin * 2) / bounds.width,
    (sceneSpace.height - sceneGraphLimits.safeMargin * 2) / bounds.height,
  )
  const fittedWidth = bounds.width * scale
  const fittedHeight = bounds.height * scale
  const offsetX =
    sceneGraphLimits.safeMargin +
    Math.max(0, (sceneSpace.width - sceneGraphLimits.safeMargin * 2 - fittedWidth) / 2)
  const offsetY =
    sceneGraphLimits.safeMargin +
    Math.max(0, (sceneSpace.height - sceneGraphLimits.safeMargin * 2 - fittedHeight) / 2)

  return elements.map((element) => ({
    ...element,
    bbox: {
      x: offsetX + (element.bbox.x - bounds.minX) * scale,
      y: offsetY + (element.bbox.y - bounds.minY) * scale,
      width: element.bbox.width * scale,
      height: element.bbox.height * scale,
    },
  }))
}

export function normalizeSceneElements(
  elements: SceneElement[],
  sceneSpace: SceneSpace,
): SceneElement[] {
  if (elements.length === 0) {
    return elements
  }

  const bounds = getSceneBounds(elements)
  const overflowLimit =
    Math.max(sceneSpace.width, sceneSpace.height) *
    sceneGraphLimits.maxOverflowRatio
  const isSlightlyOutOfBounds =
    bounds.minX >= -overflowLimit &&
    bounds.minY >= -overflowLimit &&
    bounds.maxX <= sceneSpace.width + overflowLimit &&
    bounds.maxY <= sceneSpace.height + overflowLimit
  const isOutOfBounds =
    bounds.minX < 0 ||
    bounds.minY < 0 ||
    bounds.maxX > sceneSpace.width ||
    bounds.maxY > sceneSpace.height

  return isOutOfBounds && isSlightlyOutOfBounds
    ? fitElementsToSceneSpace(elements, sceneSpace)
    : elements
}

export function createShapesFromSceneCommand(
  command: SceneCommand,
  canvas: Pick<CanvasState, 'width' | 'height'>,
): ShapeObject[] {
  const sceneSpace = getSceneSpace(canvas)
  const normalizedElements = normalizeSceneElements(command.elements, sceneSpace)
  const scaleX = canvas.width / sceneSpace.width
  const scaleY = canvas.height / sceneSpace.height

  return normalizedElements
    .map((element, index) => ({ element, index }))
    .sort(
      (a, b) =>
        (a.element.zIndex ?? a.index) - (b.element.zIndex ?? b.index) ||
        a.index - b.index,
    )
    .map(({ element, index }) => {
      const style = colorStyles[element.color]
      const width = Math.max(1, Math.round(element.bbox.width * scaleX))
      const height = Math.max(
        element.shape === 'line' ? 0 : 1,
        Math.round(element.bbox.height * scaleY),
      )

      return {
        id: createSceneShapeId(element),
        type: element.shape,
        x: Math.round(element.bbox.x * scaleX),
        y: Math.round(element.bbox.y * scaleY),
        width,
        height,
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: element.shape === 'line' ? 5 : 3,
        text:
          element.shape === 'text'
            ? (element.text?.slice(0, sceneGraphLimits.maxTextLength) ||
              element.partLabel ||
              element.groupLabel ||
              'Text')
            : undefined,
        fontSize:
          element.shape === 'text'
            ? Math.max(12, Math.min(48, Math.round(height * 0.6)))
            : undefined,
        groupId: element.groupId,
        groupLabel: element.groupLabel,
        partLabel: element.partLabel,
        zIndex: element.zIndex ?? index,
      } satisfies ShapeObject
    })
}
