import type { ShapeKind } from '../canvas/types'
import type {
  CanvasResizeAnchor,
  CanvasResizeDirection,
  CommandColor,
  CommandPosition,
  CommandSize,
  CommandTarget,
  ParsedCommand,
  SceneBBox,
  SceneElement,
  SceneObjectAnchor,
  SceneRelation,
} from '../commands/types'
import { matchesCommandColor } from '../canvas/colorStyles'
import { getSceneSpace, sceneGraphLimits } from '../canvas/sceneGraph'
import { matchesTargetPosition } from '../canvas/targetMatching'
import type {
  CommandCorrectionSummary,
  CommandPlannerInput,
  CommandPlannerResult,
} from './types'

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
  'addSceneObject',
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
const allowedTargetModes = new Set([
  'selected',
  'last',
  'shape',
  'position',
  'any',
  'semantic',
])
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
const allowedSceneRelations = new Set<SceneRelation>([
  'left-of',
  'right-of',
  'above',
  'below',
  'near',
  'inside',
  'around',
])
const allowedCorrectionConfidence = new Set(['high', 'medium', 'low'])
type ValidatorOptions = {
  canvas?: CommandPlannerInput['canvas']
  sourceText?: string
  localCommand?: ParsedCommand
}

const explicitPrimitiveShapePattern =
  /圆形|圆圈|圆|矩形|长方形|正方形|方块|三角形|三角|线条|直线|文本|文字|文本框/
const createIntentPattern = /画|绘制|创建|添加|生成|新增|加|放|插入/
const incrementalAdditionPattern =
  /再|再来|添加|新增|加一|加个|加一个|放一|放个|放一个|插入|右边|左边|旁边|附近|上面|下面|周围/
const wholeSceneResetPattern = /重新|重画|整个|完整|从头|新场景|全新场景/

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

function normalizeIntentText(text: string) {
  return text.replace(/\s+/g, '').replace(/[，。！？、,.!?；;：:"“”'‘’（）()]/g, '')
}

function requestsSemanticObject(sourceText: string, localCommand?: ParsedCommand) {
  const text = normalizeIntentText(sourceText)
  const localParserEscalatedSemanticObject =
    localCommand?.action === 'unknown' &&
    localCommand.reason === 'planner-required-scene-or-shape'

  return (
    createIntentPattern.test(text) &&
    !explicitPrimitiveShapePattern.test(text) &&
    (localParserEscalatedSemanticObject || text.length >= 4)
  )
}

function requiresIncrementalSceneObject(
  sourceText: string,
  options: ValidatorOptions,
) {
  const text = normalizeIntentText(sourceText)
  const hasExistingCanvasObjects = (options.canvas?.objects.length ?? 0) > 0

  return (
    hasExistingCanvasObjects &&
    requestsSemanticObject(sourceText, options.localCommand) &&
    incrementalAdditionPattern.test(text) &&
    !wholeSceneResetPattern.test(text)
  )
}

function normalizeCorrectionSummary(value: unknown): CommandCorrectionSummary | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const confidence =
    typeof value.confidence === 'string' && allowedCorrectionConfidence.has(value.confidence)
      ? (value.confidence as CommandCorrectionSummary['confidence'])
      : undefined
  const correction: CommandCorrectionSummary = {
    correctedText: normalizeSafeLabel(value.correctedText, 120),
    interpretedIntent: normalizeSafeLabel(value.interpretedIntent, 160),
    explanation: normalizeSafeLabel(value.explanation, 180),
    confidence,
    shouldConfirm: typeof value.shouldConfirm === 'boolean' ? value.shouldConfirm : undefined,
  }

  return Object.values(correction).some((item) => item !== undefined)
    ? correction
    : undefined
}

function createPlannedResult(
  command: Extract<CommandPlannerResult, { status: 'planned' }>['command'],
  correction: CommandCorrectionSummary | undefined,
): CommandPlannerResult {
  return {
    status: 'planned',
    source: 'ai',
    command,
    correction,
  }
}

function normalizeSceneBBox(value: unknown, shape: ShapeKind): SceneBBox | null {
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

  const hasValidLineSize =
    shape === 'line' &&
    value.width >= 0 &&
    value.height >= 0 &&
    value.width + value.height >= sceneGraphLimits.minSize
  const hasValidShapeSize =
    shape !== 'line' &&
    value.width >= sceneGraphLimits.minSize &&
    value.height >= sceneGraphLimits.minSize

  if (!hasValidLineSize && !hasValidShapeSize) {
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

  const shape = value.shape as ShapeKind
  const bbox = normalizeSceneBBox(value.bbox, shape)

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
    shape,
    color: value.color as CommandColor,
    bbox,
    zIndex: value.zIndex,
    text:
      typeof value.text === 'string'
        ? value.text.trim().slice(0, sceneGraphLimits.maxTextLength)
        : undefined,
  }
}

function normalizeSceneObjectAnchor(value: unknown): SceneObjectAnchor | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const relation =
    typeof value.relation === 'string' &&
    allowedSceneRelations.has(value.relation as SceneRelation)
      ? (value.relation as SceneRelation)
      : undefined
  const anchor: SceneObjectAnchor = {
    groupId: normalizeSafeLabel(value.groupId, 48),
    groupLabel: normalizeSafeLabel(value.groupLabel),
    partLabel: normalizeSafeLabel(value.partLabel),
    relation,
  }

  return Object.values(anchor).some((item) => item !== undefined)
    ? anchor
    : undefined
}

