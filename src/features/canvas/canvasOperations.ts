import type {
  CommandColor,
  CommandPosition,
  CommandTarget,
  CreateShapeCommand,
  DeleteShapeCommand,
  MoveShapeCommand,
  RecolorShapeCommand,
  ResizeShapeCommand,
} from '../commands/types'
import type { CanvasSnapshot, CanvasState, ShapeObject } from './types'

type ShapeStyle = {
  fill: string
  stroke: string
}

const colorStyles: Record<CommandColor, ShapeStyle> = {
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

const sizeScale = {
  small: 0.72,
  medium: 1,
  large: 1.36,
}

const baseSizeByShape = {
  circle: { width: 112, height: 112 },
  rect: { width: 148, height: 104 },
  triangle: { width: 144, height: 120 },
  line: { width: 180, height: 0 },
  text: { width: 220, height: 40 },
}

const positionAnchors: Record<CommandPosition, { x: number; y: number }> = {
  'top-left': { x: 0.2, y: 0.22 },
  top: { x: 0.5, y: 0.2 },
  'top-right': { x: 0.8, y: 0.22 },
  left: { x: 0.2, y: 0.52 },
  center: { x: 0.5, y: 0.52 },
  right: { x: 0.8, y: 0.52 },
  'bottom-left': { x: 0.2, y: 0.78 },
  bottom: { x: 0.5, y: 0.8 },
  'bottom-right': { x: 0.8, y: 0.78 },
}

function createShapeId(shape: string) {
  return `${shape}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function takeSnapshot(state: CanvasState): CanvasSnapshot {
  return {
    shapes: state.shapes,
    selectedId: state.selectedId,
  }
}

function restoreSnapshot(state: CanvasState, snapshot: CanvasSnapshot): CanvasState {
  return {
    ...state,
    shapes: snapshot.shapes,
    selectedId: snapshot.selectedId,
  }
}

function getShapeSize(command: CreateShapeCommand) {
  const baseSize = baseSizeByShape[command.shape]
  const scale = sizeScale[command.size]

  return {
    width: Math.round(baseSize.width * scale),
    height: Math.round(baseSize.height * scale),
  }
}

function getShapePosition(
  command: Pick<CreateShapeCommand, 'position'>,
  canvas: Pick<CanvasState, 'width' | 'height'>,
  size: Pick<ShapeObject, 'width' | 'height'>,
) {
  const anchor = positionAnchors[command.position ?? 'center']
  const x = Math.round(canvas.width * anchor.x - size.width / 2)
  const y = Math.round(canvas.height * anchor.y - size.height / 2)

  return {
    x: Math.max(24, Math.min(canvas.width - size.width - 24, x)),
    y: Math.max(24, Math.min(canvas.height - size.height - 24, y)),
  }
}

function findTargetShape(state: CanvasState, target: CommandTarget) {
  const matchesTargetFilters = (shape: ShapeObject) => {
    if (target.shape && shape.type !== target.shape) {
      return false
    }

    if (target.position) {
      const desiredAnchor = positionAnchors[target.position]
      const shapeCenterX = shape.x + shape.width / 2
      const shapeCenterY = shape.y + shape.height / 2
      const desiredX = state.width * desiredAnchor.x
      const desiredY = state.height * desiredAnchor.y
      const xTolerance = state.width * 0.22
      const yTolerance = state.height * 0.22

      return (
        Math.abs(shapeCenterX - desiredX) <= xTolerance &&
        Math.abs(shapeCenterY - desiredY) <= yTolerance
      )
    }

    return true
  }

  if (target.mode === 'selected' && state.selectedId) {
    const selectedShape = state.shapes.find((shape) => shape.id === state.selectedId)

    if (selectedShape && matchesTargetFilters(selectedShape)) {
      return selectedShape
    }
  }

  const reversedShapes = [...state.shapes].reverse()

  if (target.mode === 'last' || target.mode === 'selected') {
    return reversedShapes.find(matchesTargetFilters)
  }

  if (target.mode === 'shape' || target.mode === 'position') {
    return reversedShapes.find(matchesTargetFilters)
  }

  return reversedShapes[0]
}

function updateTargetShape(
  state: CanvasState,
  target: CommandTarget,
  updateShape: (shape: ShapeObject) => ShapeObject,
) {
  const targetShape = findTargetShape(state, target)

  if (!targetShape) {
    return state
  }

  return {
    ...state,
    future: [],
    history: [...state.history, takeSnapshot(state)],
    selectedId: targetShape.id,
    shapes: state.shapes.map((shape) =>
      shape.id === targetShape.id ? updateShape(shape) : shape,
    ),
  }
}

function clampShapePosition(
  canvas: Pick<CanvasState, 'width' | 'height'>,
  shape: Pick<ShapeObject, 'width' | 'height'>,
  x: number,
  y: number,
) {
  return {
    x: Math.max(24, Math.min(canvas.width - shape.width - 24, x)),
    y: Math.max(24, Math.min(canvas.height - shape.height - 24, y)),
  }
}

export function createShapeFromCommand(
  command: CreateShapeCommand,
  canvas: Pick<CanvasState, 'width' | 'height'>,
): ShapeObject {
  const size = getShapeSize(command)
  const position = getShapePosition(command, canvas, size)
  const style = colorStyles[command.color ?? 'blue']

  return {
    id: createShapeId(command.shape),
    type: command.shape,
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: command.shape === 'line' ? 6 : 3,
    text: command.shape === 'text' ? command.text ?? 'Text' : undefined,
    fontSize: command.shape === 'text' ? Math.round(24 * sizeScale[command.size]) : undefined,
  }
}

export function applyCreateCommand(
  state: CanvasState,
  command: CreateShapeCommand,
): CanvasState {
  const shape = createShapeFromCommand(command, state)

  return {
    ...state,
    future: [],
    history: [...state.history, takeSnapshot(state)],
    selectedId: shape.id,
    shapes: [...state.shapes, shape],
  }
}

export function applyClearCommand(state: CanvasState): CanvasState {
  if (state.shapes.length === 0) {
    return state
  }

  return {
    ...state,
    future: [],
    history: [...state.history, takeSnapshot(state)],
    selectedId: undefined,
    shapes: [],
  }
}

export function applyUndoCommand(state: CanvasState): CanvasState {
  const previousSnapshot = state.history.at(-1)

  if (!previousSnapshot) {
    return state
  }

  const nextHistory = state.history.slice(0, -1)
  const currentSnapshot = takeSnapshot(state)

  return {
    ...restoreSnapshot(state, previousSnapshot),
    future: [currentSnapshot, ...state.future],
    history: nextHistory,
  }
}

export function applyRedoCommand(state: CanvasState): CanvasState {
  const nextSnapshot = state.future[0]

  if (!nextSnapshot) {
    return state
  }

  return {
    ...restoreSnapshot(state, nextSnapshot),
    future: state.future.slice(1),
    history: [...state.history, takeSnapshot(state)],
  }
}

export function applyMoveCommand(
  state: CanvasState,
  command: MoveShapeCommand,
): CanvasState {
  return updateTargetShape(state, command.target, (shape) => {
    if (command.mode === 'relative') {
      const distance = command.distance ?? 48
      const delta = {
        x:
          command.direction === 'left'
            ? -distance
            : command.direction === 'right'
              ? distance
              : 0,
        y:
          command.direction === 'up'
            ? -distance
            : command.direction === 'down'
              ? distance
              : 0,
      }
      const position = clampShapePosition(state, shape, shape.x + delta.x, shape.y + delta.y)

      return {
        ...shape,
        x: position.x,
        y: position.y,
      }
    }

    const position = getShapePosition({ position: command.position }, state, shape)

    return {
      ...shape,
      x: position.x,
      y: position.y,
    }
  })
}

export function applyRecolorCommand(
  state: CanvasState,
  command: RecolorShapeCommand,
): CanvasState {
  const style = colorStyles[command.color]

  return updateTargetShape(state, command.target, (shape) => ({
    ...shape,
    fill: style.fill,
    stroke: style.stroke,
  }))
}

export function applyResizeCommand(
  state: CanvasState,
  command: ResizeShapeCommand,
): CanvasState {
  const scale = command.direction === 'larger' ? 1.2 : 0.82

  return updateTargetShape(state, command.target, (shape) => {
    const nextWidth = Math.max(24, Math.round(shape.width * scale))
    const nextHeight =
      shape.type === 'line' ? shape.height : Math.max(24, Math.round(shape.height * scale))
    const centerX = shape.x + shape.width / 2
    const centerY = shape.y + shape.height / 2

    return {
      ...shape,
      width: nextWidth,
      height: nextHeight,
      fontSize: shape.fontSize ? Math.max(12, Math.round(shape.fontSize * scale)) : undefined,
      x: Math.round(centerX - nextWidth / 2),
      y: Math.round(centerY - nextHeight / 2),
    }
  })
}

export function applyDeleteCommand(
  state: CanvasState,
  command: DeleteShapeCommand,
): CanvasState {
  const targetShape = findTargetShape(state, command.target)

  if (!targetShape) {
    return state
  }

  return {
    ...state,
    future: [],
    history: [...state.history, takeSnapshot(state)],
    selectedId: undefined,
    shapes: state.shapes.filter((shape) => shape.id !== targetShape.id),
  }
}
