import type { ShapeKind } from '../canvas/types'

export type CommandAction = 'create' | 'undo' | 'redo' | 'clear' | 'unknown'

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

export type CreateShapeCommand = {
  action: 'create'
  shape: ShapeKind
  color?: CommandColor
  position?: CommandPosition
  size: CommandSize
  text?: string
  sourceText: string
}

export type SimpleCanvasCommand =
  | {
      action: 'undo' | 'redo' | 'clear'
      sourceText: string
    }
  | CreateShapeCommand

export type UnknownCommand = {
  action: 'unknown'
  reason: string
  sourceText: string
}

export type ParsedCommand = SimpleCanvasCommand | UnknownCommand
