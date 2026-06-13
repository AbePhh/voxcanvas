import type { ShapeKind } from '../canvas/types'
import type {
  CanvasResizeAnchor,
  CanvasResizeDirection,
  CommandColor,
  CommandPosition,
  CommandSize,
  CommandTarget,
  SceneBBox,
  SceneElement,
} from '../commands/types'
import { matchesCommandColor } from '../canvas/colorStyles'
import { getSceneSpace, sceneGraphLimits } from '../canvas/sceneGraph'
import { matchesTargetPosition } from '../canvas/targetMatching'
import type { CommandPlannerInput, CommandPlannerResult } from './types'

const allowedActions = new Set([
  'create',
  'move',
  'recolor',
  'resize',
  'delete',
  'undo',
  'redo',
  'clear',
  'unknown',
  'resizeCanvas',
  'scene',
])
const allowedShapes = new Set<ShapeKind>(['circle', 'rect', 'triangle', 'line', 'text'])
const allowedColors = new Set<CommandColor>([
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'black',
  'white',
  'gray',
])
const allowedPositions = new Set<CommandPosition>([
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
])
const allowedSizes = new Set<CommandSize>(['small', 'medium', 'large'])
const allowedTargetModes = new Set(['selected', 'last', 'shape', 'position', 'any'])
const allowedMoveModes = new Set(['absolute', 'relative'])
const allowedMoveDirections = new Set(['left', 'right', 'up', 'down'])
const allowedResizeDirections = new Set(['larger', 'smaller'])
const allowedCanvasResizeDirections = new Set<CanvasResizeDirection>([
  'larger',
  'smaller',
  'wider',
  'narrower',
  'taller',
  'shorter',
])
const allowedCanvasResizeAnchors = new Set<CanvasResizeAnchor>([
  'center',
  'left',
  'right',
  'top',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
])
type ValidatorOptions = {
  canvas?: CommandPlannerInput['canvas']
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeSafeLabel(value: unknown, maxLength = 32) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()

  return normalized ? normalized.slice(0, maxLength) : undefined
}

function normalizeSceneBBox(value: unknown): SceneBBox | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height)
  ) {
    return null
  }

  if (
    value.width < sceneGraphLimits.minSize ||
    value.height < sceneGraphLimits.minSize
  ) {
    return null
  }

  return {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  }
}

function isSceneBBoxWildlyOutOfRange(
  bbox: SceneBBox,
  sceneSpace: ReturnType<typeof getSceneSpace>,
) {
  const overflowLimit =
    Math.max(sceneSpace.width, sceneSpace.height) *
    sceneGraphLimits.maxOverflowRatio

  return (
    bbox.x < -overflowLimit ||
    bbox.y < -overflowLimit ||
    bbox.x + bbox.width > sceneSpace.width + overflowLimit ||
    bbox.y + bbox.height > sceneSpace.height + overflowLimit
  )
}

function normalizeSceneElement(
  value: unknown,
  sceneSpace: ReturnType<typeof getSceneSpace>,
): SceneElement | null {
  if (!isRecord(value)) {
    return null
  }

  if (typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null
  }

  if (!allowedShapes.has(value.shape as ShapeKind)) {
    return null
  }

  if (!allowedColors.has(value.color as CommandColor)) {
    return null
  }

  const bbox = normalizeSceneBBox(value.bbox)

  if (!bbox || isSceneBBoxWildlyOutOfRange(bbox, sceneSpace)) {
    return null
  }

  if (value.zIndex !== undefined && !isFiniteNumber(value.zIndex)) {
    return null
  }

  if (value.text !== undefined && typeof value.text !== 'string') {
    return null
  }

  return {
    id: value.id.trim().slice(0, 48),
    groupId: normalizeSafeLabel(value.groupId, 48),
    groupLabel: normalizeSafeLabel(value.groupLabel),
    partLabel: normalizeSafeLabel(value.partLabel),
    shape: value.shape as ShapeKind,
    color: value.color as CommandColor,
    bbox,
    zIndex: value.zIndex,
    text:
      typeof value.text === 'string'
        ? value.text.trim().slice(0, sceneGraphLimits.maxTextLength)
        : undefined,
  }
}

function isCanvasResizeDirection(value: unknown): value is CanvasResizeDirection {
  return (
    typeof value === 'string' &&
    allowedCanvasResizeDirections.has(value as CanvasResizeDirection)
  )
}

function normalizeCanvasResizeAnchor(value: unknown): CanvasResizeAnchor | undefined {
  if (value === undefined) {
    return undefined
  }

  return typeof value === 'string' &&
    allowedCanvasResizeAnchors.has(value as CanvasResizeAnchor)
    ? (value as CanvasResizeAnchor)
    : undefined
}

