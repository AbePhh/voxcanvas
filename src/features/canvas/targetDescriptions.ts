import type {
  CommandColor,
  CommandPosition,
  CommandTarget,
  ParsedCommand,
} from '../commands/types'
import { colorLabels, positionLabels, shapeLabels } from '../commands/commandLabels'
import { describeSceneElement } from '../commands/scenePlan'
import { colorStyles } from './colorStyles'
import { matchesTargetPosition, resolveTargetShape } from './targetMatching'
import type { CanvasState, ShapeObject } from './types'

export type TargetCandidate = {
  id: string
  label: string
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
  const parts = [
    target.position ? positionLabels[target.position] : undefined,
    target.color ? colorLabels[target.color] : undefined,
    target.shape ? shapeLabels[target.shape] : '图形',
  ].filter(Boolean)

  return parts.join('')
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

  const result = resolveTargetShape(canvasState, command.target)

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

  const candidates = result.matches.map((shape) => ({
    id: shape.id,
    label: describeShape(shape, canvasState),
  }))

  return {
    status: 'ambiguous',
    message: `找到 ${result.matches.length} 个匹配的${targetText}，请说得更具体一些。`,
    candidates,
  }
}
