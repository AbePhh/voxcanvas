import type { CommandPosition, CommandTarget } from '../commands/types'
import { matchesCommandColor } from './colorStyles'
import {
  createSemanticGroupSummaries,
  findSemanticGroupsByReference,
} from './semanticGroups'
import type { CanvasState, ShapeObject } from './types'

export const positionAnchors: Record<CommandPosition, { x: number; y: number }> = {
  'top-left': { x: 0.2, y: 0.22 },
  top: { x: 0.5, y: 0.2 },
  'top-right': { x: 0.8, y: 0.22 },
  left: { x: 0.2, y: 0.52 },
  center: { x: 0.5, y: 0.52 },
  right: { x: 0.8, y: 0.52 },
  'bottom-left': { x: 0.2, y: 0.78 },
  bottom: { x: 0.5, y: 0.8 },
  'bottom-right': { x: 0.8, y: 0.78 },
}

export type TargetMatchResult =
  | {
      status: 'matched'
      shape: ShapeObject
      matches: ShapeObject[]
    }
  | {
      status: 'missing'
      matches: ShapeObject[]
    }
  | {
      status: 'ambiguous'
      matches: ShapeObject[]
    }

export type TargetSelectionResult =
  | {
      status: 'matched'
      shapes: ShapeObject[]
      matches: ShapeObject[]
    }
  | {
      status: 'missing'
      matches: ShapeObject[]
    }
  | {
      status: 'ambiguous'
      matches: ShapeObject[]
    }

export type TargetUnit = {
  id: string
  label?: string
  shapes: ShapeObject[]
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
}

export type TargetUnitSelectionResult =
  | {
      status: 'matched'
      units: TargetUnit[]
      matches: ShapeObject[]
    }
  | {
      status: 'missing'
      matches: ShapeObject[]
    }
  | {
      status: 'ambiguous'
      matches: ShapeObject[]
    }

export function matchesTargetPosition(
  shape: Pick<ShapeObject, 'x' | 'y' | 'width' | 'height'>,
  canvas: Pick<CanvasState, 'width' | 'height'>,
  position: CommandPosition,
) {
  const desiredAnchor = positionAnchors[position]
  const shapeCenterX = shape.x + shape.width / 2
  const shapeCenterY = shape.y + shape.height / 2
  const desiredX = canvas.width * desiredAnchor.x
  const desiredY = canvas.height * desiredAnchor.y
  const xTolerance = canvas.width * 0.22
  const yTolerance = canvas.height * 0.22

  return (
    Math.abs(shapeCenterX - desiredX) <= xTolerance &&
    Math.abs(shapeCenterY - desiredY) <= yTolerance
  )
}

export function matchesTargetFilters(
  shape: ShapeObject,
  target: CommandTarget,
  canvas: Pick<CanvasState, 'width' | 'height'>,
) {
  if (target.id && shape.id !== target.id) {
    return false
  }

  if (target.shape && shape.type !== target.shape) {
    return false
  }

  if (target.color && !matchesCommandColor(shape.fill, target.color)) {
    return false
  }

  if (target.position && !matchesTargetPosition(shape, canvas, target.position)) {
    return false
  }

  if (target.groupId && shape.groupId !== target.groupId) {
    return false
  }

  if (target.groupLabel && shape.groupLabel !== target.groupLabel) {
    return false
  }

  if (target.partLabel && shape.partLabel !== target.partLabel) {
    return false
  }

  return true
}

function shouldPreferPrimitiveShapeMatches(target: CommandTarget) {
  return (
    target.mode === 'shape' &&
    Boolean(target.shape) &&
    !target.id &&
    !target.groupId &&
    !target.groupLabel &&
    !target.partLabel
  )
}

function getTargetMatches(state: CanvasState, target: CommandTarget) {
  const matches = state.shapes.filter((shape) =>
    matchesTargetFilters(shape, target, state),
  )

  if (!shouldPreferPrimitiveShapeMatches(target)) {
    return matches
  }

  const primitiveMatches = matches.filter(
    (shape) => !shape.groupId && !shape.groupLabel && !shape.partLabel,
  )

  return primitiveMatches.length > 0 ? primitiveMatches : matches
}