function normalizeComparableLabel(value: unknown) {
  return typeof value === 'string'
    ? value
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[，。！？、,.!?；;：:"“”'‘’（）()[\]{}]/g, '')
        .trim()
    : ''
}

function getSemanticGroupBoundsInSceneSpace(
  group: NonNullable<CommandPlannerInput['canvas']['semanticGroups']>[number],
  canvas: CommandPlannerInput['canvas'],
  sceneSpace: ReturnType<typeof getSceneSpace>,
): SceneBBox {
  return {
    x: (group.bounds.x / canvas.width) * sceneSpace.width,
    y: (group.bounds.y / canvas.height) * sceneSpace.height,
    width: (group.bounds.width / canvas.width) * sceneSpace.width,
    height: (group.bounds.height / canvas.height) * sceneSpace.height,
  }
}

function getBBoxArea(bbox: SceneBBox) {
  return Math.max(0, bbox.width) * Math.max(0, bbox.height)
}

function getIntersectionArea(a: SceneBBox, b: SceneBBox) {
  const minX = Math.max(a.x, b.x)
  const minY = Math.max(a.y, b.y)
  const maxX = Math.min(a.x + a.width, b.x + b.width)
  const maxY = Math.min(a.y + a.height, b.y + b.height)

  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY)
}

function getBBoxOverlapRatio(a: SceneBBox, b: SceneBBox) {
  const smallerArea = Math.min(getBBoxArea(a), getBBoxArea(b))

  return smallerArea > 0 ? getIntersectionArea(a, b) / smallerArea : 0
}

function getSemanticGroupLabels(
  group: NonNullable<CommandPlannerInput['canvas']['semanticGroups']>[number],
) {
  return [
    group.groupLabel,
    group.displayLabel,
    ...(group.referenceLabels ?? []),
  ].map(normalizeComparableLabel)
}

function isExistingSceneElement(
  element: SceneElement,
  canvas: CommandPlannerInput['canvas'],
  sceneSpace: ReturnType<typeof getSceneSpace>,
) {
  const semanticGroups = canvas.semanticGroups ?? []

  if (semanticGroups.length === 0) {
    return false
  }

  if (
    element.groupId &&
    semanticGroups.some((group) => group.groupId === element.groupId)
  ) {
    return true
  }

  const elementGroupLabel = normalizeComparableLabel(element.groupLabel)

  if (!elementGroupLabel) {
    return false
  }

  return semanticGroups.some((group) => {
    if (!getSemanticGroupLabels(group).includes(elementGroupLabel)) {
      return false
    }

    return (
      getBBoxOverlapRatio(
        element.bbox,
        getSemanticGroupBoundsInSceneSpace(group, canvas, sceneSpace),
      ) >= 0.55
    )
  })
}

