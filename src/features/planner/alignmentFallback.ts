import { shapeKeywords } from '../commands/commandDictionaries'
import type { AlignAxis, ArrangeLayout, ParsedCommand } from '../commands/types'
import type { ShapeKind } from '../canvas/types'

const chineseCounts: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, '').replace(/[，。！？、,.!?；;]/g, '').trim()
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword))
}

function findShape(text: string): ShapeKind | undefined {
  return (Object.entries(shapeKeywords) as Array<[ShapeKind, string[]]>).find(([, keywords]) =>
    includesAny(text, keywords),
  )?.[0]
}

function findCount(text: string) {
  const digitMatch = text.match(/(\d{1,2})(?:个|只|棵|朵|条|张|块|颗|座|台|辆)?/)

  if (digitMatch) {
    return Math.max(1, Math.min(Number(digitMatch[1]), 24))
  }

  const chineseCount = Object.entries(chineseCounts).find(([word]) => text.includes(word))?.[1]

  return chineseCount ? Math.max(1, Math.min(chineseCount, 24)) : undefined
}

function findAlignAxis(text: string): AlignAxis | undefined {
  if (!text.includes('对齐')) {
    return undefined
  }

  if (includesAny(text, ['左对齐', '左边对齐', '左侧对齐'])) {
    return 'left'
  }

  if (includesAny(text, ['右对齐', '右边对齐', '右侧对齐'])) {
    return 'right'
  }

  if (includesAny(text, ['顶部对齐', '上边对齐', '上面对齐', '上方对齐'])) {
    return 'top'
  }

  if (includesAny(text, ['底部对齐', '下边对齐', '下面对齐', '下方对齐'])) {
    return 'bottom'
  }

  if (includesAny(text, ['垂直居中', '纵向居中', '竖向居中'])) {
    return 'middle'
  }

  if (includesAny(text, ['水平居中', '横向居中', '居中对齐', '中心对齐'])) {
    return 'center'
  }

  return undefined
}

function findArrangeLayout(text: string): ArrangeLayout | undefined {
  if (includesAny(text, ['排成一行', '排成一排', '横排', '横着排'])) {
    return 'row'
  }

  if (includesAny(text, ['排成一列', '排成一竖', '竖排', '竖着排'])) {
    return 'column'
  }

  return undefined
}

function createPrimitiveMultiTarget(text: string) {
  const shape = findShape(text)

  if (!shape) {
    if (includesAny(text, ['这些', '它们', '当前', '选中'])) {
      return {
        mode: 'selected',
        scope: 'all',
      } as const
    }

    return null
  }

  const count = findCount(text)
  const scope =
    count !== undefined || includesAny(text, ['所有', '全部', '全都', '这些', '它们'])
      ? 'all'
      : undefined

  return {
    mode: 'shape',
    shape,
    scope,
    count,
  } as const
}

export function createAlignmentFallbackCommand(sourceText: string): ParsedCommand | null {
  const text = normalizeText(sourceText)
  const axis = findAlignAxis(text)
  const layout = findArrangeLayout(text)

  if (!axis && !layout) {
    return null
  }

  const target = createPrimitiveMultiTarget(text)

  if (!target) {
    return null
  }

  if (axis) {
    return {
      action: 'align',
      target,
      axis,
      sourceText,
    }
  }

  return {
    action: 'arrange',
    target,
    layout: layout ?? 'row',
    spacing: 32,
    sourceText,
  }
}
