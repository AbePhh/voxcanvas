import type { CreateShapeCommand } from '../commands/types'
import type { CanvasSnapshot, CanvasState, ShapeObject } from './types'

type ShapeStyle = {
  fill: string
  stroke: string
}

const colorStyles: Record<string, ShapeStyle> = {
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

const positionAnchors = {
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
  command: CreateShapeCommand,
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
