import type {
  SpatialMoveAlignment,
  SpatialMoveRelation,
} from './types'

export type SpatialMoveIntent = {
  targetLabel?: string
  referenceLabel: string
  relation: SpatialMoveRelation
  align?: SpatialMoveAlignment
  gap?: number
  sourceText: string
}

const relationKeywords: Array<{ relation: SpatialMoveRelation; keywords: string[] }> = [
  { relation: 'right-of', keywords: ['右边', '右侧', '右方', '右面'] },
  { relation: 'left-of', keywords: ['左边', '左侧', '左方', '左面'] },
  { relation: 'above', keywords: ['上方', '上面', '上边', '顶部'] },
  { relation: 'below', keywords: ['下方', '下面', '下边', '底部'] },
]

const placementMarkers = [
  '移动到',
  '移到',
  '挪到',
  '搬到',
  '放到',
  '放在',
  '摆到',
  '摆在',
  '移动在',
  '挪在',
  '到',
  '在',
]

const touchingPattern =
  /^(?<target>.+?)(?:的)?(?:底部|底边|下边|下沿)(?:贴着|贴到|靠着|靠到|挨着|对齐到|对齐)(?<reference>.+)$/

function normalizeCommandText(text: string) {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?；;：:"“”'‘’（）()[\]{}]/g, '')
    .trim()
}

function trimTrailingRelationParticle(text: string) {
  return text.replace(/的$/, '').replace(/上$/, '').replace(/下$/, '').trim()
}

function cleanLabel(text: string) {
  return trimTrailingRelationParticle(text)
    .replace(/^(?:请|帮我|麻烦|把|将|让)/, '')
    .replace(/^(?:这颗|这棵|这个|这一个|这|那颗|那棵|那个|那一个|那|当前|选中|被选中)/, '')
    .replace(/(?:的)?(?:整体|全部|整个|整棵|整颗)$/, '')
    .replace(/(?:的)?(?:底部|底边|下边|下沿|顶部|顶端|上边|上沿)$/, '')
    .replace(/的$/, '')
    .trim()
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

function splitPlacementPrefix(prefix: string) {
  const markerMatch = placementMarkers
    .map((marker) => ({
      marker,
      index: prefix.lastIndexOf(marker),
    }))
    .filter((match) => match.index > 0)
    .sort((left, right) => right.index - left.index || right.marker.length - left.marker.length)[0]

  if (!markerMatch) {
    return null
  }

  return {
    targetText: prefix.slice(0, markerMatch.index),
    referenceText: prefix.slice(markerMatch.index + markerMatch.marker.length),
  }
}

function isSurfaceReference(referenceLabel: string) {
  return /地面|地平线|水平线|地板|地线|地表|草地/.test(referenceLabel)
}

function getDefaultGap(referenceLabel: string, relation: SpatialMoveRelation) {
  return relation === 'above' && isSurfaceReference(referenceLabel) ? 0 : undefined
}

export function detectSpatialMoveIntent(sourceText: string): SpatialMoveIntent | null {
  const text = normalizeCommandText(sourceText)

  if (!text) {
    return null
  }

  const touchingMatch = text.match(touchingPattern)

  if (touchingMatch?.groups?.reference) {
    const targetLabel = cleanLabel(touchingMatch.groups.target)
    const referenceLabel = cleanLabel(touchingMatch.groups.reference)

    if (referenceLabel) {
      return {
        targetLabel: targetLabel || undefined,
        referenceLabel,
        relation: 'above',
        align: 'preserve',
        gap: 0,
        sourceText,
      }
    }
  }

  const relationMatch = findRelation(text)

  if (!relationMatch) {
    return null
  }

  const prefix = text.slice(0, relationMatch.index)
  const placementParts = splitPlacementPrefix(prefix)

  if (!placementParts) {
    return null
  }

  const targetLabel = cleanLabel(placementParts.targetText)
  const referenceLabel = cleanLabel(placementParts.referenceText)

  if (!referenceLabel) {
    return null
  }

  return {
    targetLabel: targetLabel || undefined,
    referenceLabel,
    relation: relationMatch.relation,
    align: 'preserve',
    gap: getDefaultGap(referenceLabel, relationMatch.relation),
    sourceText,
  }
}
