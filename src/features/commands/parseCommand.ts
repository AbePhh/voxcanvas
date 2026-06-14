import {
  colorKeywords,
  positionKeywords,
  shapeKeywords,
  sizeKeywords,
} from './commandDictionaries'
import type {
  CommandColor,
  CommandPosition,
  CommandSize,
  CommandTarget,
  CanvasResizeAnchor,
  CanvasResizeDirection,
  ExportFormat,
  MoveDirection,
  ParsedCommand,
} from './types'
import type { ShapeKind } from '../canvas/types'
import { createImplicitMultiCreateBatchCommand } from './implicitMultiCreate'

function normalizeCommandText(text: string) {
  return text.replace(/\s+/g, '').replace(/[，。！？、,.!?]/g, '').trim()
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword))
}

function findDictionaryMatch<T extends string>(
  text: string,
  dictionary: Record<T, string[]>,
) {
  return (Object.entries(dictionary) as Array<[T, string[]]>).find(([, keywords]) =>
    includesAny(text, keywords),
  )?.[0]
}

function detectSimpleAction(text: string) {
  if (includesAny(text, ['导出', '保存图片', '下载图片', '保存作品', '下载作品'])) {
    return 'export'
  }

  if (includesAny(text, ['撤销', '取消上一步', '回退'])) {
    return 'undo'
  }

  if (includesAny(text, ['重做', '恢复上一步'])) {
    return 'redo'
  }

  if (includesAny(text, ['清空画布', '清除画布'])) {
    return 'clear'
  }

  return undefined
}

function detectExportFormat(text: string): ExportFormat | undefined {
  const normalizedText = text.toLowerCase()

  if (includesAny(normalizedText, ['svg']) || includesAny(text, ['SVG'])) {
    return 'svg'
  }

  if (includesAny(normalizedText, ['jpg', 'jpeg']) || includesAny(text, ['JPG', 'JPEG'])) {
    return 'jpg'
  }

  if (includesAny(normalizedText, ['png']) || includesAny(text, ['PNG'])) {
    return 'png'
  }

  return undefined
}

function detectEditAction(text: string) {
  if (includesAny(text, ['删除', '删掉', '移除', '去掉'])) {
    return 'delete'
  }

  if (includesAny(text, ['移动', '移到', '移动到', '放到', '挪到'])) {
    return 'move'
  }

  if (
    includesAny(text, ['改成', '变成', '换成']) &&
    findDictionaryMatch(text, colorKeywords)
  ) {
    return 'recolor'
  }

  if (includesAny(text, ['放大', '变大', '扩大', '缩小', '变小'])) {
    return 'resize'
  }

  return undefined
}

function detectCanvasResizeDirection(text: string): CanvasResizeDirection {
  if (includesAny(text, ['变宽', '加宽', '更宽', '宽一点'])) {
    return 'wider'
  }

  if (includesAny(text, ['变窄', '缩窄', '窄一点'])) {
    return 'narrower'
  }

  if (includesAny(text, ['变高', '加高', '更高', '高一点'])) {
    return 'taller'
  }

  if (includesAny(text, ['变矮', '矮一点', '降低高度'])) {
    return 'shorter'
  }

  if (includesAny(text, ['缩小', '变小', '小一点'])) {
    return 'smaller'
  }

  return 'larger'
}

function detectCanvasResizeAnchor(text: string): CanvasResizeAnchor {
  const hasTop = includesAny(text, ['上面', '上方', '顶部', '上边'])
  const hasBottom = includesAny(text, ['下面', '下方', '底部', '下边'])
  const hasLeft = includesAny(text, ['左边', '左侧', '左面'])
  const hasRight = includesAny(text, ['右边', '右侧', '右面'])

  if (hasTop && hasLeft) {
    return 'top-left'
  }

  if (hasTop && hasRight) {
    return 'top-right'
  }

  if (hasBottom && hasLeft) {
    return 'bottom-left'
  }

  if (hasBottom && hasRight) {
    return 'bottom-right'
  }

  if (hasLeft) {
    return 'left'
  }

  if (hasRight) {
    return 'right'
  }

  if (hasTop) {
    return 'top'
  }

  if (hasBottom) {
    return 'bottom'
  }

  return 'center'
}

function parseCanvasSize(text: string) {
  const normalizedText = text.replace(/[×＊*]/g, 'x')
  const explicitSizeMatch = normalizedText.match(/(\d{2,4})\s*(?:x|乘|比|,|，|\s)\s*(\d{2,4})/)

  if (!explicitSizeMatch) {
    return null
  }

  return {
    width: Number(explicitSizeMatch[1]),
    height: Number(explicitSizeMatch[2]),
  }
}

function parseCanvasResizeCommand(text: string, sourceText: string): ParsedCommand | null {
  const hasCanvasKeyword = includesAny(text, ['画布', '画板', '话不', '画不', '画部'])

  if (!hasCanvasKeyword) {
    return null
  }

  if (!includesAny(text, ['调整', '设置', '设为', '改成', '变大', '放大', '缩小', '变小', '变宽', '变窄', '变高', '变矮', '加宽', '加高'])) {
    return null
  }

  const size = parseCanvasSize(text)
  const anchor = detectCanvasResizeAnchor(text)

  if (size) {
    return {
      action: 'resizeCanvas',
      mode: 'absolute',
      width: size.width,
      height: size.height,
      anchor,
      sourceText,
    }
  }

  return {
    action: 'resizeCanvas',
    mode: 'relative',
    direction: detectCanvasResizeDirection(text),
    anchor,
    amount: 120,
    sourceText,
  }
}