function selectIncrementalSceneElements(
  elements: SceneElement[],
  canvas: CommandPlannerInput['canvas'],
  sceneSpace: ReturnType<typeof getSceneSpace>,
) {
  const newElements = elements.filter(
    (element) => !isExistingSceneElement(element, canvas, sceneSpace),
  )

  return newElements.length > 0 ? newElements : []
}

function inferSceneObjectLabel(
  elements: SceneElement[],
  rawValue: Record<string, unknown>,
) {
  const explicitLabel = normalizeSafeLabel(rawValue.objectLabel)

  if (explicitLabel) {
    return explicitLabel
  }

  const labelCounts = new Map<string, number>()

  for (const element of elements) {
    if (!element.groupLabel) {
      continue
    }

    labelCounts.set(element.groupLabel, (labelCounts.get(element.groupLabel) ?? 0) + 1)
  }

  return (
    Array.from(labelCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    normalizeSafeLabel(rawValue.title)
  )
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

  const normalizedTarget: CommandTarget = {
    mode: value.mode as CommandTarget['mode'],
    id: typeof value.id === 'string' ? value.id : undefined,
    shape: value.shape as ShapeKind | undefined,
    position: value.position as CommandPosition | undefined,
    color: value.color as CommandColor | undefined,
    groupId: normalizeSafeLabel(value.groupId, 48),
    groupLabel: normalizeSafeLabel(value.groupLabel),
    partLabel: normalizeSafeLabel(value.partLabel),
  }

  if (
    normalizedTarget.mode === 'semantic' &&
    !normalizedTarget.id &&
    !normalizedTarget.groupId &&
    !normalizedTarget.groupLabel &&
    !normalizedTarget.partLabel
  ) {
    return null
  }

  return normalizedTarget
}

function normalizeReferenceLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?（）()【】[\]{}"'“”‘’]/g, '')
    .trim()
}

function normalizeSemanticTargetReference(
  target: CommandTarget,
  canvas?: CommandPlannerInput['canvas'],
) {
  if (
    !canvas ||
    target.mode !== 'semantic' ||
    target.groupId ||
    !target.groupLabel
  ) {
    return target
  }

  const normalizedReference = normalizeReferenceLabel(target.groupLabel)
  const matchingGroups = (canvas.semanticGroups ?? []).filter((group) =>
    group.referenceLabels.some(
      (referenceLabel) =>
        normalizeReferenceLabel(referenceLabel) === normalizedReference,
    ),
  )
  const selectedMatch = matchingGroups.find(
    (group) => group.groupId && group.groupId === canvas.selectedGroupId,
  )
  const matchedGroup =
    selectedMatch ?? (matchingGroups.length === 1 ? matchingGroups[0] : null)

  if (!matchedGroup?.groupId) {
    return target
  }

  return {
    ...target,
    groupId: matchedGroup.groupId,
    groupLabel: matchedGroup.groupLabel,
  }
}

function getSemanticGroupKey(
  object: CommandPlannerInput['canvas']['objects'][number],
) {
  return object.groupId ?? object.groupLabel ?? object.id
}

function matchesTargetObject(
  object: CommandPlannerInput['canvas']['objects'][number],
  target: CommandTarget,
  canvas: CommandPlannerInput['canvas'],
) {
  if (target.id && object.id !== target.id) {
    return false
  }

  if (target.shape && object.type !== target.shape) {
    return false
  }

  if (target.color && !matchesCommandColor(object.fill, target.color)) {
    return false
  }

  if (target.position && !matchesTargetPosition(object, canvas, target.position)) {
    return false
  }

  if (target.groupId && object.groupId !== target.groupId) {
    return false
  }

  if (target.groupLabel && object.groupLabel !== target.groupLabel) {
    return false
  }

  if (target.partLabel && object.partLabel !== target.partLabel) {
    return false
  }

  return true
}

