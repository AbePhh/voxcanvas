import { colorStyles, matchesCommandColor } from '../canvas/colorStyles'
import type { CanvasState, ShapeObject } from '../canvas/types'
import {
  alignAxisLabels,
  arrangeLayoutLabels,
  colorLabels,
  positionLabels,
  shapeLabels,
} from './commandLabels'
import type { CommandColor, CommandPosition, ParsedCommand } from './types'
import type {
  CommandExecutionFeedback,
  CommandExecutionFeedbackContext,
  CommandFeedbackMetric,
} from './commandFeedback'

type Bounds = Pick<ShapeObject, 'x' | 'y' | 'width' | 'height'>

const defaultContext: CommandExecutionFeedbackContext = {
  source: 'local',
}

const relationLabels = {
  'left-of': '在左侧',
  'right-of': '在右侧',
  above: '在上方',
  below: '在下方',
  near: '在附近',
  inside: '在内部',
  around: '在周围',
} as const

function formatPixels(value: number) {
  return `${Math.round(value)}px`
}

function formatSize(bounds: Pick<Bounds, 'width' | 'height'>) {
  return `${formatPixels(bounds.width)} x ${formatPixels(bounds.height)}`
}

function getShapeCenter(shape: Bounds) {
  return {
    x: Math.round(shape.x + shape.width / 2),
    y: Math.round(shape.y + shape.height / 2),
  }
}

function formatCenter(bounds: Bounds) {
  const center = getShapeCenter(bounds)

  return `(${center.x}, ${center.y})`
}

