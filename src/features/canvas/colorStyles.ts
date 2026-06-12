import type { CommandColor } from '../commands/types'

export type ShapeStyle = {
  fill: string
  stroke: string
}

export const colorStyles: Record<CommandColor, ShapeStyle> = {
  red: { fill: '#ef4444', stroke: '#991b1b' },
  orange: { fill: '#f97316', stroke: '#9a3412' },
  yellow: { fill: '#facc15', stroke: '#a16207' },
  green: { fill: '#22c55e', stroke: '#166534' },
  blue: { fill: '#3b82f6', stroke: '#1e40af' },
  purple: { fill: '#a855f7', stroke: '#6b21a8' },
  black: { fill: '#111827', stroke: '#020617' },
  white: { fill: '#ffffff', stroke: '#94a3b8' },
  gray: { fill: '#9ca3af', stroke: '#4b5563' },
}

export function matchesCommandColor(fill: string, color: CommandColor) {
  return fill.toLowerCase() === colorStyles[color].fill.toLowerCase()
}
