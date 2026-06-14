import type { ShapeKind } from '../canvas/types'
import type {
  BatchStepCommand,
  AlignAxis,
  ArrangeLayout,
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
  SpatialMoveAlignment,
  SpatialMoveRelation,
} from '../commands/types'
import { colorStyles, matchesCommandColor } from '../canvas/colorStyles'
import { getSceneSpace, sceneGraphLimits } from '../canvas/sceneGraph'
import { createSemanticGroupSummaries } from '../canvas/semanticGroups'
import { matchesTargetPosition } from '../canvas/targetMatching'
import type {
  CommandCorrectionSummary,
  CommandPlannerInput,
  CommandPlannerResult,
} from './types'
import {
  detectRelativeAdditionIntent,
  findAnchorReferenceGroups,
} from '../commands/relativeAnchorIntent'
import { detectSpatialMoveIntent } from '../commands/spatialMoveIntent'

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
  'align',
  'arrange',
  'batch',
])
const allowedBatchStepActions = new Set([
  'create',
  'move',
  'recolor',
  'resize',
  'delete',
  'resizeCanvas',
  'align',
  'arrange',
])
const maxBatchCommandCount = 6
const maxTargetCount = 24
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
const allowedMoveModes = new Set(['absolute', 'relative', 'spatial'])
const allowedMoveDirections = new Set(['left', 'right', 'up', 'down'])
const allowedSpatialMoveRelations = new Set<SpatialMoveRelation>([
  'left-of',
  'right-of',
  'above',
  'below',
])
const allowedSpatialMoveAlignments = new Set<SpatialMoveAlignment>([
  'preserve',
  'center',
  'start',
  'end',
])
const allowedResizeDirections = new Set(['larger', 'smaller'])
const allowedAlignAxes = new Set<AlignAxis>([
  'left',
  'center',
  'right',
  'top',
  'middle',
  'bottom',
])
const allowedArrangeLayouts = new Set<ArrangeLayout>(['row', 'column'])
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
  strictTargets?: boolean
  batchDepth?: number
}

const validationShapeSizes: Record<ShapeKind, { width: number; height: number }> = {
  circle: { width: 96, height: 96 },
  rect: { width: 128, height: 88 },
  triangle: { width: 128, height: 104 },
  line: { width: 160, height: 0 },
  text: { width: 180, height: 42 },
}

const validationPositionAnchors: Record<CommandPosition, { x: number; y: number }> = {
  'top-left': { x: 0.2, y: 0.22 },
  top: { x: 0.5, y: 0.2 },
  'top-right': { x: 0.8, y: 0.22 },
  left: { x: 0.2, y: 0.52 },
  center: { x: 0.5, y: 0.52 },
  right: { x: 0.8, y: 0.52 },
  'bottom-left': { x: 0.2, y: 0.78 },
  bottom: { x: 0.5, y: 0.8 },
  'bottom-right': { x: 0.8, y: 0.78 },
}

const explicitPrimitiveShapePattern =
  /圆形|圆圈|圆|矩形|长方形|正方形|方块|三角形|三角|线条|直线|文本|文字|文本框/
const createIntentPattern = /画|绘制|创建|添加|生成|新增|加|放|插入/
const incrementalAdditionPattern =
  /再|再来|添加|新增|插入|创建|生成|加上|加一|加个|加一个|加只|加棵|加朵|加辆|加座|加条|加片|加颗|加块|加束|加艘|加台|放一|放个|放一个|放只|放棵|放朵|放辆|放座|放条|放片|放颗|放块|放束|放艘|放台/
const wholeSceneResetPattern = /重新|重画|整个|完整|从头|新场景|全新场景/
const multiStepConnectorPattern =
  /然后|接着|随后|并且|同时|顺便|再把|再将|再让|[,，;；]|then|and then/i
const multiStepSplitPattern =
  /然后|接着|随后|并且|同时|顺便|再把|再将|再让|[,，;；]|then|and then/i
const batchStepIntentPatterns = [
  /(画|绘制|创建|添加|生成|新增|插入|加|放).{0,24}(圆形|圆圈|圆|矩形|长方形|正方形|方块|三角形|三角|线条|直线|文本|文字|文本框)/i,
  /(移动|移到|移动到|挪|挪到|放到|放在|贴着|靠着|往.{0,10}(左|右|上|下).{0,10}(移|移动|挪)|到.{0,10}(左|右|上|下).{0,10}(边|角|方))/i,
  /(放大|缩小|变大|变小|大一点|小一点|缩放|扩大|缩窄)/i,
  /(改成|改为|变成|变为|换成|设成|设置为|染成|涂成).{0,18}(红|红色|橙|橙色|黄|黄色|绿|绿色|蓝|蓝色|紫|紫色|黑|黑色|白|白色|灰|灰色|red|orange|yellow|green|blue|purple|black|white|gray)/i,
  /(删除|删掉|移除|去掉|清除)/i,
  /(画布|画板).{0,18}(调整|设置|设为|变大|变小|放大|缩小|变宽|变窄|变高|变矮|加宽|加高|空间)/i,
]

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

function hasBatchStepIntent(text: string) {
  return batchStepIntentPatterns.some((pattern) => pattern.test(text))
}

