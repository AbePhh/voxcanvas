import type { ShapeKind } from '../canvas/types'
import type { CommandColor, CommandPosition } from './types'

export const shapeLabels: Record<ShapeKind, string> = {
  circle: '圆形',
  rect: '矩形',
  triangle: '三角形',
  line: '线条',
  text: '文本',
}

export const colorLabels: Record<CommandColor, string> = {
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

export const positionLabels: Record<CommandPosition, string> = {
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
