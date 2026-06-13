export type SemanticShapeLike = {
  id: string
  x: number
  y: number
  width: number
  height: number
  groupId?: string
  groupLabel?: string
  partLabel?: string
  zIndex?: number
}

export type SemanticGroupSummary = {
  id: string
  groupId?: string
  groupLabel: string
  displayLabel: string
  referenceLabels: string[]
  partLabels: string[]
  objectIds: string[]
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  selected: boolean
}

type SemanticGroupDraft<TShape extends SemanticShapeLike> = {
  id: string
  groupId?: string
  groupLabel: string
  shapes: Array<{ shape: TShape; index: number }>
  firstIndex: number
}

const chineseOrdinals = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

function hasSemanticMetadata(shape: SemanticShapeLike) {
  return Boolean(shape.groupId || shape.groupLabel || shape.partLabel)
}

function getGroupKey(shape: SemanticShapeLike, index: number) {
  return shape.groupId ?? shape.groupLabel ?? shape.partLabel ?? `shape-${index}`
}

function getGroupLabel(shape: SemanticShapeLike) {
  return shape.groupLabel ?? shape.partLabel ?? shape.groupId ?? shape.id
}

function getBounds(shapes: SemanticShapeLike[]) {
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

function normalizeReferenceLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?（）()【】[\]{}"'“”‘’]/g, '')
    .trim()
}

function getOrdinalReferenceLabels(label: string, ordinal?: number) {
  if (!ordinal) {
    return []
  }

  const chineseOrdinal = chineseOrdinals[ordinal - 1]
  const references = [`${label} ${ordinal}`, `${ordinal}号${label}`]

  if (chineseOrdinal) {
    references.push(
      `第${chineseOrdinal}棵${label}`,
      `第${chineseOrdinal}个${label}`,
    )
  }

  references.push(`${label}${ordinal}`, `${label}-${ordinal}`, `第${ordinal}个${label}`)

  return references
}

function uniqueReferences(references: Array<string | undefined>) {
  const seen = new Set<string>()

  return references
    .filter((reference): reference is string => Boolean(reference?.trim()))
    .filter((reference) => {
      const normalized = normalizeReferenceLabel(reference)

      if (!normalized || seen.has(normalized)) {
        return false
      }

      seen.add(normalized)
      return true
    })
}

export function createSemanticGroupSummaries<TShape extends SemanticShapeLike>(
  shapes: TShape[],
  options: { selectedId?: string; selectedGroupId?: string } = {},
): SemanticGroupSummary[] {
  const drafts = new Map<string, SemanticGroupDraft<TShape>>()

  shapes.forEach((shape, index) => {
    if (!hasSemanticMetadata(shape)) {
      return
    }

    const groupKey = getGroupKey(shape, index)
    const existingDraft = drafts.get(groupKey)

    if (existingDraft) {
      existingDraft.shapes.push({ shape, index })
      return
    }

    drafts.set(groupKey, {
      id: groupKey,
      groupId: shape.groupId,
      groupLabel: getGroupLabel(shape),
      shapes: [{ shape, index }],
      firstIndex: index,
    })
  })

  const orderedDrafts = Array.from(drafts.values()).sort(
    (left, right) => left.firstIndex - right.firstIndex,
  )
  const labelCounts = orderedDrafts.reduce((counts, draft) => {
    counts.set(draft.groupLabel, (counts.get(draft.groupLabel) ?? 0) + 1)
    return counts
  }, new Map<string, number>())
  const seenLabels = new Map<string, number>()

  return orderedDrafts.map((draft) => {
    const duplicateCount = labelCounts.get(draft.groupLabel) ?? 0
    const ordinal =
      duplicateCount > 1 ? (seenLabels.get(draft.groupLabel) ?? 0) + 1 : undefined

    if (ordinal) {
      seenLabels.set(draft.groupLabel, ordinal)
    }

    const draftShapes = draft.shapes.map(({ shape }) => shape)
    const objectIds = draftShapes.map((shape) => shape.id)
    const displayLabel = ordinal ? `${draft.groupLabel} ${ordinal}` : draft.groupLabel
    const referenceLabels = uniqueReferences([
      ordinal ? undefined : draft.groupLabel,
      displayLabel,
      ...getOrdinalReferenceLabels(draft.groupLabel, ordinal),
      draft.groupId,
    ])

    return {
      id: draft.id,
      groupId: draft.groupId,
      groupLabel: draft.groupLabel,
      displayLabel,
      referenceLabels,
      partLabels: uniqueReferences(draftShapes.map((shape) => shape.partLabel)),
      objectIds,
      bounds: getBounds(draftShapes),
      selected:
        Boolean(options.selectedGroupId && draft.groupId === options.selectedGroupId) ||
        objectIds.some((id) => id === options.selectedId),
    }
  })
}

export function findSemanticGroupsByReference(
  groups: SemanticGroupSummary[],
  reference: string,
) {
  const normalizedReference = normalizeReferenceLabel(reference)

  if (!normalizedReference) {
    return []
  }

  return groups.filter((group) =>
    group.referenceLabels.some(
      (label) => normalizeReferenceLabel(label) === normalizedReference,
    ),
  )
}