function getTargetMatchSummary(
  target: CommandTarget,
  canvas: CommandPlannerInput['canvas'],
) {
  if (target.mode === 'selected') {
    const selectedObject = canvas.objects.find((object) => object.id === canvas.selectedId)
    const matchCount =
      selectedObject && matchesTargetObject(selectedObject, target, canvas) ? 1 : 0

    return {
      matchCount,
      semanticGroupCount: matchCount,
    }
  }

  if (target.mode === 'last') {
    const matchCount = canvas.objects.length > 0 ? 1 : 0

    return {
      matchCount,
      semanticGroupCount: matchCount,
    }
  }

  const matches = canvas.objects.filter((object) =>
    matchesTargetObject(object, target, canvas),
  )

  if (target.mode === 'semantic') {
    if (!target.groupId && canvas.selectedGroupId) {
      const selectedGroupMatches = matches.filter(
        (object) => object.groupId === canvas.selectedGroupId,
      )

      if (selectedGroupMatches.length > 0) {
        return {
          matchCount: selectedGroupMatches.length,
          semanticGroupCount: 1,
        }
      }
    }

    return {
      matchCount: matches.length,
      semanticGroupCount: new Set(matches.map(getSemanticGroupKey)).size,
    }
  }

  if (target.mode === 'shape' || target.mode === 'position' || target.mode === 'any') {
    return {
      matchCount: matches.length,
      semanticGroupCount: matches.length,
    }
  }

  return {
    matchCount: 0,
    semanticGroupCount: 0,
  }
}

function validateTargetSelection(
  target: CommandTarget,
  rawValue: unknown,
  options: ValidatorOptions,
  config: { allowGroup: boolean },
) {
  const normalizedTarget = normalizeSemanticTargetReference(target, options.canvas)

  if (!options.canvas) {
    return {
      status: 'invalid',
      reason: 'missing-canvas-context',
      rawValue,
    } satisfies CommandPlannerResult
  }

  const { matchCount, semanticGroupCount } = getTargetMatchSummary(
    normalizedTarget,
    options.canvas,
  )

  if (matchCount === 0) {
    return {
      status: 'invalid',
      reason: 'target-not-found',
      rawValue,
    } satisfies CommandPlannerResult
  }

  if (normalizedTarget.mode === 'semantic' && semanticGroupCount !== 1) {
    return null
  }

  if (normalizedTarget.mode === 'semantic' && matchCount > 1 && !config.allowGroup) {
    return {
      status: 'invalid',
      reason: 'ambiguous-target',
      rawValue,
    } satisfies CommandPlannerResult
  }

  if (normalizedTarget.mode !== 'semantic' && matchCount > 1) {
    return {
      status: 'invalid',
      reason: 'ambiguous-target',
      rawValue,
    } satisfies CommandPlannerResult
  }

  return null
}

