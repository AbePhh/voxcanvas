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

  if (includesAny(text, ['画', '绘制', '创建', '添加', '生成'])) {
    return 'create'
  }

  return 'unknown'
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
