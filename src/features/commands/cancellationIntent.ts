const punctuationPattern = /[\s，。！？、,.!?；;：:"“”'‘’（）()【】[\]{}]/g

const exactCancellationPhrases = [
  '取消',
  '取消吧',
  '停下',
  '停下吧',
  '停止',
  '停止吧',
  '算了',
  '算了吧',
  '不用了',
  '不要了',
  '别执行',
  '不要执行',
  '不用执行',
  '停止执行',
  '别画了',
  '不画了',
  '不要画了',
]

const terminalCancellationPhrases = [
  ...exactCancellationPhrases,
  '别生成',
  '不要生成',
  '别画',
  '不要画',
]

const strongCancellationPhrases = [
  '别执行',
  '不要执行',
  '不用执行',
  '停止执行',
  '别画了',
  '不画了',
  '不要画了',
  '别生成',
  '不要生成',
  '不生成了',
  '算了',
]

const contentCuePhrases = [
  '写上',
  '写下',
  '写成',
  '写',
  '输入',
  '插入文字',
  '插入文本',
  '添加文字',
  '添加文本',
  '文字内容是',
  '文本内容是',
  '内容是',
  '文字是',
  '文本是',
  '标题是',
  '标签是',
  '名字叫',
  '名为',
  '叫做',
  '叫',
]

const objectSuffixPhrases = [
  '按钮',
  '图标',
  '文字',
  '文本',
  '标题',
  '标签',
  '菜单',
  '选项',
  '符号',
  '标志',
  '表情',
  '两个字',
  '几个字',
  '这几个字',
  '这句话',
]

function normalizeVoiceText(text: string) {
  return text.replace(punctuationPattern, '').trim()
}

function getSortedPhrases(phrases: string[]) {
  return [...phrases].sort((left, right) => right.length - left.length)
}

function isProtectedContentReference(
  normalizedText: string,
  phrase: string,
  index: number,
) {
  const before = normalizedText.slice(Math.max(0, index - 14), index)
  const after = normalizedText.slice(index + phrase.length, index + phrase.length + 8)

  if (objectSuffixPhrases.some((suffix) => after.startsWith(suffix))) {
    return true
  }

  return contentCuePhrases.some((cue) => before.includes(cue))
}

function findUnprotectedPhrase(normalizedText: string, phrases: string[]) {
  for (const phrase of getSortedPhrases(phrases)) {
    let index = normalizedText.indexOf(phrase)

    while (index >= 0) {
      if (!isProtectedContentReference(normalizedText, phrase, index)) {
        return phrase
      }

      index = normalizedText.indexOf(phrase, index + phrase.length)
    }
  }

  return undefined
}

function findTerminalCancellationPhrase(normalizedText: string) {
  return getSortedPhrases(terminalCancellationPhrases).find((phrase) => {
    if (!normalizedText.endsWith(phrase)) {
      return false
    }

    const phraseIndex = normalizedText.length - phrase.length

    return !isProtectedContentReference(normalizedText, phrase, phraseIndex)
  })
}

export function isCancellationIntent(rawText: string) {
  const normalizedText = normalizeVoiceText(rawText)

  if (!normalizedText) {
    return false
  }

  if (exactCancellationPhrases.includes(normalizedText)) {
    return true
  }

  if (findTerminalCancellationPhrase(normalizedText)) {
    return true
  }

  return findUnprotectedPhrase(normalizedText, strongCancellationPhrases) !== undefined
}
