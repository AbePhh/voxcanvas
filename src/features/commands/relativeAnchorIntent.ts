import type { SceneRelation } from './types'

export type RelativeAdditionIntent = {
  anchorLabel: string
  objectLabel?: string
  relation: SceneRelation
  sourceText: string
}

export type AnchorReferenceGroup = {
  groupLabel: string
  displayLabel: string
  referenceLabels: string[]
}

const relationKeywords: Array<{ relation: SceneRelation; keywords: string[] }> = [
  { relation: 'right-of', keywords: ['右边', '右侧', '右方', '右面'] },
  { relation: 'left-of', keywords: ['左边', '左侧', '左方', '左面'] },
  { relation: 'above', keywords: ['上面', '上方', '上边', '顶部'] },
  { relation: 'below', keywords: ['下面', '下方', '下边', '底部'] },
  { relation: 'near', keywords: ['旁边', '附近', '边上', '旁'] },
]

const addVerbPattern =
  /^(?:再)?(?:加上|加|添加|新增|放置|放|生成|创建|插入|画|绘制)/
const leadingQuantityPattern =
  /^(?:一个|一只|一棵|一朵|一辆|一座|一条|一片|一颗|一块|一束|一艘|一台|几个|一些|个|只|棵|朵|辆|座|条|片|颗|块|束|艘|台)/

function normalizeCommandText(text: string) {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?；;：:"“”'‘’（）()[\]{}]/g, '')
    .trim()
}

function normalizeReference(text: string) {
  return normalizeCommandText(text).toLowerCase()
}

function cleanAnchorLabel(text: string) {
  return text
    .replace(/^在/, '')
    .replace(/^把/, '')
    .replace(/的$/, '')
    .replace(/里面$/, '')
    .replace(/里$/, '')
    .trim()
}

function cleanObjectLabel(text: string) {
  const withoutVerb = text.replace(addVerbPattern, '')
  const withoutQuantity = withoutVerb.replace(leadingQuantityPattern, '')

  return withoutQuantity.trim() || withoutVerb.trim() || undefined
}

function findRelation(text: string) {
  return relationKeywords
    .flatMap(({ relation, keywords }) =>
      keywords.map((keyword) => ({
        keyword,
        relation,
        index: text.indexOf(keyword),
      })),
    )
    .filter((match) => match.index > 0)
    .sort((left, right) => left.index - right.index || right.keyword.length - left.keyword.length)[0]
}

export function detectRelativeAdditionIntent(
  sourceText: string,
): RelativeAdditionIntent | null {
  const text = normalizeCommandText(sourceText)

  if (!text) {
    return null
  }

  const relationMatch = findRelation(text)

  if (!relationMatch) {
    return null
  }

  const anchorLabel = cleanAnchorLabel(text.slice(0, relationMatch.index))
  const objectText = text.slice(relationMatch.index + relationMatch.keyword.length)

  if (!anchorLabel || !addVerbPattern.test(objectText)) {
    return null
  }

  return {
    anchorLabel,
    objectLabel: cleanObjectLabel(objectText),
    relation: relationMatch.relation,
    sourceText,
  }
}

export function findAnchorReferenceGroups(
  groups: AnchorReferenceGroup[] | undefined,
  anchorLabel: string,
) {
  const normalizedAnchor = normalizeReference(anchorLabel)

  if (!normalizedAnchor) {
    return []
  }

  return (groups ?? []).filter((group) => {
    const references = [
      group.groupLabel,
      group.displayLabel,
      ...(group.referenceLabels ?? []),
    ]

    return references.some((reference) => normalizeReference(reference) === normalizedAnchor)
  })
}

export function createWholeScenePromptFromMissingAnchor(
  intent: RelativeAdditionIntent,
) {
  const objectLabel = intent.objectLabel ?? '相关内容'

  return `生成一个包含${intent.anchorLabel}和${objectLabel}的完整场景，保持${objectLabel}位于${intent.anchorLabel}的${describeRelation(intent.relation)}`
}

export function describeRelation(relation: SceneRelation) {
  const labels: Record<SceneRelation, string> = {
    'left-of': '左边',
    'right-of': '右边',
    above: '上方',
    below: '下方',
    near: '旁边',
    inside: '里面',
    around: '周围',
  }

  return labels[relation]
}
