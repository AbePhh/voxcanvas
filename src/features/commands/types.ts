import type { ShapeKind } from '../canvas/types'

export type CommandAction =
  | 'create'
  | 'move'
  | 'recolor'
  | 'resize'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'clear'
  | 'export'
  | 'resizeCanvas'
  | 'scene'
  | 'unknown'

export type CommandColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'black'
  | 'white'
  | 'gray'

export type CommandPosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'

export type CommandSize = 'small' | 'medium' | 'large'
export type ExportFormat = 'png' | 'jpg' | 'svg'

export type CanvasResizeDirection =
  | 'larger'
  | 'smaller'
  | 'wider'
  | 'narrower'
  | 'taller'
  | 'shorter'

export type CanvasResizeAnchor =
  | 'center'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export type CreateShapeCommand = {
  action: 'create'
  shape: ShapeKind
  color?: CommandColor
  position?: CommandPosition
  size: CommandSize
  text?: string
  sourceText: string
}

export type CommandTarget = {
  mode: 'selected' | 'last' | 'shape' | 'position' | 'any'
  id?: string
  shape?: ShapeKind
  position?: CommandPosition
  color?: CommandColor
}

export type MoveShapeCommand = {
  action: 'move'
  target: CommandTarget
  mode: 'absolute' | 'relative'
  position?: CommandPosition
  direction?: 'left' | 'right' | 'up' | 'down'
  distance?: number
  sourceText: string
}

export type RecolorShapeCommand = {
  action: 'recolor'
  target: CommandTarget
  color: CommandColor
  sourceText: string
}

export type ResizeShapeCommand = {
  action: 'resize'
  target: CommandTarget
  direction: 'larger' | 'smaller'
  sourceText: string
}

export type DeleteShapeCommand = {
  action: 'delete'
  target: CommandTarget
  sourceText: string
}

export type ResizeCanvasCommand =
  | {
      action: 'resizeCanvas'
      mode: 'absolute'
      width: number
      height: number
      anchor?: CanvasResizeAnchor
      sourceText: string
    }
  | {
      action: 'resizeCanvas'
      mode: 'relative'
      direction: CanvasResizeDirection
      anchor?: CanvasResizeAnchor
      amount?: number
      sourceText: string
    }

export type SceneBBox = {
  x: number
  y: number
  width: number
  height: number
}

export type SceneElement = {
  id: string
  groupId?: string
  groupLabel?: string
  partLabel?: string
  shape: ShapeKind
  color: CommandColor
  bbox: SceneBBox
  zIndex?: number
  text?: string
}

export type SceneCommand = {
  action: 'scene'
  title?: string
  sourceText: string
  elements: SceneElement[]
}

export type SimpleCanvasCommand =
  | {
      action: 'undo' | 'redo' | 'clear'
      sourceText: string
    }
  | {
      action: 'export'
      format?: ExportFormat
      sourceText: string
    }
  | ResizeCanvasCommand
  | SceneCommand
  | CreateShapeCommand
  | MoveShapeCommand
  | RecolorShapeCommand
  | ResizeShapeCommand
  | DeleteShapeCommand

export type UnknownCommand = {
  action: 'unknown'
  reason: string
  sourceText: string
}

export type ParsedCommand = SimpleCanvasCommand | UnknownCommand
