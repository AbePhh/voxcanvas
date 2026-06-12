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
  MoveShapeCommand,
  ParsedCommand,
} from './types'
import type { ShapeKind } from '../canvas/types'

function normalizeCommandText(text: string) {
  return text.replace(/\s+/g, '').replace(/[，。！？,.!?]/g, '').trim()
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

function extractTextContent(sourceText: string) {
  const quotedText = sourceText.match(/[“"']([^”"']+)[”"']/)?.[1]

  if (quotedText) {
    return quotedText.trim()
  }

  const contentMatch = sourceText.match(
    /(?:内容是|内容为|写着|写上|文字是|文字为|文本是|文本为)(.+)$/,
  )?.[1]

  if (contentMatch) {
    return contentMatch.trim().replace(/[。！？,.!?]$/, '')
  }

  return undefined
}

function detectAction(text: string) {
  if (includesAny(text, ['撤销', '取消上一步', '回退'])) {
    return 'undo'
  }

  if (includesAny(text, ['重做', '恢复上一步'])) {
    return 'redo'
  }

  if (includesAny(text, ['清空', '清除画布', '清空画布', '全部删除'])) {
    return 'clear'
  }

  if (includesAny(text, ['删除', '删掉', '移除', '去掉'])) {
    return 'delete'
  }

  if (includesAny(text, ['移动', '移到', '放到', '挪到'])) {
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

  if (includesAny(text, ['画', '绘制', '创建', '添加', '生成'])) {
    return 'create'
  }

  return 'unknown'
}

function detectMoveDirection(text: string): MoveShapeCommand['direction'] {
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

function detectTarget(text: string, options: { includePosition?: boolean } = {}): CommandTarget {
  const shape = findDictionaryMatch<ShapeKind>(text, shapeKeywords)
  const position = options.includePosition
    ? findDictionaryMatch<CommandPosition>(text, positionKeywords)
    : undefined

  if (includesAny(text, ['刚才', '刚刚', '上一个', '最近'])) {
    return {
      mode: 'last',
      shape,
      position,
    }
  }

  if (includesAny(text, ['选中', '当前', '这个', '它'])) {
    return {
      mode: 'selected',
      shape,
      position,
    }
  }

  if (shape) {
    return {
      mode: 'shape',
      shape,
      position,
    }
  }

  if (position) {
    return {
      mode: 'position',
      position,
    }
  }

  return {
    mode: 'selected',
  }
}

export function parseCommand(rawText: string): ParsedCommand {
  const sourceText = rawText.trim()
  const text = normalizeCommandText(sourceText)

  if (!text) {
    return {
      action: 'unknown',
      reason: 'empty-input',
      sourceText,
    }
  }

  const action = detectAction(text)

  if (action === 'undo' || action === 'redo' || action === 'clear') {
    return {
      action,
      sourceText,
    }
  }

  if (action === 'delete') {
    return {
      action,
      target: detectTarget(text, { includePosition: true }),
      sourceText,
    }
  }

  if (action === 'move') {
    const direction = detectMoveDirection(text)

    if (direction) {
      return {
        action,
        target: detectTarget(text),
        mode: 'relative',
        direction,
        distance: 48,
        sourceText,
      }
    }

    const position = findDictionaryMatch<CommandPosition>(text, positionKeywords)

    if (!position) {
      return {
        action: 'unknown',
        reason: 'missing-position',
        sourceText,
      }
    }

    return {
      action,
      target: detectTarget(text),
      mode: 'absolute',
      position,
      sourceText,
    }
  }

  if (action === 'recolor') {
    const color = findDictionaryMatch<CommandColor>(text, colorKeywords)

    if (!color) {
      return {
        action: 'unknown',
        reason: 'missing-color',
        sourceText,
      }
    }

    return {
      action,
      target: detectTarget(text),
      color,
      sourceText,
    }
  }

  if (action === 'resize') {
    return {
      action,
      target: detectTarget(text),
      direction: includesAny(text, ['缩小', '变小']) ? 'smaller' : 'larger',
      sourceText,
    }
  }

  if (action !== 'create') {
    return {
      action: 'unknown',
      reason: 'unsupported-action',
      sourceText,
    }
  }

  const shape = findDictionaryMatch<ShapeKind>(text, shapeKeywords)

  if (!shape) {
    return {
      action: 'unknown',
      reason: 'missing-shape',
      sourceText,
    }
  }

  const color = findDictionaryMatch<CommandColor>(text, colorKeywords)
  const position = findDictionaryMatch<CommandPosition>(text, positionKeywords)
  const size = findDictionaryMatch<CommandSize>(text, sizeKeywords) ?? 'medium'
  const textContent = shape === 'text' ? extractTextContent(sourceText) : undefined

  return {
    action: 'create',
    shape,
    color,
    position,
    size,
    text: textContent,
    sourceText,
  }
}