function normalizeEditableTarget(
  target: CommandTarget,
  options: ValidatorOptions,
) {
  return normalizeSemanticTargetReference(target, options.canvas)
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
  const effectiveSourceText = options.sourceText ?? sourceText
  const correction = normalizeCorrectionSummary(rawValue.correction)
  const needsIncrementalSceneObject = requiresIncrementalSceneObject(
    effectiveSourceText,
    options,
  )

  if (rawValue.action === 'unknown') {
    return {
      status: 'invalid',
      reason:
        typeof rawValue.reason === 'string' ? rawValue.reason : 'unsupported-action',
      rawValue,
    }
  }

  if (
    rawValue.action !== 'addSceneObject' &&
    rawValue.action !== 'scene' &&
    needsIncrementalSceneObject
  ) {
    return {
      status: 'invalid',
      reason: 'incremental-addition-requires-add-scene-object',
      rawValue,
    }
  }

  if (
    rawValue.action === 'create' &&
    needsIncrementalSceneObject
  ) {
    return {
      status: 'invalid',
      reason: 'semantic-object-cannot-be-primitive-create',
      rawValue,
    }
  }

  if (rawValue.action === 'undo' || rawValue.action === 'redo' || rawValue.action === 'clear') {
    return createPlannedResult(
      {
        action: rawValue.action,
        sourceText,
      },
      correction,
    )
  }

  if (rawValue.action === 'scene' || rawValue.action === 'addSceneObject') {
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

    const normalizedElements = elements as SceneElement[]

    if (rawValue.action === 'addSceneObject') {
      return createPlannedResult(
        {
          action: 'addSceneObject',
          title: normalizeSafeLabel(rawValue.title, 48),
          objectLabel: normalizeSafeLabel(rawValue.objectLabel),
          anchor: normalizeSceneObjectAnchor(rawValue.anchor),
          sourceText,
          elements: normalizedElements,
        },
        correction,
      )
    }

    if (needsIncrementalSceneObject) {
      const incrementalElements = selectIncrementalSceneElements(
        normalizedElements,
        options.canvas,
        sceneSpace,
      )

      if (incrementalElements.length === 0) {
        return {
          status: 'invalid',
          reason: 'incremental-scene-has-no-new-elements',
          rawValue,
        }
      }

      return createPlannedResult(
        {
          action: 'addSceneObject',
          title: normalizeSafeLabel(rawValue.title, 48),
          objectLabel: inferSceneObjectLabel(incrementalElements, rawValue),
          anchor: normalizeSceneObjectAnchor(rawValue.anchor),
          sourceText,
          elements: incrementalElements,
        },
        correction,
      )
    }

    return createPlannedResult(
      {
        action: 'scene',
        title: normalizeSafeLabel(rawValue.title, 48),
        sourceText,
        elements: normalizedElements,
      },
      correction,
    )
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

      return createPlannedResult(
        {
          action: 'resizeCanvas',
          mode: 'absolute',
          width: rawValue.width,
          height: rawValue.height,
          anchor,
          sourceText,
        },
        correction,
      )
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

    return createPlannedResult(
      {
        action: 'resizeCanvas',
        mode: 'relative',
        direction: rawValue.direction,
        anchor,
        amount: typeof rawValue.amount === 'number' ? rawValue.amount : undefined,
        sourceText,
      },
      correction,
    )
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

    return createPlannedResult(
      {
        action: 'create',
        shape: rawValue.shape as ShapeKind,
        color: rawValue.color as CommandColor | undefined,
        position: rawValue.position as CommandPosition | undefined,
        size: size as CommandSize,
        text: typeof rawValue.text === 'string' ? rawValue.text : undefined,
        sourceText,
      },
      correction,
    )
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

    const targetError = validateTargetSelection(target, rawValue, options, {
      allowGroup: target.mode === 'semantic' && !target.id,
    })

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

      return createPlannedResult(
        {
          action: 'move',
          target: normalizeEditableTarget(target, options),
          mode: 'absolute',
          position: rawValue.position as CommandPosition,
          sourceText,
        },
        correction,
      )
    }

    if (!allowedMoveDirections.has(rawValue.direction as string)) {
      return {
        status: 'invalid',
        reason: 'invalid-move-direction',
        rawValue,
      }
    }

    return createPlannedResult(
      {
        action: 'move',
        target: normalizeEditableTarget(target, options),
        mode: 'relative',
        direction: rawValue.direction as 'left' | 'right' | 'up' | 'down',
        distance: typeof rawValue.distance === 'number' ? rawValue.distance : 48,
        sourceText,
      },
      correction,
    )
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

    const targetError = validateTargetSelection(target, rawValue, options, {
      allowGroup: target.mode === 'semantic' && !target.id,
    })

    if (targetError) {
      return targetError
    }

    return createPlannedResult(
      {
        action: 'recolor',
        target: normalizeEditableTarget(target, options),
        color: rawValue.color as CommandColor,
        sourceText,
      },
      correction,
    )
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

    const targetError = validateTargetSelection(target, rawValue, options, {
      allowGroup: target.mode === 'semantic' && !target.id,
    })

    if (targetError) {
      return targetError
    }

    return createPlannedResult(
      {
        action: 'resize',
        target: normalizeEditableTarget(target, options),
        direction: rawValue.direction as 'larger' | 'smaller',
        sourceText,
      },
      correction,
    )
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

    const targetError = validateTargetSelection(target, rawValue, options, {
      allowGroup: target.mode === 'semantic' && !target.id,
    })

    if (targetError) {
      return targetError
    }

    return createPlannedResult(
      {
        action: 'delete',
        target: normalizeEditableTarget(target, options),
        sourceText,
      },
      correction,
    )
  }

  return {
    status: 'invalid',
    reason: 'unknown-command-shape',
    rawValue,
  }
}