function normalizeTarget(value: unknown): CommandTarget | null {
  if (typeof value === 'string' && allowedTargetModes.has(value)) {
    return {
      mode: value as CommandTarget['mode'],
    }
  }

  if (!isRecord(value) || typeof value.mode !== 'string') {
    return null
  }

  if (!allowedTargetModes.has(value.mode)) {
    return null
  }

  if (value.shape !== undefined && !allowedShapes.has(value.shape as ShapeKind)) {
    return null
  }

  if (
    value.position !== undefined &&
    !allowedPositions.has(value.position as CommandPosition)
  ) {
    return null
  }

  if (value.color !== undefined && !allowedColors.has(value.color as CommandColor)) {
    return null
  }

  return {
    mode: value.mode as CommandTarget['mode'],
    id: typeof value.id === 'string' ? value.id : undefined,
    shape: value.shape as ShapeKind | undefined,
    position: value.position as CommandPosition | undefined,
    color: value.color as CommandColor | undefined,
  }
}

function countTargetMatches(
  target: CommandTarget,
  canvas: CommandPlannerInput['canvas'],
) {
  const matchesFilters = (object: CommandPlannerInput['canvas']['objects'][number]) => {
    if (target.shape && object.type !== target.shape) {
      return false
    }

    if (target.color && !matchesCommandColor(object.fill, target.color)) {
      return false
    }

    if (target.position && !matchesTargetPosition(object, canvas, target.position)) {
      return false
    }

    return true
  }

  if (target.mode === 'selected') {
    return canvas.selectedId &&
      canvas.objects.some(
        (object) => object.id === canvas.selectedId && matchesFilters(object),
      )
      ? 1
      : 0
  }

  if (target.mode === 'last') {
    return canvas.objects.length > 0 ? 1 : 0
  }

  if (target.mode === 'shape' || target.mode === 'position' || target.mode === 'any') {
    return canvas.objects.filter(matchesFilters).length
  }

  return 0
}

function validateSingleTarget(
  target: CommandTarget,
  rawValue: unknown,
  options: ValidatorOptions,
) {
  if (!options.canvas) {
    return {
      status: 'invalid',
      reason: 'missing-canvas-context',
      rawValue,
    } satisfies CommandPlannerResult
  }

  const matchCount = countTargetMatches(target, options.canvas)

  if (matchCount !== 1) {
    return {
      status: 'invalid',
      reason: matchCount === 0 ? 'target-not-found' : 'ambiguous-target',
      rawValue,
    } satisfies CommandPlannerResult
  }

  return null
}