function getBounds(shapes: ShapeObject[]): Bounds | null {
  if (shapes.length === 0) {
    return null
  }

  const minX = Math.min(...shapes.map((shape) => shape.x))
  const minY = Math.min(...shapes.map((shape) => shape.y))
  const maxX = Math.max(...shapes.map((shape) => shape.x + shape.width))
  const maxY = Math.max(...shapes.map((shape) => shape.y + shape.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function getCanvasPositionLabel(bounds: Bounds, canvas: Pick<CanvasState, 'width' | 'height'>) {
  const center = getShapeCenter(bounds)
  const horizontal =
    center.x < canvas.width * 0.34
      ? 'left'
      : center.x > canvas.width * 0.66
        ? 'right'
        : 'center'
  const vertical =
    center.y < canvas.height * 0.34
      ? 'top'
      : center.y > canvas.height * 0.66
        ? 'bottom'
        : 'center'

  if (horizontal === 'center' && vertical === 'center') {
    return positionLabels.center
  }

  if (horizontal === 'center') {
    return positionLabels[vertical as Extract<CommandPosition, 'top' | 'bottom'>]
  }

  if (vertical === 'center') {
    return positionLabels[horizontal as Extract<CommandPosition, 'left' | 'right'>]
  }

  return positionLabels[`${vertical}-${horizontal}` as CommandPosition]
}

function detectShapeColor(shape: ShapeObject): CommandColor | undefined {
  return (Object.keys(colorStyles) as CommandColor[]).find((color) =>
    matchesCommandColor(shape.fill, color),
  )
}

function getColorLabel(shape: ShapeObject) {
  const color = detectShapeColor(shape)

  return color ? colorLabels[color] : shape.fill
}

function describeShapeName(shape: ShapeObject) {
  if (shape.groupLabel && shape.partLabel) {
    return `${shape.groupLabel}的${shape.partLabel}`
  }

  if (shape.groupLabel) {
    return shape.groupLabel
  }

  return `${getColorLabel(shape)}${shapeLabels[shape.type]}`
}

function describeShapeSet(shapes: ShapeObject[]) {
  if (shapes.length === 0) {
    return '目标对象'
  }

  const groupLabels = new Set(shapes.flatMap((shape) => (shape.groupLabel ? [shape.groupLabel] : [])))
  const groupIds = new Set(shapes.flatMap((shape) => (shape.groupId ? [shape.groupId] : [])))

  if (groupLabels.size === 1 && (groupIds.size === 1 || shapes.length > 1)) {
    return `${Array.from(groupLabels)[0]}（${shapes.length} 个部件）`
  }

  if (shapes.length === 1) {
    return describeShapeName(shapes[0])
  }

  return `${shapes.length} 个对象`
}

function describeGeometry(shape: ShapeObject) {
  if (shape.type === 'circle') {
    const diameter = Math.round((shape.width + shape.height) / 2)

    return Math.abs(shape.width - shape.height) <= 2
      ? `直径约 ${formatPixels(diameter)}`
      : `外接区域约 ${formatSize(shape)}`
  }

  if (shape.type === 'triangle') {
    return `底边约 ${formatPixels(shape.width)}、高度约 ${formatPixels(shape.height)}`
  }

  if (shape.type === 'line') {
    const length = Math.sqrt(shape.width ** 2 + shape.height ** 2)

    return `长度约 ${formatPixels(length)}`
  }

  if (shape.type === 'text') {
    return `文本区域约 ${formatSize(shape)}`
  }

  return `尺寸约 ${formatSize(shape)}`
}

function getAddedShapes(before: CanvasState, after: CanvasState) {
  const beforeIds = new Set(before.shapes.map((shape) => shape.id))

  return after.shapes.filter((shape) => !beforeIds.has(shape.id))
}

function getRemovedShapes(before: CanvasState, after: CanvasState) {
  const afterIds = new Set(after.shapes.map((shape) => shape.id))

  return before.shapes.filter((shape) => !afterIds.has(shape.id))
}

function getChangedShapePairs(before: CanvasState, after: CanvasState) {
  const beforeById = new Map(before.shapes.map((shape) => [shape.id, shape]))

  return after.shapes
    .map((nextShape) => {
      const previousShape = beforeById.get(nextShape.id)

      return previousShape ? { before: previousShape, after: nextShape } : null
    })
    .filter((pair): pair is { before: ShapeObject; after: ShapeObject } => {
      if (!pair) {
        return false
      }

      return (
        pair.before.x !== pair.after.x ||
        pair.before.y !== pair.after.y ||
        pair.before.width !== pair.after.width ||
        pair.before.height !== pair.after.height ||
        pair.before.fill !== pair.after.fill ||
        pair.before.stroke !== pair.after.stroke ||
        pair.before.fontSize !== pair.after.fontSize
      )
    })
}

function createFeedback(
  status: CommandExecutionFeedback['status'],
  title: string,
  summary: string,
  options: CommandExecutionFeedbackContext & {
    details?: string[]
    metrics?: CommandFeedbackMetric[]
  },
): CommandExecutionFeedback {
  return {
    source: options.source,
    status,
    title,
    summary,
    details: options.details ?? [],
    metrics: options.metrics,
    correction: options.correction,
  }
}

function createNoChangeFeedback(
  command: ParsedCommand,
  context: CommandExecutionFeedbackContext,
) {
  const title =
    command.action === 'undo'
      ? '无法撤销'
      : command.action === 'redo'
        ? '无法重做'
        : '没有执行变化'

  return createFeedback(
    'blocked',
    title,
    command.action === 'undo'
      ? '当前没有可以撤销的步骤。'
      : command.action === 'redo'
        ? '当前没有可以重做的步骤。'
        : '命令没有改变画布内容。',
    context,
  )
}

function createShapeCreateFeedback(
  command: Extract<ParsedCommand, { action: 'create' }>,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext,
) {
  const addedShape = getAddedShapes(before, after).at(-1)

  if (!addedShape) {
    return createNoChangeFeedback(command, context)
  }

  const colorText = getColorLabel(addedShape)
  const positionText = getCanvasPositionLabel(addedShape, after)
  const geometry = describeGeometry(addedShape)
  const summary = `已生成一个${geometry} 的${colorText}${shapeLabels[addedShape.type]}，位于画布${positionText}。`
  const metrics: CommandFeedbackMetric[] = [
    { label: '尺寸', value: addedShape.type === 'circle' ? `直径 ${formatPixels(Math.round((addedShape.width + addedShape.height) / 2))}` : formatSize(addedShape) },
    { label: '位置', value: positionText },
    { label: '中心', value: formatCenter(addedShape) },
    { label: '颜色', value: colorText },
  ]
  const details = [
    `对象：${describeShapeName(addedShape)}`,
    `边界：x ${formatPixels(addedShape.x)}，y ${formatPixels(addedShape.y)}，${formatSize(addedShape)}`,
  ]

  if (command.text || addedShape.text) {
    details.push(`文本：${addedShape.text ?? command.text}`)
  }

  return createFeedback('executed', '创建完成', summary, {
    ...context,
    details,
    metrics,
  })
}

function createSceneFeedback(
  command: Extract<ParsedCommand, { action: 'scene' }>,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext,
) {
  const addedShapes = getAddedShapes(before, after)
  const bounds = getBounds(addedShapes)

  if (!bounds) {
    return createNoChangeFeedback(command, context)
  }

  const groupLabels = Array.from(
    new Set(addedShapes.flatMap((shape) => (shape.groupLabel ? [shape.groupLabel] : []))),
  )
  const visibleGroups = groupLabels.slice(0, 4)
  const summary = `已生成${command.title ? `「${command.title}」` : '新场景'}，新增 ${addedShapes.length} 个基础图形${
    visibleGroups.length > 0 ? `，包含 ${visibleGroups.join('、')}` : ''
  }。`

  return createFeedback('executed', '场景生成完成', summary, {
    ...context,
    metrics: [
      { label: '新增图形', value: `${addedShapes.length} 个` },
      { label: '语义对象', value: groupLabels.length > 0 ? `${groupLabels.length} 组` : '未分组' },
      { label: '覆盖区域', value: formatSize(bounds) },
      { label: '位置', value: getCanvasPositionLabel(bounds, after) },
    ],
    details: [
      groupLabels.length > 0
        ? `语义对象：${groupLabels.slice(0, 8).join('、')}`
        : '语义对象：未提供',
      `边界：x ${formatPixels(bounds.x)}，y ${formatPixels(bounds.y)}，${formatSize(bounds)}`,
    ],
  })
}

function createAddSceneObjectFeedback(
  command: Extract<ParsedCommand, { action: 'addSceneObject' }>,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext,
) {
  const addedShapes = getAddedShapes(before, after)
  const bounds = getBounds(addedShapes)

  if (!bounds) {
    return createNoChangeFeedback(command, context)
  }

  const groupLabels = Array.from(
    new Set(addedShapes.flatMap((shape) => (shape.groupLabel ? [shape.groupLabel] : []))),
  )
  const contentLabel = command.objectLabel ?? command.title ?? groupLabels[0] ?? '内容'
  const anchorText = command.anchor?.groupLabel
    ? `，参考${command.anchor.groupLabel}${
        command.anchor.relation ? `（${relationLabels[command.anchor.relation]}）` : ''
      }`
    : ''

  return createFeedback(
    'executed',
    '新增内容完成',
    `已新增${contentLabel}，追加 ${addedShapes.length} 个基础图形${anchorText}。`,
    {
      ...context,
      metrics: [
        { label: '新增内容', value: contentLabel },
        { label: '新增图形', value: `${addedShapes.length} 个` },
        { label: '覆盖区域', value: formatSize(bounds) },
        { label: '位置', value: getCanvasPositionLabel(bounds, after) },
      ],
      details: [
        groupLabels.length > 0
          ? `语义对象：${groupLabels.slice(0, 6).join('、')}`
          : '语义对象：未提供',
        `边界：x ${formatPixels(bounds.x)}，y ${formatPixels(bounds.y)}，${formatSize(bounds)}`,
      ],
    },
  )
}

function createMoveFeedback(
  command: Extract<ParsedCommand, { action: 'move' }>,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext,
) {
  const changedPairs = getChangedShapePairs(before, after).filter(
    (pair) => pair.before.x !== pair.after.x || pair.before.y !== pair.after.y,
  )
  const beforeBounds = getBounds(changedPairs.map((pair) => pair.before))
  const afterBounds = getBounds(changedPairs.map((pair) => pair.after))

  if (!beforeBounds || !afterBounds) {
    return createNoChangeFeedback(command, context)
  }

  const deltaX = Math.round(afterBounds.x - beforeBounds.x)
  const deltaY = Math.round(afterBounds.y - beforeBounds.y)
  const distance = Math.round(Math.sqrt(deltaX ** 2 + deltaY ** 2))
  const targetText = describeShapeSet(changedPairs.map((pair) => pair.after))
  const fromPosition = getCanvasPositionLabel(beforeBounds, before)
  const toPosition = getCanvasPositionLabel(afterBounds, after)
  const summary =
    command.mode === 'spatial'
      ? `已将${targetText}按参照物关系移动，从画布${fromPosition}到${toPosition}。`
      : command.mode === 'relative'
      ? `已将${targetText}移动 ${formatPixels(distance)}，从画布${fromPosition}到${toPosition}。`
      : `已将${targetText}移动到画布${toPosition}。`

  return createFeedback('executed', '移动完成', summary, {
    ...context,
    metrics: [
      { label: '目标', value: targetText },
      { label: '位移', value: `x ${deltaX >= 0 ? '+' : ''}${formatPixels(deltaX)}，y ${deltaY >= 0 ? '+' : ''}${formatPixels(deltaY)}` },
      { label: '起点', value: formatCenter(beforeBounds) },
      { label: '终点', value: formatCenter(afterBounds) },
    ],
    details: [`影响对象：${changedPairs.length} 个`, `新边界：${formatSize(afterBounds)}`],
  })
}

function createRecolorFeedback(
  command: Extract<ParsedCommand, { action: 'recolor' }>,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext,
) {
  const recoloredPairs = getChangedShapePairs(before, after).filter(
    (pair) => pair.before.fill !== pair.after.fill || pair.before.stroke !== pair.after.stroke,
  )

  if (recoloredPairs.length === 0) {
    return createNoChangeFeedback(command, context)
  }

  const targetText = describeShapeSet(recoloredPairs.map((pair) => pair.after))
  const colorText = colorLabels[command.color]

  return createFeedback('executed', '颜色修改完成', `已将${targetText}改为${colorText}。`, {
    ...context,
    metrics: [
      { label: '目标', value: targetText },
      { label: '颜色', value: colorText },
      { label: '对象数', value: `${recoloredPairs.length} 个` },
    ],
  })
}

function createResizeFeedback(
  command: Extract<ParsedCommand, { action: 'resize' }>,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext,
) {
  const resizedPairs = getChangedShapePairs(before, after).filter(
    (pair) =>
      pair.before.width !== pair.after.width ||
      pair.before.height !== pair.after.height ||
      pair.before.fontSize !== pair.after.fontSize,
  )
  const beforeBounds = getBounds(resizedPairs.map((pair) => pair.before))
  const afterBounds = getBounds(resizedPairs.map((pair) => pair.after))

  if (!beforeBounds || !afterBounds) {
    return createNoChangeFeedback(command, context)
  }

  const targetText = describeShapeSet(resizedPairs.map((pair) => pair.after))
  const directionText = command.direction === 'larger' ? '放大' : '缩小'
  const scale = beforeBounds.width > 0 ? Math.round((afterBounds.width / beforeBounds.width) * 100) : undefined

  return createFeedback(
    'executed',
    '大小调整完成',
    `已${directionText}${targetText}，当前整体尺寸约 ${formatSize(afterBounds)}。`,
    {
      ...context,
      metrics: [
        { label: '目标', value: targetText },
        { label: '原尺寸', value: formatSize(beforeBounds) },
        { label: '新尺寸', value: formatSize(afterBounds) },
        { label: '比例', value: scale ? `${scale}%` : directionText },
      ],
      details: [`影响对象：${resizedPairs.length} 个`, `中心：${formatCenter(afterBounds)}`],
    },
  )
}

function createAlignFeedback(
  command: Extract<ParsedCommand, { action: 'align' }>,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext,
) {
  const movedPairs = getChangedShapePairs(before, after).filter(
    (pair) => pair.before.x !== pair.after.x || pair.before.y !== pair.after.y,
  )
  const afterBounds = getBounds(movedPairs.map((pair) => pair.after))

  if (!afterBounds) {
    return createNoChangeFeedback(command, context)
  }

  const targetText = describeShapeSet(movedPairs.map((pair) => pair.after))

  return createFeedback(
    'executed',
    '对齐完成',
    `已将${targetText}${alignAxisLabels[command.axis]}。`,
    {
      ...context,
      metrics: [
        { label: '方式', value: alignAxisLabels[command.axis] },
        { label: '影响对象', value: `${movedPairs.length} 个` },
        { label: '覆盖区域', value: formatSize(afterBounds) },
        { label: '中心', value: formatCenter(afterBounds) },
      ],
    },
  )
}

function createArrangeFeedback(
  command: Extract<ParsedCommand, { action: 'arrange' }>,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext,
) {
  const movedPairs = getChangedShapePairs(before, after).filter(
    (pair) => pair.before.x !== pair.after.x || pair.before.y !== pair.after.y,
  )
  const afterBounds = getBounds(movedPairs.map((pair) => pair.after))

  if (!afterBounds) {
    return createNoChangeFeedback(command, context)
  }

  const targetText = describeShapeSet(movedPairs.map((pair) => pair.after))

  return createFeedback(
    'executed',
    '排列完成',
    `已将${targetText}${arrangeLayoutLabels[command.layout]}，间距约 ${formatPixels(command.spacing ?? 32)}。`,
    {
      ...context,
      metrics: [
        { label: '方式', value: arrangeLayoutLabels[command.layout] },
        { label: '间距', value: formatPixels(command.spacing ?? 32) },
        { label: '影响对象', value: `${movedPairs.length} 个` },
        { label: '覆盖区域', value: formatSize(afterBounds) },
      ],
    },
  )
}

function createCanvasResizeFeedback(
  command: Extract<ParsedCommand, { action: 'resizeCanvas' }>,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext,
) {
  if (before.width === after.width && before.height === after.height) {
    return createNoChangeFeedback(command, context)
  }

  const beforeFirst = before.shapes[0]
  const afterFirst = beforeFirst
    ? after.shapes.find((shape) => shape.id === beforeFirst.id)
    : undefined
  const offsetX = beforeFirst && afterFirst ? afterFirst.x - beforeFirst.x : 0
  const offsetY = beforeFirst && afterFirst ? afterFirst.y - beforeFirst.y : 0
  const offsetText =
    offsetX || offsetY
      ? `内容整体偏移 x ${offsetX >= 0 ? '+' : ''}${formatPixels(offsetX)}，y ${offsetY >= 0 ? '+' : ''}${formatPixels(offsetY)}`
      : '内容位置保持不变'

  return createFeedback(
    'executed',
    '画布调整完成',
    `画布已调整为 ${formatSize(after)}，${offsetText}。`,
    {
      ...context,
      metrics: [
        { label: '原画布', value: formatSize(before) },
        { label: '新画布', value: formatSize(after) },
        { label: '锚点', value: command.anchor ?? 'center' },
        { label: '偏移', value: offsetX || offsetY ? `${offsetX}, ${offsetY}` : '0, 0' },
      ],
    },
  )
}

function createDeleteFeedback(
  command: Extract<ParsedCommand, { action: 'delete' }>,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext,
) {
  const removedShapes = getRemovedShapes(before, after)

  if (removedShapes.length === 0) {
    return createNoChangeFeedback(command, context)
  }

  const targetText = describeShapeSet(removedShapes)

  return createFeedback('executed', '删除完成', `已删除${targetText}。`, {
    ...context,
    metrics: [
      { label: '删除对象', value: `${removedShapes.length} 个` },
      { label: '剩余对象', value: `${after.shapes.length} 个` },
    ],
  })
}

function createBatchFeedback(
  command: Extract<ParsedCommand, { action: 'batch' }>,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext,
) {
  const addedShapes = getAddedShapes(before, after)
  const removedShapes = getRemovedShapes(before, after)
  const changedPairs = getChangedShapePairs(before, after)

  if (
    addedShapes.length === 0 &&
    removedShapes.length === 0 &&
    changedPairs.length === 0 &&
    before.width === after.width &&
    before.height === after.height
  ) {
    return createNoChangeFeedback(command, context)
  }

  const movedCount = changedPairs.filter(
    (pair) => pair.before.x !== pair.after.x || pair.before.y !== pair.after.y,
  ).length
  const recoloredCount = changedPairs.filter(
    (pair) => pair.before.fill !== pair.after.fill || pair.before.stroke !== pair.after.stroke,
  ).length
  const resizedCount = changedPairs.filter(
    (pair) =>
      pair.before.width !== pair.after.width ||
      pair.before.height !== pair.after.height ||
      pair.before.fontSize !== pair.after.fontSize,
  ).length
  const detailParts = [
    addedShapes.length > 0 ? `新增 ${addedShapes.length} 个对象` : null,
    removedShapes.length > 0 ? `删除 ${removedShapes.length} 个对象` : null,
    movedCount > 0 ? `移动 ${movedCount} 个对象` : null,
    recoloredCount > 0 ? `改色 ${recoloredCount} 个对象` : null,
    resizedCount > 0 ? `缩放 ${resizedCount} 个对象` : null,
    before.width !== after.width || before.height !== after.height
      ? `画布调整为 ${formatSize(after)}`
      : null,
  ].filter((part): part is string => Boolean(part))

  return createFeedback(
    'executed',
    '复杂命令执行完成',
    `已按顺序执行 ${command.commands.length} 步：${detailParts.join('，') || '画布已更新'}。`,
    {
      ...context,
      metrics: [
        { label: '执行步骤', value: `${command.commands.length} 步` },
        { label: '新增', value: `${addedShapes.length} 个` },
        { label: '删除', value: `${removedShapes.length} 个` },
        { label: '修改', value: `${changedPairs.length} 个` },
      ],
      details: command.commands.map((step, index) => `第 ${index + 1} 步：${step.action}`),
    },
  )
}

function createHistoryFeedback(
  command: Extract<ParsedCommand, { action: 'undo' | 'redo' | 'clear' }>,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext,
) {
  if (before === after) {
    return createNoChangeFeedback(command, context)
  }

  if (command.action === 'clear') {
    return createFeedback('executed', '画布已清空', `已清空画布，删除 ${before.shapes.length} 个对象。`, {
      ...context,
      metrics: [
        { label: '删除对象', value: `${before.shapes.length} 个` },
        { label: '当前对象', value: `${after.shapes.length} 个` },
      ],
    })
  }

  return createFeedback(
    'executed',
    command.action === 'undo' ? '撤销完成' : '重做完成',
    command.action === 'undo'
      ? `已撤销上一步，当前画布包含 ${after.shapes.length} 个对象。`
      : `已重做上一步，当前画布包含 ${after.shapes.length} 个对象。`,
    {
      ...context,
      metrics: [
        { label: '对象数', value: `${after.shapes.length} 个` },
        { label: '画布', value: formatSize(after) },
      ],
    },
  )
}

export function createPreciseExecutionFeedback(
  command: ParsedCommand,
  before: CanvasState,
  after: CanvasState,
  context: CommandExecutionFeedbackContext = defaultContext,
): CommandExecutionFeedback {
  if (command.action === 'unknown' || command.action === 'export') {
    return createNoChangeFeedback(command, context)
  }

  if (command.action === 'create') {
    return createShapeCreateFeedback(command, before, after, context)
  }

  if (command.action === 'scene') {
    return createSceneFeedback(command, before, after, context)
  }

  if (command.action === 'addSceneObject') {
    return createAddSceneObjectFeedback(command, before, after, context)
  }

  if (command.action === 'move') {
    return createMoveFeedback(command, before, after, context)
  }

  if (command.action === 'recolor') {
    return createRecolorFeedback(command, before, after, context)
  }

  if (command.action === 'resize') {
    return createResizeFeedback(command, before, after, context)
  }

  if (command.action === 'align') {
    return createAlignFeedback(command, before, after, context)
  }

  if (command.action === 'arrange') {
    return createArrangeFeedback(command, before, after, context)
  }

  if (command.action === 'resizeCanvas') {
    return createCanvasResizeFeedback(command, before, after, context)
  }

  if (command.action === 'delete') {
    return createDeleteFeedback(command, before, after, context)
  }

  if (command.action === 'batch') {
    return createBatchFeedback(command, before, after, context)
  }

  return createHistoryFeedback(command, before, after, context)
}