function detectCreateAction(text: string) {
  if (includesAny(text, ['画', '绘制', '创建', '添加', '生成'])) {
    return 'create'
  }

  return undefined
}

function detectMoveDirection(text: string): MoveDirection | undefined {
  if (includesAny(text, ['往左', '向左', '左移', '左挪'])) {
    return 'left'
  }

  if (includesAny(text, ['往右', '向右', '右移', '右挪'])) {
    return 'right'
  }

  if (includesAny(text, ['往上', '向上', '上移', '上挪'])) {
    return 'up'
  }

  if (includesAny(text, ['往下', '向下', '下移', '下挪'])) {
    return 'down'
  }

  return undefined
}

function createUnknown(reason: string, sourceText: string): ParsedCommand {
  return {
    action: 'unknown',
    reason,
    sourceText,
  }
}

function splitRecolorText(text: string) {
  const operator = ['改成', '变成', '换成'].find((keyword) => text.includes(keyword))

  if (!operator) {
    return null
  }

  const [targetText, colorText] = text.split(operator, 2)

  return {
    targetText,
    colorText,
  }
}

function detectExplicitTarget(
  text: string,
  options: { includePosition?: boolean } = {},
): CommandTarget | null {
  const shape = findDictionaryMatch<ShapeKind>(text, shapeKeywords)
  const color = findDictionaryMatch<CommandColor>(text, colorKeywords)
  const position = options.includePosition
    ? findDictionaryMatch<CommandPosition>(text, positionKeywords)
    : undefined

  if (includesAny(text, ['刚才', '刚刚', '上一个', '最近'])) {
    return {
      mode: 'last',
      shape,
      color,
      position,
    }
  }

  if (includesAny(text, ['选中', '当前', '这个', '那个', '它'])) {
    return {
      mode: 'selected',
      shape,
      color,
      position,
    }
  }

  if (shape || color || position) {
    return {
      mode: shape ? 'shape' : position ? 'position' : 'any',
      shape,
      color,
      position,
    }
  }

  return null
}

function parseEditCommand(
  action: NonNullable<ReturnType<typeof detectEditAction>>,
  text: string,
  sourceText: string,
): ParsedCommand {
  const recolorParts = action === 'recolor' ? splitRecolorText(text) : null
  const target = detectExplicitTarget(recolorParts?.targetText ?? text, {
    includePosition: action !== 'move',
  })

  if (!target) {
    return createUnknown(`unsafe-${action}-target`, sourceText)
  }

  if (action === 'delete') {
    return {
      action,
      target,
      sourceText,
    }
  }

  if (action === 'move') {
    const direction = detectMoveDirection(text)

    if (direction) {
      return {
        action,
        target,
        mode: 'relative',
        direction,
        distance: 48,
        sourceText,
      }
    }

    const position = findDictionaryMatch<CommandPosition>(text, positionKeywords)

    if (!position) {
      return createUnknown('missing-position', sourceText)
    }

    return {
      action,
      target,
      mode: 'absolute',
      position,
      sourceText,
    }
  }

  if (action === 'recolor') {
    const color = findDictionaryMatch<CommandColor>(
      recolorParts?.colorText ?? text,
      colorKeywords,
    )

    if (!color) {
      return createUnknown('missing-color', sourceText)
    }

    return {
      action,
      target,
      color,
      sourceText,
    }
  }

  return {
    action,
    target,
    direction: includesAny(text, ['缩小', '变小']) ? 'smaller' : 'larger',
    sourceText,
  }
}

function parseCreateCommand(text: string, sourceText: string): ParsedCommand {
  const shape = findDictionaryMatch<ShapeKind>(text, shapeKeywords)

  if (!shape) {
    return createUnknown('planner-required-scene-or-shape', sourceText)
  }

  if (shape === 'text') {
    return createUnknown('planner-required-text-command', sourceText)
  }

  const color = findDictionaryMatch<CommandColor>(text, colorKeywords)
  const position = findDictionaryMatch<CommandPosition>(text, positionKeywords)
  const size = findDictionaryMatch<CommandSize>(text, sizeKeywords) ?? 'medium'

  return {
    action: 'create',
    shape,
    color,
    position,
    size,
    sourceText,
  }
}

export function parseCommand(rawText: string): ParsedCommand {
  const sourceText = rawText.trim()
  const text = normalizeCommandText(sourceText)

  if (!text) {
    return createUnknown('empty-input', sourceText)
  }

  const simpleAction = detectSimpleAction(text)

  if (simpleAction) {
    if (simpleAction === 'export') {
      return {
        action: 'export',
        format: detectExportFormat(text),
        sourceText,
      }
    }

    return {
      action: simpleAction,
      sourceText,
    }
  }

  const canvasResizeCommand = parseCanvasResizeCommand(text, sourceText)

  if (canvasResizeCommand) {
    return canvasResizeCommand
  }

  const implicitMultiCreateCommand = createImplicitMultiCreateBatchCommand(sourceText)

  if (implicitMultiCreateCommand) {
    return implicitMultiCreateCommand
  }

  const editAction = detectEditAction(text)

  if (editAction) {
    return parseEditCommand(editAction, text, sourceText)
  }

  if (detectCreateAction(text)) {
    return parseCreateCommand(text, sourceText)
  }

  return createUnknown('unsupported-action', sourceText)
}