export function validatePlannedCommand(
  rawValue: unknown,
  options: ValidatorOptions = {},
): CommandPlannerResult {
  if (!isRecord(rawValue) || typeof rawValue.action !== 'string') {
    return {
      status: 'invalid',
      reason: 'command-must-be-an-object-with-action',
      rawValue,
    }
  }

  if (!allowedActions.has(rawValue.action)) {
    return {
      status: 'invalid',
      reason: 'unsupported-action',
      rawValue,
    }
  }

  const sourceText =
    typeof rawValue.sourceText === 'string' ? rawValue.sourceText : 'planner-output'

  if (rawValue.action === 'unknown') {
    return {
      status: 'invalid',
      reason:
        typeof rawValue.reason === 'string' ? rawValue.reason : 'unsupported-action',
      rawValue,
    }
  }

  if (rawValue.action === 'undo' || rawValue.action === 'redo' || rawValue.action === 'clear') {
    return {
      status: 'planned',
      source: 'ai',
      command: {
        action: rawValue.action,
        sourceText,
      },
    }
  }

  if (rawValue.action === 'scene') {
    if (!options.canvas) {
      return {
        status: 'invalid',
        reason: 'missing-canvas-context',
        rawValue,
      }
    }

    if (!Array.isArray(rawValue.elements)) {
      return {
        status: 'invalid',
        reason: 'invalid-scene-elements',
        rawValue,
      }
    }

    if (
      rawValue.elements.length < 1 ||
      rawValue.elements.length > sceneGraphLimits.maxElements
    ) {
      return {
        status: 'invalid',
        reason: 'invalid-scene-element-count',
        rawValue,
      }
    }

    const sceneSpace = getSceneSpace(options.canvas)
    const elements = rawValue.elements.map((element) =>
      normalizeSceneElement(element, sceneSpace),
    )

    if (elements.some((element) => element === null)) {
      return {
        status: 'invalid',
        reason: 'invalid-scene-element',
        rawValue,
      }
    }

    return {
      status: 'planned',
      source: 'ai',
      command: {
        action: 'scene',
        title: normalizeSafeLabel(rawValue.title, 48),
        sourceText,
        elements: elements as SceneElement[],
      },
    }
  }

  if (rawValue.action === 'resizeCanvas') {
    const anchor = normalizeCanvasResizeAnchor(rawValue.anchor)

    if (rawValue.anchor !== undefined && !anchor) {
      return {
        status: 'invalid',
        reason: 'invalid-resize-canvas-anchor',
        rawValue,
      }
    }

    if (rawValue.mode === 'absolute') {
      if (typeof rawValue.width !== 'number' || typeof rawValue.height !== 'number') {
        return {
          status: 'invalid',
          reason: 'invalid-resize-canvas-size',
          rawValue,
        }
      }

      return {
        status: 'planned',
        source: 'ai',
        command: {
          action: 'resizeCanvas',
          mode: 'absolute',
          width: rawValue.width,
          height: rawValue.height,
          anchor,
          sourceText,
        },
      }
    }

    if (
      rawValue.mode !== 'relative' ||
      !isCanvasResizeDirection(rawValue.direction)
    ) {
      return {
        status: 'invalid',
        reason: 'invalid-resize-canvas-command',
        rawValue,
      }
    }

    return {
      status: 'planned',
      source: 'ai',
      command: {
        action: 'resizeCanvas',
        mode: 'relative',
        direction: rawValue.direction,
        anchor,
        amount: typeof rawValue.amount === 'number' ? rawValue.amount : undefined,
        sourceText,
      },
    }
  }

  if (rawValue.action === 'create') {
    if (!allowedShapes.has(rawValue.shape as ShapeKind)) {
      return {
        status: 'invalid',
        reason: 'invalid-create-shape',
        rawValue,
      }
    }

    if (rawValue.color !== undefined && !allowedColors.has(rawValue.color as CommandColor)) {
      return {
        status: 'invalid',
        reason: 'invalid-create-color',
        rawValue,
      }
    }

    if (
      rawValue.position !== undefined &&
      !allowedPositions.has(rawValue.position as CommandPosition)
    ) {
      return {
        status: 'invalid',
        reason: 'invalid-create-position',
        rawValue,
      }
    }

    const size = rawValue.size ?? 'medium'

    if (!allowedSizes.has(size as CommandSize)) {
      return {
        status: 'invalid',
        reason: 'invalid-create-size',
        rawValue,
      }
    }

    return {
      status: 'planned',
      source: 'ai',
      command: {
        action: 'create',
        shape: rawValue.shape as ShapeKind,
        color: rawValue.color as CommandColor | undefined,
        position: rawValue.position as CommandPosition | undefined,
        size: size as CommandSize,
        text: typeof rawValue.text === 'string' ? rawValue.text : undefined,
        sourceText,
      },
    }
  }

  if (rawValue.action === 'move') {
    const target = normalizeTarget(rawValue.target)

    if (!target) {
      return {
        status: 'invalid',
        reason: 'invalid-move-target',
        rawValue,
      }
    }

    const targetError = validateSingleTarget(target, rawValue, options)

    if (targetError) {
      return targetError
    }

    if (!allowedMoveModes.has(rawValue.mode as string)) {
      return {
        status: 'invalid',
        reason: 'invalid-move-mode',
        rawValue,
      }
    }

    if (rawValue.mode === 'absolute') {
      if (!allowedPositions.has(rawValue.position as CommandPosition)) {
        return {
          status: 'invalid',
          reason: 'invalid-move-position',
          rawValue,
        }
      }

      return {
        status: 'planned',
        source: 'ai',
        command: {
          action: 'move',
          target,
          mode: 'absolute',
          position: rawValue.position as CommandPosition,
          sourceText,
        },
      }
    }

    if (!allowedMoveDirections.has(rawValue.direction as string)) {
      return {
        status: 'invalid',
        reason: 'invalid-move-direction',
        rawValue,
      }
    }

    return {
      status: 'planned',
      source: 'ai',
      command: {
        action: 'move',
        target,
        mode: 'relative',
        direction: rawValue.direction as 'left' | 'right' | 'up' | 'down',
        distance: typeof rawValue.distance === 'number' ? rawValue.distance : 48,
        sourceText,
      },
    }
  }

  if (rawValue.action === 'recolor') {
    const target = normalizeTarget(rawValue.target)

    if (!target || !allowedColors.has(rawValue.color as CommandColor)) {
      return {
        status: 'invalid',
        reason: 'invalid-recolor-command',
        rawValue,
      }
    }

    const targetError = validateSingleTarget(target, rawValue, options)

    if (targetError) {
      return targetError
    }

    return {
      status: 'planned',
      source: 'ai',
      command: {
        action: 'recolor',
        target,
        color: rawValue.color as CommandColor,
        sourceText,
      },
    }
  }

  if (rawValue.action === 'resize') {
    const target = normalizeTarget(rawValue.target)

    if (
      !target ||
      !allowedResizeDirections.has(rawValue.direction as string)
    ) {
      return {
        status: 'invalid',
        reason: 'invalid-resize-command',
        rawValue,
      }
    }

    const targetError = validateSingleTarget(target, rawValue, options)

    if (targetError) {
      return targetError
    }

    return {
      status: 'planned',
      source: 'ai',
      command: {
        action: 'resize',
        target,
        direction: rawValue.direction as 'larger' | 'smaller',
        sourceText,
      },
    }
  }

  if (rawValue.action === 'delete') {
    const target = normalizeTarget(rawValue.target)

    if (!target) {
      return {
        status: 'invalid',
        reason: 'invalid-delete-target',
        rawValue,
      }
    }

    const targetError = validateSingleTarget(target, rawValue, options)

    if (targetError) {
      return targetError
    }

    return {
      status: 'planned',
      source: 'ai',
      command: {
        action: 'delete',
        target,
        sourceText,
      },
    }
  }

  return {
    status: 'invalid',
    reason: 'unknown-command-shape',
    rawValue,
  }
}
