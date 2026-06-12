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
}

export type CanvasSnapshot = {
  shapes: ShapeObject[]
  selectedId?: string
}

export type CanvasState = {
  width: number
  height: number
  shapes: ShapeObject[]
  selectedId?: string
  history: CanvasSnapshot[]
  future: CanvasSnapshot[]
}