function requiresBatchCommand(sourceText: string) {
  if (!multiStepConnectorPattern.test(sourceText)) {
    return false
  }

  const clauses = sourceText
    .split(multiStepSplitPattern)
    .map((clause) => clause.trim())
    .filter(Boolean)

  return clauses.filter(hasBatchStepIntent).length >= 2
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

function normalizeSpatialMoveGap(value: unknown) {
  if (value === undefined) {
    return undefined
  }

  if (!isFiniteNumber(value)) {
    return null
  }

  return Math.max(0, Math.min(Math.round(value), 240))
}

function normalizeArrangeSpacing(value: unknown) {
  if (value === undefined) {
    return undefined
  }

  if (!isFiniteNumber(value)) {
    return null
  }

  return Math.max(0, Math.min(Math.round(value), 240))
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

  const scope =
    value.scope === undefined
      ? undefined
      : value.scope === 'one' || value.scope === 'all'
        ? value.scope
        : null
  const count =
    value.count === undefined
      ? undefined
      : isFiniteNumber(value.count)
        ? Math.round(value.count)
        : null

  if (scope === null || count === null || (count !== undefined && (count < 1 || count > maxTargetCount))) {
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
    scope,
    count,
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
    target.scope === 'all' ||
    target.count !== undefined ||
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

function targetRequestsMultiple(target: CommandTarget) {
  return target.scope === 'all' || target.count !== undefined
}

function hasSafeMultiTargetFilter(target: CommandTarget) {
  if (target.mode === 'selected' || target.mode === 'last') {
    return true
  }

  return Boolean(
    target.id ||
      target.shape ||
      target.position ||
      target.color ||
      target.groupId ||
      target.groupLabel ||
      target.partLabel,
  )
}

function getTargetUnitKey(
  object: CommandPlannerInput['canvas']['objects'][number],
  target: CommandTarget,
) {
  if (target.mode !== 'semantic') {
    return object.id
  }

  const groupKey = getSemanticGroupKey(object)
  const partKey = target.partLabel ? object.partLabel ?? object.id : ''

  return `${groupKey}:${partKey}`
}

function getTargetUnitCount(
  objects: CommandPlannerInput['canvas']['objects'],
  target: CommandTarget,
) {
  return new Set(objects.map((object) => getTargetUnitKey(object, target))).size
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

function shouldPreferPrimitiveObjectMatches(target: CommandTarget) {
  return (
    target.mode === 'shape' &&
    Boolean(target.shape) &&
    !target.id &&
    !target.groupId &&
    !target.groupLabel &&
    !target.partLabel
  )
}

function getTargetObjectMatches(
  canvas: CommandPlannerInput['canvas'],
  target: CommandTarget,
) {
  const matches = canvas.objects.filter((object) =>
    matchesTargetObject(object, target, canvas),
  )

  if (!shouldPreferPrimitiveObjectMatches(target)) {
    return matches
  }

  const primitiveMatches = matches.filter(
    (object) => !object.groupId && !object.groupLabel && !object.partLabel,
  )

  return primitiveMatches.length > 0 ? primitiveMatches : matches
}

function getTargetMatchSummary(
  target: CommandTarget,
  canvas: CommandPlannerInput['canvas'],
) {
  if (target.mode === 'selected') {
    const selectedObjects =
      canvas.selectedGroupId && canExpandValidationSemanticReference(target)
        ? canvas.objects.filter(
            (object) =>
              object.groupId === canvas.selectedGroupId &&
              matchesTargetObject(object, target, canvas),
          )
        : canvas.objects.filter(
            (object) =>
              object.id === canvas.selectedId &&
              matchesTargetObject(object, target, canvas),
          )
    const matchCount = selectedObjects.length

    return {
      matchCount,
      semanticGroupCount: canvas.selectedGroupId && matchCount > 0 ? 1 : matchCount,
      unitCount: getTargetUnitCount(selectedObjects, target),
    }
  }

  if (target.mode === 'last') {
    const matchCount = canvas.objects.length > 0 ? 1 : 0

    return {
      matchCount,
      semanticGroupCount: matchCount,
      unitCount: matchCount,
    }
  }

  const matches = getTargetObjectMatches(canvas, target)

  if (target.mode === 'semantic') {
    if (!targetRequestsMultiple(target) && !target.groupId && canvas.selectedGroupId) {
      const selectedGroupMatches = matches.filter(
        (object) => object.groupId === canvas.selectedGroupId,
      )

      if (selectedGroupMatches.length > 0) {
        return {
          matchCount: selectedGroupMatches.length,
          semanticGroupCount: 1,
          unitCount: 1,
        }
      }
    }

    return {
      matchCount: matches.length,
      semanticGroupCount: new Set(matches.map(getSemanticGroupKey)).size,
      unitCount: getTargetUnitCount(matches, target),
    }
  }

  if (target.mode === 'shape' || target.mode === 'position' || target.mode === 'any') {
    return {
      matchCount: matches.length,
      semanticGroupCount: matches.length,
      unitCount: matches.length,
    }
  }

  return {
    matchCount: 0,
    semanticGroupCount: 0,
    unitCount: 0,
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

  if (targetRequestsMultiple(normalizedTarget) && !hasSafeMultiTargetFilter(normalizedTarget)) {
    return {
      status: 'invalid',
      reason: 'unsafe-bulk-target',
      rawValue,
    } satisfies CommandPlannerResult
  }

  const { matchCount, semanticGroupCount, unitCount } = getTargetMatchSummary(
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

  if (normalizedTarget.count !== undefined && unitCount !== normalizedTarget.count) {
    if (!options.strictTargets) {
      return null
    }

    return {
      status: 'invalid',
      reason: 'target-count-mismatch',
      rawValue,
    } satisfies CommandPlannerResult
  }

  if (targetRequestsMultiple(normalizedTarget)) {
    return null
  }

  if (normalizedTarget.mode === 'semantic' && semanticGroupCount !== 1) {
    if (options.strictTargets) {
      return {
        status: 'invalid',
        reason: 'ambiguous-target',
        rawValue,
      } satisfies CommandPlannerResult
    }

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

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?；;：:"“”'‘’（）()[\]{}]/g, '')
    .trim()
}

function targetMatchesIntentLabel(target: CommandTarget, label: string | undefined) {
  if (!label) {
    return true
  }

  const normalizedLabel = normalizeComparableText(label)

  if (!normalizedLabel) {
    return true
  }

  const targetLabels = [target.groupLabel, target.groupId, target.partLabel]
    .filter((value): value is string => Boolean(value))
    .map(normalizeComparableText)

  return targetLabels.some(
    (targetLabel) =>
      targetLabel === normalizedLabel ||
      targetLabel.includes(normalizedLabel) ||
      normalizedLabel.includes(targetLabel),
  )
}

function shouldPreserveSemanticPartTarget(
  target: CommandTarget,
  sourceText: string,
) {
  if (target.mode !== 'semantic' || !target.groupLabel || !target.partLabel) {
    return true
  }

  const normalizedSource = normalizeComparableText(sourceText)
  const normalizedGroupLabel = normalizeComparableText(target.groupLabel)
  const normalizedPartLabel = normalizeComparableText(target.partLabel)

  if (!normalizedSource || !normalizedGroupLabel || !normalizedPartLabel) {
    return true
  }

  return (
    normalizedSource.includes(normalizedPartLabel) &&
    normalizedPartLabel !== normalizedGroupLabel
  )
}

function normalizeImplicitWholeSemanticTarget(
  target: CommandTarget,
  sourceText: string,
) {
  return shouldPreserveSemanticPartTarget(target, sourceText)
    ? target
    : {
        ...target,
        partLabel: undefined,
      }
}

function normalizeEditableTargetForSource(
  target: CommandTarget,
  options: ValidatorOptions,
  sourceText: string,
) {
  return normalizeEditableTarget(
    normalizeImplicitWholeSemanticTarget(target, sourceText),
    options,
  )
}

function shouldNormalizeMoveToSpatial(
  rawValue: Record<string, unknown>,
  target: CommandTarget,
  intent: ReturnType<typeof detectSpatialMoveIntent>,
) {
  return (
    Boolean(intent) &&
    rawValue.mode !== 'spatial' &&
    targetMatchesIntentLabel(target, intent?.targetLabel)
  )
}

function isBatchStepCommand(command: ParsedCommand): command is BatchStepCommand {
  return command.action !== 'unknown' && allowedBatchStepActions.has(command.action)
}

function getTargetIdsFromRawStep(value: Record<string, unknown>) {
  const targets = [value.target, value.reference]

  return targets.flatMap((target) =>
    isRecord(target) && typeof target.id === 'string' ? [target.id] : [],
  )
}

function recomputeValidationCanvas(
  canvas: CommandPlannerInput['canvas'],
): CommandPlannerInput['canvas'] {
  return {
    ...canvas,
    semanticGroups: createSemanticGroupSummaries(canvas.objects, {
      selectedId: canvas.selectedId,
      selectedGroupId: canvas.selectedGroupId,
    }),
  }
}

function getValidationShapePosition(
  position: CommandPosition | undefined,
  canvas: Pick<CommandPlannerInput['canvas'], 'width' | 'height'>,
  size: { width: number; height: number },
) {
  const anchor = validationPositionAnchors[position ?? 'center']

  return {
    x: Math.round(canvas.width * anchor.x - size.width / 2),
    y: Math.round(canvas.height * anchor.y - size.height / 2),
  }
}

function createValidationObjectFromCommand(
  command: Extract<BatchStepCommand, { action: 'create' }>,
  canvas: CommandPlannerInput['canvas'],
): CommandPlannerInput['canvas']['objects'][number] {
  const size = validationShapeSizes[command.shape]
  const position = getValidationShapePosition(command.position, canvas, size)
  const style = colorStyles[command.color ?? 'blue']
  const index = canvas.objects.length + 1

  return {
    id: `batch-${command.shape}-${index}`,
    type: command.shape,
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    fill: style.fill,
    text: command.shape === 'text' ? command.text : undefined,
  }
}

function canExpandValidationSemanticReference(target: CommandTarget) {
  return (
    !target.id &&
    !target.shape &&
    !target.color &&
    !target.position &&
    !target.partLabel
  )
}

function getValidationObjectsByGroup(
  canvas: CommandPlannerInput['canvas'],
  groupId: string,
  target: CommandTarget,
) {
  return canvas.objects.filter(
    (object) =>
      object.groupId === groupId &&
      matchesTargetObject(object, target, canvas),
  )
}

function selectValidationObjects(
  canvas: CommandPlannerInput['canvas'],
  target: CommandTarget,
) {
  const normalizedTarget = normalizeSemanticTargetReference(target, canvas)

  if (
    normalizedTarget.mode === 'selected' &&
    canvas.selectedGroupId &&
    canExpandValidationSemanticReference(normalizedTarget)
  ) {
    const groupObjects = getValidationObjectsByGroup(
      canvas,
      canvas.selectedGroupId,
      normalizedTarget,
    )

    if (groupObjects.length > 0) {
      return groupObjects
    }
  }

  if (normalizedTarget.mode === 'selected') {
    const selectedObject = canvas.objects.find(
      (object) =>
        object.id === canvas.selectedId &&
        matchesTargetObject(object, normalizedTarget, canvas),
    )

    return selectedObject ? [selectedObject] : []
  }

  if (normalizedTarget.mode === 'last') {
    const latestMatch = [...canvas.objects]
      .reverse()
      .find((object) => matchesTargetObject(object, normalizedTarget, canvas))

    if (
      latestMatch?.groupId &&
      canExpandValidationSemanticReference(normalizedTarget)
    ) {
      return getValidationObjectsByGroup(canvas, latestMatch.groupId, normalizedTarget)
    }

    return latestMatch ? [latestMatch] : []
  }

  const matches = getTargetObjectMatches(canvas, normalizedTarget)

  if (normalizedTarget.mode !== 'semantic') {
    return targetRequestsMultiple(normalizedTarget) || matches.length === 1
      ? matches
      : []
  }

  if (!targetRequestsMultiple(normalizedTarget) && !normalizedTarget.groupId && canvas.selectedGroupId) {
    const selectedGroupMatches = matches.filter(
      (object) => object.groupId === canvas.selectedGroupId,
    )

    if (selectedGroupMatches.length > 0) {
      return selectedGroupMatches
    }
  }

  const semanticKeys = new Set(matches.map(getSemanticGroupKey))

  return targetRequestsMultiple(normalizedTarget) || semanticKeys.size === 1
    ? matches
    : []
}

function getValidationBounds(objects: CommandPlannerInput['canvas']['objects']) {
  const minX = Math.min(...objects.map((object) => object.x))
  const minY = Math.min(...objects.map((object) => object.y))
  const maxX = Math.max(...objects.map((object) => object.x + object.width))
  const maxY = Math.max(...objects.map((object) => object.y + object.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function getValidationSharedGroupId(
  objects: CommandPlannerInput['canvas']['objects'],
) {
  const groupIds = new Set(
    objects.flatMap((object) => (object.groupId ? [object.groupId] : [])),
  )

  return groupIds.size === 1 ? Array.from(groupIds)[0] : undefined
}

function updateValidationObjects(
  canvas: CommandPlannerInput['canvas'],
  targetObjects: CommandPlannerInput['canvas']['objects'],
  updateObject: (
    object: CommandPlannerInput['canvas']['objects'][number],
  ) => CommandPlannerInput['canvas']['objects'][number],
) {
  if (targetObjects.length === 0) {
    return canvas
  }

  const targetIds = new Set(targetObjects.map((object) => object.id))
  const selectedId = targetObjects.at(-1)?.id
  const selectedGroupId =
    targetObjects.length > 1 ? getValidationSharedGroupId(targetObjects) : undefined

  return recomputeValidationCanvas({
    ...canvas,
    selectedId,
    selectedGroupId,
    objects: canvas.objects.map((object) =>
      targetIds.has(object.id) ? updateObject(object) : object,
    ),
  })
}

function replaceValidationObjects(
  canvas: CommandPlannerInput['canvas'],
  updatedObjects: CommandPlannerInput['canvas']['objects'],
) {
  if (updatedObjects.length === 0) {
    return canvas
  }

  const updatedObjectById = new Map(
    updatedObjects.map((object) => [object.id, object]),
  )
  const selectedId = updatedObjects.at(-1)?.id
  const selectedGroupId =
    updatedObjects.length > 1 ? getValidationSharedGroupId(updatedObjects) : undefined

  return recomputeValidationCanvas({
    ...canvas,
    selectedId,
    selectedGroupId,
    objects: canvas.objects.map((object) => updatedObjectById.get(object.id) ?? object),
  })
}

function groupValidationTargetUnits(
  objects: CommandPlannerInput['canvas']['objects'],
  target: CommandTarget,
) {
  const groups = new Map<string, CommandPlannerInput['canvas']['objects']>()

  for (const object of objects) {
    const key = getTargetUnitKey(object, target)
    const groupObjects = groups.get(key) ?? []

    groupObjects.push(object)
    groups.set(key, groupObjects)
  }

  return Array.from(groups.values())
}

function getValidationSpatialDelta(
  targetBounds: ReturnType<typeof getValidationBounds>,
  referenceBounds: ReturnType<typeof getValidationBounds>,
  command: Extract<BatchStepCommand, { action: 'move'; mode: 'spatial' }>,
) {
  const gap = Math.max(0, Math.min(command.gap ?? 24, 240))
  const align = command.align ?? 'preserve'
  const referenceCenterX = referenceBounds.x + referenceBounds.width / 2
  const referenceCenterY = referenceBounds.y + referenceBounds.height / 2
  let nextX = targetBounds.x
  let nextY = targetBounds.y

  if (command.relation === 'left-of') {
    nextX = referenceBounds.x - targetBounds.width - gap
    nextY =
      align === 'preserve'
        ? targetBounds.y
        : align === 'start'
          ? referenceBounds.y
          : align === 'end'
            ? referenceBounds.y + referenceBounds.height - targetBounds.height
            : referenceCenterY - targetBounds.height / 2
  }

  if (command.relation === 'right-of') {
    nextX = referenceBounds.x + referenceBounds.width + gap
    nextY =
      align === 'preserve'
        ? targetBounds.y
        : align === 'start'
          ? referenceBounds.y
          : align === 'end'
            ? referenceBounds.y + referenceBounds.height - targetBounds.height
            : referenceCenterY - targetBounds.height / 2
  }

  if (command.relation === 'above') {
    nextY = referenceBounds.y - targetBounds.height - gap
    nextX =
      align === 'preserve'
        ? targetBounds.x
        : align === 'start'
          ? referenceBounds.x
          : align === 'end'
            ? referenceBounds.x + referenceBounds.width - targetBounds.width
            : referenceCenterX - targetBounds.width / 2
  }

  if (command.relation === 'below') {
    nextY = referenceBounds.y + referenceBounds.height + gap
    nextX =
      align === 'preserve'
        ? targetBounds.x
        : align === 'start'
          ? referenceBounds.x
          : align === 'end'
            ? referenceBounds.x + referenceBounds.width - targetBounds.width
            : referenceCenterX - targetBounds.width / 2
  }

  return {
    x: Math.round(nextX - targetBounds.x),
    y: Math.round(nextY - targetBounds.y),
  }
}

function applyValidationMoveCommand(
  canvas: CommandPlannerInput['canvas'],
  command: Extract<BatchStepCommand, { action: 'move' }>,
) {
  const targetObjects = selectValidationObjects(canvas, command.target)

  if (targetObjects.length === 0) {
    return canvas
  }

  const bounds = getValidationBounds(targetObjects)
  let delta: { x: number; y: number }

  if (command.mode === 'relative') {
    const distance = command.distance ?? 48
    delta = {
      x: command.direction === 'left' ? -distance : command.direction === 'right' ? distance : 0,
      y: command.direction === 'up' ? -distance : command.direction === 'down' ? distance : 0,
    }
  } else if (command.mode === 'spatial') {
    const referenceObjects = selectValidationObjects(canvas, command.reference)

    if (referenceObjects.length === 0) {
      return canvas
    }

    delta = getValidationSpatialDelta(
      bounds,
      getValidationBounds(referenceObjects),
      command,
    )
  } else {
    const position = getValidationShapePosition(command.position, canvas, bounds)
    delta = {
      x: position.x - bounds.x,
      y: position.y - bounds.y,
    }
  }

  return updateValidationObjects(canvas, targetObjects, (object) => ({
    ...object,
    x: object.x + delta.x,
    y: object.y + delta.y,
  }))
}

function applyValidationAlignCommand(
  canvas: CommandPlannerInput['canvas'],
  command: Extract<BatchStepCommand, { action: 'align' }>,
) {
  const targetObjects = selectValidationObjects(canvas, command.target)

  if (targetObjects.length === 0) {
    return canvas
  }

  const units = groupValidationTargetUnits(targetObjects, command.target)

  if (units.length < 2) {
    return canvas
  }

  const anchorBounds = getValidationBounds(targetObjects)
  const updatedObjects = units.flatMap((unit) => {
    const bounds = getValidationBounds(unit)
    const delta =
      command.axis === 'left'
        ? { x: anchorBounds.x - bounds.x, y: 0 }
        : command.axis === 'right'
          ? { x: anchorBounds.x + anchorBounds.width - bounds.x - bounds.width, y: 0 }
          : command.axis === 'center'
            ? { x: anchorBounds.x + anchorBounds.width / 2 - bounds.x - bounds.width / 2, y: 0 }
            : command.axis === 'top'
              ? { x: 0, y: anchorBounds.y - bounds.y }
              : command.axis === 'bottom'
                ? { x: 0, y: anchorBounds.y + anchorBounds.height - bounds.y - bounds.height }
                : { x: 0, y: anchorBounds.y + anchorBounds.height / 2 - bounds.y - bounds.height / 2 }

    return unit.map((object) => ({
      ...object,
      x: Math.round(object.x + delta.x),
      y: Math.round(object.y + delta.y),
    }))
  })

  return replaceValidationObjects(canvas, updatedObjects)
}

function applyValidationArrangeCommand(
  canvas: CommandPlannerInput['canvas'],
  command: Extract<BatchStepCommand, { action: 'arrange' }>,
) {
  const targetObjects = selectValidationObjects(canvas, command.target)

  if (targetObjects.length === 0) {
    return canvas
  }

  const units = groupValidationTargetUnits(targetObjects, command.target)

  if (units.length < 2) {
    return canvas
  }

  const spacing = Math.max(0, Math.min(Math.round(command.spacing ?? 32), 240))
  const anchorBounds = getValidationBounds(targetObjects)
  const centerX = anchorBounds.x + anchorBounds.width / 2
  const centerY = anchorBounds.y + anchorBounds.height / 2
  const orderedUnits = [...units].sort((left, right) => {
    const leftBounds = getValidationBounds(left)
    const rightBounds = getValidationBounds(right)

    return command.layout === 'row'
      ? leftBounds.x - rightBounds.x || leftBounds.y - rightBounds.y
      : leftBounds.y - rightBounds.y || leftBounds.x - rightBounds.x
  })
  const unitBounds = orderedUnits.map((unit) => getValidationBounds(unit))
  const totalWidth =
    unitBounds.reduce((sum, bounds) => sum + bounds.width, 0) +
    spacing * Math.max(0, unitBounds.length - 1)
  const totalHeight =
    unitBounds.reduce((sum, bounds) => sum + bounds.height, 0) +
    spacing * Math.max(0, unitBounds.length - 1)
  let cursorX = Math.round(centerX - totalWidth / 2)
  let cursorY = Math.round(centerY - totalHeight / 2)

  const updatedObjects = orderedUnits.flatMap((unit, index) => {
    const bounds = unitBounds[index]

    if (command.layout === 'row') {
      const delta = {
        x: cursorX - bounds.x,
        y: Math.round(centerY - bounds.height / 2 - bounds.y),
      }

      cursorX += bounds.width + spacing
      return unit.map((object) => ({
        ...object,
        x: object.x + delta.x,
        y: object.y + delta.y,
      }))
    }

    const delta = {
      x: Math.round(centerX - bounds.width / 2 - bounds.x),
      y: cursorY - bounds.y,
    }

    cursorY += bounds.height + spacing
    return unit.map((object) => ({
      ...object,
      x: object.x + delta.x,
      y: object.y + delta.y,
    }))
  })

  return replaceValidationObjects(canvas, updatedObjects)
}

function applyValidationResizeCanvasCommand(
  canvas: CommandPlannerInput['canvas'],
  command: Extract<BatchStepCommand, { action: 'resizeCanvas' }>,
) {
  const nextSize =
    command.mode === 'absolute'
      ? {
          width: command.width,
          height: command.height,
        }
      : {
          width:
            command.direction === 'wider' || command.direction === 'larger'
              ? canvas.width + (command.amount ?? 120)
              : command.direction === 'narrower' || command.direction === 'smaller'
                ? canvas.width - (command.amount ?? 120)
                : canvas.width,
          height:
            command.direction === 'taller' || command.direction === 'larger'
              ? canvas.height + (command.amount ?? 120)
              : command.direction === 'shorter' || command.direction === 'smaller'
                ? canvas.height - (command.amount ?? 120)
                : canvas.height,
        }
  const width = Math.max(320, Math.min(2400, Math.round(nextSize.width)))
  const height = Math.max(320, Math.min(2400, Math.round(nextSize.height)))
  const widthDelta = width - canvas.width
  const heightDelta = height - canvas.height
  const anchor = command.anchor ?? 'center'
  const offsetX = anchor.includes('left')
    ? widthDelta
    : anchor.includes('right')
      ? 0
      : Math.round(widthDelta / 2)
  const offsetY = anchor.includes('top')
    ? heightDelta
    : anchor.includes('bottom')
      ? 0
      : Math.round(heightDelta / 2)

  return recomputeValidationCanvas({
    ...canvas,
    width,
    height,
    objects: canvas.objects.map((object) => ({
      ...object,
      x: object.x + offsetX,
      y: object.y + offsetY,
    })),
  })
}

function applyValidationBatchStep(
  canvas: CommandPlannerInput['canvas'],
  command: BatchStepCommand,
): CommandPlannerInput['canvas'] {
  if (command.action === 'create') {
    const object = createValidationObjectFromCommand(command, canvas)

    return recomputeValidationCanvas({
      ...canvas,
      selectedId: object.id,
      selectedGroupId: undefined,
      objects: [...canvas.objects, object],
    })
  }

  if (command.action === 'move') {
    return applyValidationMoveCommand(canvas, command)
  }

  if (command.action === 'recolor') {
    const targetObjects = selectValidationObjects(canvas, command.target)
    const style = colorStyles[command.color]

    return updateValidationObjects(canvas, targetObjects, (object) => ({
      ...object,
      fill: style.fill,
    }))
  }

  if (command.action === 'resize') {
    const targetObjects = selectValidationObjects(canvas, command.target)

    if (targetObjects.length === 0) {
      return canvas
    }

    const bounds = getValidationBounds(targetObjects)
    const scale = command.direction === 'larger' ? 1.2 : 0.82
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2

    return updateValidationObjects(canvas, targetObjects, (object) => {
      const objectCenterX = object.x + object.width / 2
      const objectCenterY = object.y + object.height / 2
      const width = Math.max(12, Math.round(object.width * scale))
      const height =
        object.type === 'line'
          ? Math.round(object.height * scale)
          : Math.max(12, Math.round(object.height * scale))

      return {
        ...object,
        width,
        height,
        x: Math.round(centerX + (objectCenterX - centerX) * scale - width / 2),
        y: Math.round(centerY + (objectCenterY - centerY) * scale - height / 2),
      }
    })
  }

  if (command.action === 'align') {
    return applyValidationAlignCommand(canvas, command)
  }

  if (command.action === 'arrange') {
    return applyValidationArrangeCommand(canvas, command)
  }

  if (command.action === 'delete') {
    const targetObjects = selectValidationObjects(canvas, command.target)
    const targetIds = new Set(targetObjects.map((object) => object.id))

    return recomputeValidationCanvas({
      ...canvas,
      selectedId: undefined,
      selectedGroupId: undefined,
      objects: canvas.objects.filter((object) => !targetIds.has(object.id)),
    })
  }

  return applyValidationResizeCanvasCommand(canvas, command)
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
  const relativeAdditionIntent = detectRelativeAdditionIntent(effectiveSourceText)
  const matchingAnchorGroups = relativeAdditionIntent
    ? findAnchorReferenceGroups(
        options.canvas?.semanticGroups,
        relativeAdditionIntent.anchorLabel,
      )
    : []
  const isMissingRelativeAnchor =
    Boolean(relativeAdditionIntent && options.canvas) && matchingAnchorGroups.length === 0
  const spatialMoveIntent = detectSpatialMoveIntent(effectiveSourceText)

  if (rawValue.action === 'unknown') {
    return {
      status: 'invalid',
      reason:
        typeof rawValue.reason === 'string' ? rawValue.reason : 'unsupported-action',
      rawValue,
    }
  }

  if (
    (options.batchDepth ?? 0) === 0 &&
    !needsIncrementalSceneObject &&
    requiresBatchCommand(effectiveSourceText) &&
    rawValue.action !== 'batch'
  ) {
    return {
      status: 'invalid',
      reason: 'multi-step-command-requires-batch',
      rawValue,
    }
  }

  if (rawValue.action === 'batch') {
    if ((options.batchDepth ?? 0) > 0) {
      return {
        status: 'invalid',
        reason: 'nested-batch-command',
        rawValue,
      }
    }

    if (needsIncrementalSceneObject) {
      return {
        status: 'invalid',
        reason: 'incremental-addition-requires-add-scene-object',
        rawValue,
      }
    }

    if (isMissingRelativeAnchor) {
      return {
        status: 'invalid',
        reason: 'missing-anchor',
        rawValue: {
          action: rawValue.action,
          sourceText,
          anchorLabel: relativeAdditionIntent?.anchorLabel,
          objectLabel: relativeAdditionIntent?.objectLabel,
          relation: relativeAdditionIntent?.relation,
          originalValue: rawValue,
        },
      }
    }

    if (!options.canvas) {
      return {
        status: 'invalid',
        reason: 'missing-canvas-context',
        rawValue,
      }
    }

    if (!Array.isArray(rawValue.commands)) {
      return {
        status: 'invalid',
        reason: 'invalid-batch-commands',
        rawValue,
      }
    }

    if (
      rawValue.commands.length < 2 ||
      rawValue.commands.length > maxBatchCommandCount
    ) {
      return {
        status: 'invalid',
        reason: 'invalid-batch-command-count',
        rawValue,
      }
    }

    let validationCanvas = recomputeValidationCanvas(options.canvas)
    const executableObjectIds = new Set(
      validationCanvas.objects.map((object) => object.id),
    )
    const commands: BatchStepCommand[] = []

    for (const [index, stepValue] of rawValue.commands.entries()) {
      if (
        !isRecord(stepValue) ||
        typeof stepValue.action !== 'string' ||
        !allowedBatchStepActions.has(stepValue.action)
      ) {
        return {
          status: 'invalid',
          reason: 'unsupported-batch-step',
          rawValue: {
            index,
            step: stepValue,
            originalValue: rawValue,
          },
        }
      }

      const referencesNonExecutableId = getTargetIdsFromRawStep(stepValue).some(
        (id) => !executableObjectIds.has(id),
      )

      if (referencesNonExecutableId) {
        return {
          status: 'invalid',
          reason: 'invalid-batch-step-transient-id',
          rawValue: {
            index,
            step: stepValue,
            originalValue: rawValue,
          },
        }
      }

      const stepResult = validatePlannedCommand(stepValue, {
        ...options,
        canvas: validationCanvas,
        sourceText:
          typeof stepValue.sourceText === 'string'
            ? stepValue.sourceText
            : effectiveSourceText,
        strictTargets: true,
        batchDepth: (options.batchDepth ?? 0) + 1,
      })

      if (stepResult.status !== 'planned' || !isBatchStepCommand(stepResult.command)) {
        return {
          status: 'invalid',
          reason:
            stepResult.status === 'invalid'
              ? `invalid-batch-step-${stepResult.reason}`
              : 'invalid-batch-step',
          rawValue: {
            index,
            step: stepValue,
            result: stepResult,
            originalValue: rawValue,
          },
        }
      }

      commands.push(stepResult.command)
      validationCanvas = applyValidationBatchStep(validationCanvas, stepResult.command)
    }

    return createPlannedResult(
      {
        action: 'batch',
        sourceText,
        commands,
      },
      correction,
    )
  }

  if (
    isMissingRelativeAnchor &&
    (rawValue.action === 'create' ||
      rawValue.action === 'scene' ||
      rawValue.action === 'addSceneObject')
  ) {
    return {
      status: 'invalid',
      reason: 'missing-anchor',
      rawValue: {
        action: rawValue.action,
        sourceText,
        anchorLabel: relativeAdditionIntent?.anchorLabel,
        objectLabel: relativeAdditionIntent?.objectLabel,
        relation: relativeAdditionIntent?.relation,
        originalValue: rawValue,
      },
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

    if (shouldNormalizeMoveToSpatial(rawValue, target, spatialMoveIntent)) {
      const reference = normalizeTarget({
        mode: 'semantic',
        groupLabel: spatialMoveIntent?.referenceLabel,
      })

      if (!reference || !spatialMoveIntent) {
        return {
          status: 'invalid',
          reason: 'invalid-move-reference',
          rawValue,
        }
      }

      const referenceError = validateTargetSelection(reference, rawValue, options, {
        allowGroup: reference.mode === 'semantic' && !reference.id,
      })

      if (referenceError) {
        return {
          ...referenceError,
          reason:
            referenceError.reason === 'target-not-found'
              ? 'reference-not-found'
              : referenceError.reason === 'ambiguous-target'
                ? 'ambiguous-reference'
                : referenceError.reason,
        }
      }

      return createPlannedResult(
        {
          action: 'move',
          target: normalizeEditableTargetForSource(target, options, sourceText),
          mode: 'spatial',
          reference: normalizeEditableTarget(reference, options),
          relation: spatialMoveIntent.relation,
          align: spatialMoveIntent.align,
          gap: spatialMoveIntent.gap,
          sourceText,
        },
        correction,
      )
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
          target: normalizeEditableTargetForSource(target, options, sourceText),
          mode: 'absolute',
          position: rawValue.position as CommandPosition,
          sourceText,
        },
        correction,
      )
    }

    if (rawValue.mode === 'spatial') {
      const reference = normalizeTarget(rawValue.reference)

      if (!reference) {
        return {
          status: 'invalid',
          reason: 'invalid-move-reference',
          rawValue,
        }
      }

      const referenceError = validateTargetSelection(reference, rawValue, options, {
        allowGroup: reference.mode === 'semantic' && !reference.id,
      })

      if (referenceError) {
        return {
          ...referenceError,
          reason:
            referenceError.reason === 'target-not-found'
              ? 'reference-not-found'
              : referenceError.reason === 'ambiguous-target'
                ? 'ambiguous-reference'
                : referenceError.reason,
        }
      }

      if (!allowedSpatialMoveRelations.has(rawValue.relation as SpatialMoveRelation)) {
        return {
          status: 'invalid',
          reason: 'invalid-move-relation',
          rawValue,
        }
      }

      const align =
        rawValue.align === undefined
          ? undefined
          : allowedSpatialMoveAlignments.has(rawValue.align as SpatialMoveAlignment)
            ? (rawValue.align as SpatialMoveAlignment)
            : null
      const gap = normalizeSpatialMoveGap(rawValue.gap)

      if (align === null) {
        return {
          status: 'invalid',
          reason: 'invalid-move-alignment',
          rawValue,
        }
      }

      if (gap === null) {
        return {
          status: 'invalid',
          reason: 'invalid-move-gap',
          rawValue,
        }
      }

      return createPlannedResult(
        {
          action: 'move',
          target: normalizeEditableTargetForSource(target, options, sourceText),
          mode: 'spatial',
          reference: normalizeEditableTarget(reference, options),
          relation: spatialMoveIntent?.relation ?? (rawValue.relation as SpatialMoveRelation),
          align: spatialMoveIntent?.align ?? align,
          gap: spatialMoveIntent?.gap ?? gap,
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
        target: normalizeEditableTargetForSource(target, options, sourceText),
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

  if (rawValue.action === 'align') {
    const target = normalizeTarget(rawValue.target)

    if (!target || !allowedAlignAxes.has(rawValue.axis as AlignAxis)) {
      return {
        status: 'invalid',
        reason: 'invalid-align-command',
        rawValue,
      }
    }

    const targetError = validateTargetSelection(target, rawValue, options, {
      allowGroup: true,
    })

    if (targetError) {
      return targetError
    }

    const normalizedTarget = normalizeEditableTarget(target, options)

    if (!targetRequestsMultiple(normalizedTarget)) {
      return {
        status: 'invalid',
        reason: 'align-requires-multiple-targets',
        rawValue,
      }
    }

    return createPlannedResult(
      {
        action: 'align',
        target: normalizedTarget,
        axis: rawValue.axis as AlignAxis,
        sourceText,
      },
      correction,
    )
  }

  if (rawValue.action === 'arrange') {
    const target = normalizeTarget(rawValue.target)
    const spacing = normalizeArrangeSpacing(rawValue.spacing)

    if (!target || !allowedArrangeLayouts.has(rawValue.layout as ArrangeLayout)) {
      return {
        status: 'invalid',
        reason: 'invalid-arrange-command',
        rawValue,
      }
    }

    if (spacing === null) {
      return {
        status: 'invalid',
        reason: 'invalid-arrange-spacing',
        rawValue,
      }
    }

    const targetError = validateTargetSelection(target, rawValue, options, {
      allowGroup: true,
    })

    if (targetError) {
      return targetError
    }

    const normalizedTarget = normalizeEditableTarget(target, options)

    if (!targetRequestsMultiple(normalizedTarget)) {
      return {
        status: 'invalid',
        reason: 'arrange-requires-multiple-targets',
        rawValue,
      }
    }

    return createPlannedResult(
      {
        action: 'arrange',
        target: normalizedTarget,
        layout: rawValue.layout as ArrangeLayout,
        spacing,
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