function getShapesBounds(shapes: ShapeObject[]) {
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

function normalizeSemanticTargetReference(
  state: CanvasState,
  target: CommandTarget,
): CommandTarget {
  if (target.mode !== 'semantic' || target.groupId || !target.groupLabel) {
    return target
  }

  if (target.scope === 'all') {
    return target
  }

  const groups = createSemanticGroupSummaries(state.shapes, {
    selectedId: state.selectedId,
    selectedGroupId: state.selectedGroupId,
  })
  const matchingGroups = findSemanticGroupsByReference(groups, target.groupLabel)
  const selectedMatch = matchingGroups.find(
    (group) => group.groupId && group.groupId === state.selectedGroupId,
  )
  const matchedGroup = selectedMatch ?? (matchingGroups.length === 1 ? matchingGroups[0] : null)

  if (!matchedGroup?.groupId) {
    return target
  }

  return {
    ...target,
    groupId: matchedGroup.groupId,
    groupLabel: matchedGroup.groupLabel,
  }
}

function createTargetUnit(
  id: string,
  shapes: ShapeObject[],
  label?: string,
): TargetUnit {
  return {
    id,
    label,
    shapes,
    bounds: getShapesBounds(shapes),
  }
}

function createUnitsFromShapes(shapes: ShapeObject[], target: CommandTarget) {
  if (shapes.length === 0) {
    return []
  }

  if (target.mode !== 'semantic') {
    return shapes.map((shape) =>
      createTargetUnit(shape.id, [shape], shape.groupLabel ?? shape.id),
    )
  }

  const groups = new Map<string, ShapeObject[]>()

  for (const shape of shapes) {
    const groupKey = shape.groupId ?? shape.groupLabel ?? shape.id
    const partKey = target.partLabel ? shape.partLabel ?? shape.id : ''
    const key = `${groupKey}:${partKey}`
    const groupShapes = groups.get(key) ?? []

    groupShapes.push(shape)
    groups.set(key, groupShapes)
  }

  return Array.from(groups.entries()).map(([key, groupShapes]) => {
    const representative = groupShapes[0]
    const label = target.partLabel
      ? [representative.groupLabel, target.partLabel].filter(Boolean).join('/')
      : representative.groupLabel ?? representative.groupId ?? key

    return createTargetUnit(key, groupShapes, label)
  })
}

function filterTargetUnitsByCount(
  units: TargetUnit[],
  target: CommandTarget,
): TargetUnitSelectionResult | null {
  if (target.count === undefined) {
    return null
  }

  if (units.length === target.count) {
    return null
  }

  return {
    status: units.length < target.count ? 'missing' : 'ambiguous',
    matches: units.flatMap((unit) => unit.shapes),
  }
}

function createTargetUnitResult(
  units: TargetUnit[],
  matches: ShapeObject[],
  target: CommandTarget,
): TargetUnitSelectionResult {
  if (units.length === 0) {
    return {
      status: 'missing',
      matches,
    }
  }

  const countResult = filterTargetUnitsByCount(units, target)

  if (countResult) {
    return countResult
  }

  if (target.scope === 'all' || target.count !== undefined) {
    return {
      status: 'matched',
      units,
      matches,
    }
  }

  return units.length === 1
    ? {
        status: 'matched',
        units,
        matches,
      }
    : {
        status: 'ambiguous',
        matches,
      }
}

function resolveSemanticSelection(
  state: CanvasState,
  target: CommandTarget,
): TargetSelectionResult {
  const normalizedTarget = normalizeSemanticTargetReference(state, target)
  const matchedShapes = getTargetMatches(state, normalizedTarget)

  if (matchedShapes.length === 0) {
    return {
      status: 'missing',
      matches: [],
    }
  }

  if (normalizedTarget.id) {
    return matchedShapes.length === 1
      ? {
          status: 'matched',
          shapes: matchedShapes,
          matches: matchedShapes,
        }
      : {
          status: 'ambiguous',
          matches: matchedShapes,
        }
  }

  if (!normalizedTarget.groupId && state.selectedGroupId) {
    const selectedGroupShapes = matchedShapes.filter(
      (shape) => shape.groupId === state.selectedGroupId,
    )

    if (selectedGroupShapes.length > 0) {
      return {
        status: 'matched',
        shapes: selectedGroupShapes,
        matches: selectedGroupShapes,
      }
    }
  }

  const groupKeys = new Set(
    matchedShapes.map((shape) => {
      const groupKey = shape.groupId ?? shape.groupLabel ?? shape.id
      const partKey = normalizedTarget.partLabel ? shape.partLabel ?? shape.id : ''

      return `${groupKey}:${partKey}`
    }),
  )

  if (groupKeys.size !== 1) {
    return {
      status: 'ambiguous',
      matches: matchedShapes,
    }
  }

  return {
    status: 'matched',
    shapes: matchedShapes,
    matches: matchedShapes,
  }
}

function canExpandSemanticReference(target: CommandTarget) {
  return !target.id && !target.shape && !target.color && !target.position && !target.partLabel
}

function getSemanticGroupShapes(state: CanvasState, groupId: string, target: CommandTarget) {
  return state.shapes.filter(
    (shape) =>
      shape.groupId === groupId &&
      matchesTargetFilters(shape, target, state),
  )
}

function resolveSelectedSemanticGroup(
  state: CanvasState,
  target: CommandTarget,
): TargetSelectionResult | null {
  if (
    target.mode !== 'selected' ||
    !state.selectedGroupId ||
    !canExpandSemanticReference(target)
  ) {
    return null
  }

  const groupShapes = getSemanticGroupShapes(state, state.selectedGroupId, target)

  if (groupShapes.length === 0) {
    return null
  }

  return {
    status: 'matched',
    shapes: groupShapes,
    matches: groupShapes,
  }
}

function resolveLastSemanticGroup(
  state: CanvasState,
  target: CommandTarget,
): TargetSelectionResult | null {
  if (target.mode !== 'last' || !canExpandSemanticReference(target)) {
    return null
  }

  const latestMatch = [...state.shapes]
    .reverse()
    .find((shape) => matchesTargetFilters(shape, target, state))

  if (!latestMatch?.groupId) {
    return null
  }

  const groupShapes = getSemanticGroupShapes(state, latestMatch.groupId, target)

  if (groupShapes.length === 0) {
    return null
  }

  return {
    status: 'matched',
    shapes: groupShapes,
    matches: groupShapes,
  }
}

export function resolveTargetSelection(
  state: CanvasState,
  target: CommandTarget,
): TargetSelectionResult {
  if (target.mode === 'semantic') {
    return resolveSemanticSelection(state, target)
  }

  const semanticReference =
    resolveSelectedSemanticGroup(state, target) ?? resolveLastSemanticGroup(state, target)

  if (semanticReference) {
    return semanticReference
  }

  const result = resolveTargetShape(state, target)

  if (result.status !== 'matched') {
    return result
  }

  return {
    status: 'matched',
    shapes: [result.shape],
    matches: result.matches,
  }
}

export function resolveTargetUnits(
  state: CanvasState,
  target: CommandTarget,
): TargetUnitSelectionResult {
  if (target.scope !== 'all' && target.count === undefined) {
    const result = resolveTargetSelection(state, target)

    return result.status === 'matched'
      ? {
          status: 'matched',
          units: [createTargetUnit('selection', result.shapes, target.groupLabel)],
          matches: result.matches,
        }
      : result
  }

  const normalizedTarget =
    target.mode === 'semantic' ? normalizeSemanticTargetReference(state, target) : target

  if (normalizedTarget.mode === 'selected') {
    const selectedShapes =
      state.selectedGroupId && canExpandSemanticReference(normalizedTarget)
        ? getSemanticGroupShapes(state, state.selectedGroupId, normalizedTarget)
        : state.shapes.filter(
            (shape) =>
              shape.id === state.selectedId &&
              matchesTargetFilters(shape, normalizedTarget, state),
          )

    return createTargetUnitResult(
      createUnitsFromShapes(selectedShapes, normalizedTarget),
      selectedShapes,
      normalizedTarget,
    )
  }

  if (normalizedTarget.mode === 'last') {
    const latestMatch = [...state.shapes]
      .reverse()
      .find((shape) => matchesTargetFilters(shape, normalizedTarget, state))

    if (!latestMatch) {
      return {
        status: 'missing',
        matches: [],
      }
    }

    const latestShapes =
      latestMatch.groupId && canExpandSemanticReference(normalizedTarget)
        ? getSemanticGroupShapes(state, latestMatch.groupId, normalizedTarget)
        : [latestMatch]

    return createTargetUnitResult(
      createUnitsFromShapes(latestShapes, normalizedTarget),
      latestShapes,
      normalizedTarget,
    )
  }

  const matches = getTargetMatches(state, normalizedTarget)
  const units = createUnitsFromShapes(matches, normalizedTarget)

  return createTargetUnitResult(units, matches, normalizedTarget)
}

export function resolveTargetShape(
  state: CanvasState,
  target: CommandTarget,
): TargetMatchResult {
  if (target.mode === 'semantic') {
    const result = resolveSemanticSelection(state, target)

    if (result.status !== 'matched') {
      return result
    }

    return result.shapes.length === 1
      ? {
          status: 'matched',
          shape: result.shapes[0],
          matches: result.matches,
        }
      : {
          status: 'ambiguous',
          matches: result.matches,
        }
  }

  const reversedMatches = getTargetMatches(state, target).reverse()

  if (target.mode === 'selected') {
    const selectedShape = state.shapes.find((shape) => shape.id === state.selectedId)

    if (selectedShape && matchesTargetFilters(selectedShape, target, state)) {
      return {
        status: 'matched',
        shape: selectedShape,
        matches: [selectedShape],
      }
    }

    return {
      status: 'missing',
      matches: [],
    }
  }

  if (target.mode === 'last') {
    const latestMatch = reversedMatches[0]

    if (!latestMatch) {
      return {
        status: 'missing',
        matches: [],
      }
    }

    return {
      status: 'matched',
      shape: latestMatch,
      matches: [latestMatch],
    }
  }

  if (reversedMatches.length === 1) {
    return {
      status: 'matched',
      shape: reversedMatches[0],
      matches: reversedMatches,
    }
  }

  return {
    status: reversedMatches.length === 0 ? 'missing' : 'ambiguous',
    matches: reversedMatches,
  }
}
