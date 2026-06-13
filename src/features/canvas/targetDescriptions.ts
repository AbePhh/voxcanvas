import type {
  CommandColor,
  CommandPosition,
  CommandTarget,
  ParsedCommand,
} from '../commands/types'
import { colorLabels, positionLabels, shapeLabels } from '../commands/commandLabels'
import { describeSceneElement } from '../commands/scenePlan'
import { colorStyles } from './colorStyles'
import { matchesTargetPosition, resolveTargetSelection } from './targetMatching'
import type { CanvasState, ShapeObject } from './types'

export type TargetCandidate = {
  id: string
  label: string
  target?: CommandTarget
}

export type TargetFeedback =
  | {
      status: 'ok'
    }
  | {
      status: 'missing'
      message: string
    }
  | {
      status: 'ambiguous'
      message: string
      candidates: TargetCandidate[]
    }

function detectShapeColor(shape: ShapeObject) {
  return (Object.entries(colorStyles) as Array<[CommandColor, { fill: string }]>).find(
    ([, style]) => style.fill.toLowerCase() === shape.fill.toLowerCase(),
  )?.[0]
}

function describeShapePosition(shape: ShapeObject, canvas: CanvasState) {
  const rankedPositions = (Object.keys(positionLabels) as CommandPosition[])
    .map((position) => ({
      position,
      matches: matchesTargetPosition(shape, canvas, position),
    }))
    .filter((item) => item.matches)

  return positionLabels[rankedPositions[0]?.position ?? 'center']
}

function describeBoundsPosition(
  bounds: Pick<ShapeObject, 'x' | 'y' | 'width' | 'height'>,
  canvas: CanvasState,
) {
  const rankedPositions = (Object.keys(positionLabels) as CommandPosition[])
    .map((position) => ({
      position,
      matches: matchesTargetPosition(bounds, canvas, position),
    }))
    .filter((item) => item.matches)

  return positionLabels[rankedPositions[0]?.position ?? 'center']
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

function describeShape(shape: ShapeObject, canvas: CanvasState) {
  if (shape.groupLabel || shape.partLabel) {
    const semanticLabel = describeSceneElement({
      id: shape.id,
      groupId: shape.groupId,
      groupLabel: shape.groupLabel,
      partLabel: shape.partLabel,
      shape: shape.type,
      color: detectShapeColor(shape) ?? 'gray',
      bbox: {
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
      },
      zIndex: shape.zIndex,
      text: shape.text,
    })
    const selectedText = shape.id === canvas.selectedId ? '当前选中的' : ''

    return `${selectedText}${semanticLabel}`
  }

  const color = detectShapeColor(shape)
  const colorText = color ? colorLabels[color] : ''
  const selectedText = shape.id === canvas.selectedId ? '当前选中的' : ''

  return `${selectedText}${describeShapePosition(shape, canvas)}的${colorText}${
    shapeLabels[shape.type]
  }`
}

function describeTarget(target: CommandTarget) {
  if (target.mode === 'semantic') {
    if (target.groupLabel && target.partLabel) {
      return `${target.groupLabel}的${target.partLabel}`
    }

    return target.partLabel ?? target.groupLabel ?? target.groupId ?? '语义目标'
  }

  const parts = [
    target.position ? positionLabels[target.position] : undefined,
    target.color ? colorLabels[target.color] : undefined,
    target.shape ? shapeLabels[target.shape] : '图形',
  ].filter(Boolean)

  return parts.join('')
}

function createSemanticGroupCandidates(
  matches: ShapeObject[],
  canvasState: CanvasState,
  target: CommandTarget,
) {
  const groups = new Map<string, ShapeObject[]>()

  matches.forEach((shape) => {
    const groupKey = shape.groupId ?? shape.groupLabel ?? shape.id
    const candidateKey = target.partLabel
      ? `${groupKey}:${shape.partLabel ?? shape.id}`
      : groupKey
    const groupShapes = groups.get(candidateKey) ?? []
    groupShapes.push(shape)
    groups.set(candidateKey, groupShapes)
  })

  return Array.from(groups.entries()).map(([candidateKey, groupShapes], index) => {
    const representative = groupShapes[0]
    const bounds = getShapesBounds(groupShapes)
    const selectedText = groupShapes.some((shape) => shape.id === canvasState.selectedId)
      ? '当前选中的'
      : ''
    const label =
      representative.groupLabel && target.partLabel
        ? `${representative.groupLabel}的${target.partLabel}`
        : representative.groupLabel ?? describeShape(representative, canvasState)

    return {
      id: candidateKey || `semantic-group-${index}`,
      label: `${selectedText}${describeBoundsPosition(bounds, canvasState)}的${label}（${
        groupShapes.length
      }个部件）`,
      target: {
        ...target,
        mode: 'semantic',
        groupId: representative.groupId,
        groupLabel: representative.groupLabel,
        partLabel: target.partLabel,
        id: undefined,
      },
    } satisfies TargetCandidate
  })
}

function createTargetCandidates(
  matches: ShapeObject[],
  canvasState: CanvasState,
  target: CommandTarget,
) {
  if (target.mode === 'semantic' && !target.id) {
    return createSemanticGroupCandidates(matches, canvasState, target)
  }

  return matches.map((shape) => ({
    id: shape.id,
    label: describeShape(shape, canvasState),
  }))
}

export function createTargetFeedback(
  command: ParsedCommand,
  canvasState: CanvasState,
): TargetFeedback {
  if (!('target' in command)) {
    return {
      status: 'ok',
    }
  }

  const result = resolveTargetSelection(canvasState, command.target)

  if (result.status === 'matched') {
    return {
      status: 'ok',
    }
  }

  const targetText = describeTarget(command.target)

  if (result.status === 'missing') {
    return {
      status: 'missing',
      message: `没有找到匹配的${targetText}。请重新描述目标，或者先选中要编辑的图形。`,
    }
  }

  const candidates = createTargetCandidates(result.matches, canvasState, command.target)

  return {
    status: 'ambiguous',
    message: `找到 ${candidates.length} 个匹配的${targetText}，请说得更具体一些。`,
    candidates,
  }
}
