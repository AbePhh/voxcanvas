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
  | 'addSceneObject'
  | 'align'
  | 'arrange'
  | 'batch'
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
export type MoveDirection = 'left' | 'right' | 'up' | 'down'
export type SpatialMoveRelation = 'left-of' | 'right-of' | 'above' | 'below'
export type SpatialMoveAlignment = 'preserve' | 'center' | 'start' | 'end'
export type AlignAxis = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type ArrangeLayout = 'row' | 'column'

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
  mode: 'selected' | 'last' | 'shape' | 'position' | 'any' | 'semantic'
  id?: string
  shape?: ShapeKind
  position?: CommandPosition
  color?: CommandColor
  groupId?: string
  groupLabel?: string
  partLabel?: string
  scope?: 'one' | 'all'
  count?: number
}

export type MoveShapeCommand =
  | {
      action: 'move'
      target: CommandTarget
      mode: 'absolute'
      position: CommandPosition
      sourceText: string
    }
  | {
      action: 'move'
      target: CommandTarget
      mode: 'relative'
      direction: MoveDirection
      distance?: number
      sourceText: string
    }
  | {
      action: 'move'
      target: CommandTarget
      mode: 'spatial'
      reference: CommandTarget
      relation: SpatialMoveRelation
      align?: SpatialMoveAlignment
      gap?: number
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

export type AlignShapeCommand = {
  action: 'align'
  target: CommandTarget
  axis: AlignAxis
  sourceText: string
}

export type ArrangeShapeCommand = {
  action: 'arrange'
  target: CommandTarget
  layout: ArrangeLayout
  spacing?: number
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

export type SceneRelation =
  | 'left-of'
  | 'right-of'
  | 'above'
  | 'below'
  | 'near'
  | 'inside'
  | 'around'

export type SceneObjectAnchor = {
  groupId?: string
  groupLabel?: string
  partLabel?: string
  relation?: SceneRelation
}

export type AddSceneObjectCommand = {
  action: 'addSceneObject'
  title?: string
  objectLabel?: string
  anchor?: SceneObjectAnchor
  sourceText: string
  elements: SceneElement[]
}

export type BatchStepCommand =
  | ResizeCanvasCommand
  | CreateShapeCommand
  | MoveShapeCommand
  | RecolorShapeCommand
  | ResizeShapeCommand
  | DeleteShapeCommand
  | AlignShapeCommand
  | ArrangeShapeCommand

export type BatchCommand = {
  action: 'batch'
  sourceText: string
  commands: BatchStepCommand[]
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
  | AddSceneObjectCommand
  | CreateShapeCommand
  | MoveShapeCommand
  | RecolorShapeCommand
  | ResizeShapeCommand
  | DeleteShapeCommand
  | AlignShapeCommand
  | ArrangeShapeCommand
  | BatchCommand

export type UnknownCommand = {
  action: 'unknown'
  reason: string
  sourceText: string
}

export type ParsedCommand = SimpleCanvasCommand | UnknownCommand
