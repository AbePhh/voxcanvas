import type { ShapeKind } from '../canvas/types'
import {
  colorKeywords,
  positionKeywords,
  shapeKeywords,
  sizeKeywords,
} from './commandDictionaries'
import type {
  BatchCommand,
  CommandColor,
  CommandPosition,
  CommandSize,
  CreateShapeCommand,
} from './types'

const maxImplicitCreateSteps = 6
const createVerbPattern = /画|绘制|创建|添加|生成|新增/
const createVerbGlobalPattern = /画|绘制|创建|添加|生成|新增/g
const primitiveShapePattern =
  /圆形|圆圈|圆|矩形|长方形|正方形|方形|方块|三角形|三角|线条|直线/g
const sentenceEndPattern = /[。！？.!?]+/g
const punctuationSplitPattern = /[，,;；、]+/
const positionConnectorPattern =
  /(圆形|圆圈|圆|矩形|长方形|正方形|方形|方块|三角形|三角|线条|直线)的(左上角|右上角|左下角|右下角|左上方|右上方|左下方|右下方|左边|左侧|右边|右侧|上方|上面|顶部|下方|下面|底部|中间|中央|中心)$/
const relativeAnchorBeforeShapePattern =
  /的(?:左上角|右上角|左下角|右下角|左上方|右上方|左下方|右下方|左边|左侧|右边|右侧|上方|上面|顶部|下方|下面|底部|旁边|附近).*(?:圆形|圆圈|圆|矩形|长方形|正方形|方形|方块|三角形|三角|线条|直线)/

function normalizeCommandText(text: string) {
  return text.replace(/\s+/g, '').replace(sentenceEndPattern, '').trim()
}

function findDictionaryMatch<T extends string>(
  text: string,
  dictionary: Record<T, string[]>,
) {
  let bestMatch: { value: T; index: number; keywordLength: number } | null = null
  const entries = Object.entries(dictionary) as Array<[T, string[]]>

  for (const [value, keywords] of entries) {
    for (const keyword of keywords) {
      const index = text.indexOf(keyword)

      if (index < 0) {
        continue
      }

      if (
        !bestMatch ||
        index < bestMatch.index ||
        (index === bestMatch.index && keyword.length > bestMatch.keywordLength)
      ) {
        bestMatch = {
          value,
          index,
          keywordLength: keyword.length,
        }
      }
    }
  }

  return bestMatch?.value
}

function splitByCreateVerb(text: string) {
  const matches = Array.from(text.matchAll(createVerbGlobalPattern))
  const startIndexes = matches
    .map((match) => match.index)
    .filter((index): index is number => index !== undefined)

  if (startIndexes.length < 2) {
    return []
  }

  return startIndexes.map((startIndex, index) => {
    const endIndex = startIndexes[index + 1] ?? text.length

    return text.slice(startIndex, endIndex)
  })
}

function splitByPunctuation(text: string) {
  return text
    .split(punctuationSplitPattern)
    .map((clause, index) => {
      const trimmedClause = clause.trim()

      if (index > 0 && !createVerbPattern.test(trimmedClause)) {
        return `画${trimmedClause}`
      }

      return trimmedClause
    })
    .filter(Boolean)
}

function splitImplicitCreateClauses(sourceText: string) {
  const text = normalizeCommandText(sourceText)
  const repeatedVerbClauses = splitByCreateVerb(text)
  const clauses = repeatedVerbClauses.length > 0 ? repeatedVerbClauses : splitByPunctuation(text)

  return clauses
    .map((clause) => clause.replace(positionConnectorPattern, '$1在$2'))
    .filter((clause) => createVerbPattern.test(clause))
}

function parseImplicitCreateStep(clause: string): CreateShapeCommand | null {
  if (relativeAnchorBeforeShapePattern.test(clause)) {
    return null
  }

  const shape = findDictionaryMatch<ShapeKind>(clause, shapeKeywords)

  if (!shape || shape === 'text') {
    return null
  }

  return {
    action: 'create',
    shape,
    color: findDictionaryMatch<CommandColor>(clause, colorKeywords),
    position: findDictionaryMatch<CommandPosition>(clause, positionKeywords),
    size: findDictionaryMatch<CommandSize>(clause, sizeKeywords) ?? 'medium',
    sourceText: clause,
  }
}

export function hasImplicitMultiCreateIntent(sourceText: string) {
  if (!createVerbPattern.test(sourceText)) {
    return false
  }

  const shapeMatches = sourceText.match(primitiveShapePattern) ?? []

  return shapeMatches.length >= 2
}

export function createImplicitMultiCreateBatchCommand(
  sourceText: string,
): BatchCommand | null {
  if (!hasImplicitMultiCreateIntent(sourceText)) {
    return null
  }

  const clauses = splitImplicitCreateClauses(sourceText)

  if (clauses.length < 2 || clauses.length > maxImplicitCreateSteps) {
    return null
  }

  const commands = clauses.map(parseImplicitCreateStep)

  if (commands.some((command) => command === null)) {
    return null
  }

  return {
    action: 'batch',
    sourceText,
    commands: commands.filter((command): command is CreateShapeCommand => command !== null),
  }
}
