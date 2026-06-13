import type {
  CommandColor,
  CommandPosition,
  CommandSize,
} from './types'
import type { ShapeKind } from '../canvas/types'

export const shapeKeywords: Record<ShapeKind, string[]> = {
  circle: ['圆', '圆形', '圆圈', '圈', '椭圆'],
  rect: ['矩形', '长方形', '正方形', '方形', '方块'],
  triangle: ['三角形', '三角'],
  line: ['线', '直线', '线条', '横线', '竖线'],
  text: ['文字', '文本', '文本框', '标签'],
}

export const colorKeywords: Record<CommandColor, string[]> = {
  red: ['红', '红色'],
  orange: ['橙', '橙色', '橘', '橘色'],
  yellow: ['黄', '黄色', '金色'],
  green: ['绿', '绿色'],
  blue: ['蓝', '蓝色'],
  purple: ['紫', '紫色'],
  black: ['黑', '黑色'],
  white: ['白', '白色'],
  gray: ['灰', '灰色'],
}

export const positionKeywords: Record<CommandPosition, string[]> = {
  'top-left': ['左上', '左上角', '左上方'],
  top: ['上方', '顶部', '上面', '正上方'],
  'top-right': ['右上', '右上角', '右上方'],
  left: ['左边', '左侧'],
  center: ['中间', '中央', '居中', '中心'],
  right: ['右边', '右侧'],
  'bottom-left': ['左下', '左下角', '左下方'],
  bottom: ['下方', '底部', '下面', '正下方'],
  'bottom-right': ['右下', '右下角', '右下方'],
}

export const sizeKeywords: Record<CommandSize, string[]> = {
  small: ['小', '小一点', '小号'],
  medium: ['中等', '中号', '普通'],
  large: ['大', '大一点', '大号', '巨大'],
}
