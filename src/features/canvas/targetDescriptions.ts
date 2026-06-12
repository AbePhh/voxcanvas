import type {
  CommandColor,
  CommandPosition,
  CommandTarget,
  ParsedCommand,
} from '../commands/types'
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

const shapeLabels = {
  circle: '圆形',
  rect: '矩形',
  triangle: '三角形',
  line: '线条',
  text: '文本',
}

const colorLabels: Record<CommandColor, string> = {
  red: '红色',
  orange: '橙色',
  yellow: '黄色',
  green: '绿色',
  blue: '蓝色',
  purple: '紫色',
  black: '黑色',
  white: '白色',
  gray: '灰色',
}

const positionLabels: Record<CommandPosition, string> = {
  'top-left': '左上方',
  top: '上方',
  'top-right': '右上方',
  left: '左侧',
  center: '中间',
  right: '右侧',
  'bottom-left': '左下方',
  bottom: '下方',
  'bottom-right': '右下方',
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
