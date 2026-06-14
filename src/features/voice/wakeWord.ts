export type WakeCommandResult =
  | {
      status: 'command'
      rawText: string
      commandText: string
      wakeWord: string
      confidence: 'exact' | 'alias' | 'fuzzy'
    }
  | {
      status: 'wake-only'
      rawText: string
      wakeWord: string
      confidence: 'exact' | 'alias' | 'fuzzy'
    }
  | {
      status: 'ignored'
      rawText: string
    }

type WakeWordMatch = {
  index: number
  length: number
  wakeWord: string
  confidence: 'exact' | 'alias' | 'fuzzy'
}

const canonicalWakeWord = '智能绘图'

const wakeWordAliases = [
  '智能画图',
  '智能绘画',
  '智能会图',
  '智能汇图',
  '只能绘图',
  '小画助手',
  '开始绘图',
  '语音绘图',
]

const wakeWordLikePatterns = [
  /智\s*能\s*[绘会汇]\s*[图画]/,
  /只\s*能\s*绘\s*图/,
  /小\s*画\s*助\s*手/,
]

const commandIntentPattern =
  /(画|绘制|生成|创建|添加|新增|加|放|移动|移|挪|删除|删|改|变成|变为|换成|放大|缩小|导出|保存|清空|撤销|重做|对齐|排列|排成|锁定|解锁|调整|变宽|变高)/

function normalizeForMatch(text: string) {
  return text.replace(/\s+/g, '')
}

function trimCommandPrefix(text: string) {
  return text.replace(/^[，,。.!！?？:：;；\s]+/, '').trim()
}

function createLiteralPattern(value: string) {
  return new RegExp(value.split('').join('\\s*'))
}

function findLiteralWakeWord(sourceText: string): WakeWordMatch | null {
  const candidates = [
    { wakeWord: canonicalWakeWord, confidence: 'exact' as const },
    ...wakeWordAliases.map((wakeWord) => ({
      wakeWord,
      confidence: 'alias' as const,
    })),
  ]

  for (const candidate of candidates) {
    const match = createLiteralPattern(candidate.wakeWord).exec(sourceText)

    if (match) {
      return {
        index: match.index,
        length: match[0].length,
        wakeWord: candidate.wakeWord,
        confidence: candidate.confidence,
      }
    }
  }

  return null
}

function findFuzzyWakeWord(sourceText: string): WakeWordMatch | null {
  for (const pattern of wakeWordLikePatterns) {
    const match = pattern.exec(sourceText)

    if (match) {
      return {
        index: match.index,
        length: match[0].length,
        wakeWord: match[0],
        confidence: 'fuzzy',
      }
    }
  }

  return null
}

function hasLikelyCommandIntent(text: string) {
  return commandIntentPattern.test(normalizeForMatch(text))
}

export function extractWakeCommand(rawText: string): WakeCommandResult {
  const sourceText = rawText.trim()

  if (!sourceText) {
    return {
      status: 'ignored',
      rawText,
    }
  }

  const wakeWordMatch = findLiteralWakeWord(sourceText) ?? findFuzzyWakeWord(sourceText)

  if (!wakeWordMatch) {
    return {
      status: 'ignored',
      rawText,
    }
  }

  const commandText = trimCommandPrefix(
    sourceText.slice(wakeWordMatch.index + wakeWordMatch.length),
  )

  if (!commandText) {
    return {
      status: 'wake-only',
      rawText,
      wakeWord: wakeWordMatch.wakeWord,
      confidence: wakeWordMatch.confidence,
    }
  }

  if (wakeWordMatch.confidence === 'fuzzy' && !hasLikelyCommandIntent(commandText)) {
    return {
      status: 'ignored',
      rawText,
    }
  }

  return {
    status: 'command',
    rawText,
    commandText,
    wakeWord: wakeWordMatch.wakeWord,
    confidence: wakeWordMatch.confidence,
  }
}
