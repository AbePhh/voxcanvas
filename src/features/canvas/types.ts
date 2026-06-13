export type ShapeKind = 'circle' | 'rect' | 'triangle' | 'line' | 'text'

export type ShapeObject = {
  id: string
  type: ShapeKind
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  fill: string
  stroke: string
  strokeWidth?: number
  text?: string
  fontSize?: number
  groupId?: string
  groupLabel?: string
  partLabel?: string
  zIndex?: number
}

export type CanvasSnapshot = {
  width: number
  height: number
  shapes: ShapeObject[]
  selectedId?: string
  selectedGroupId?: string
}

export type CanvasState = {
  width: number
  height: number
  shapes: ShapeObject[]
  selectedId?: string
  selectedGroupId?: string
  history: CanvasSnapshot[]
  future: CanvasSnapshot[]
}
