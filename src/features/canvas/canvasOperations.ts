import type {
  AddSceneObjectCommand,
  BatchCommand,
  BatchStepCommand,
  CanvasResizeAnchor,
  CommandTarget,
  CreateShapeCommand,
  DeleteShapeCommand,
  MoveShapeCommand,
  RecolorShapeCommand,
  ResizeCanvasCommand,
  ResizeShapeCommand,
  SceneCommand,
} from '../commands/types'
import { colorStyles } from './colorStyles'
import {
  positionAnchors,
  resolveTargetSelection,
} from './targetMatching'
import { createShapesFromSceneCommand } from './sceneGraph'
import type { CanvasSnapshot, CanvasState, ShapeObject } from './types'

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

function createShapeId(shape: string) {
  return `${shape}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function takeSnapshot(state: CanvasState): CanvasSnapshot {
  return {
    width: state.width,
    height: state.height,
    shapes: state.shapes,
    selectedId: state.selectedId,
    selectedGroupId: state.selectedGroupId,
  }
}

function restoreSnapshot(state: CanvasState, snapshot: CanvasSnapshot): CanvasState {
  return {
    ...state,
    width: snapshot.width,
    height: snapshot.height,
    shapes: snapshot.shapes,
    selectedId: snapshot.selectedId,
    selectedGroupId: snapshot.selectedGroupId,
  }
}

function getLastSceneGroupId(shapes: ShapeObject[]) {
  return [...shapes].reverse().find((shape) => shape.groupId)?.groupId
}

function clampCanvasDimension(value: number) {
  return Math.max(320, Math.min(2400, Math.round(value)))
}

function getCanvasResizeOffset(
  widthDelta: number,
  heightDelta: number,
  anchor: CanvasResizeAnchor = 'center',
) {
  const horizontalAnchor = anchor.includes('left')
    ? 'left'
    : anchor.includes('right')
      ? 'right'
      : anchor
  const verticalAnchor = anchor.includes('top')
    ? 'top'
    : anchor.includes('bottom')
      ? 'bottom'
      : anchor

  return {
    x:
      horizontalAnchor === 'left'
        ? widthDelta
        : horizontalAnchor === 'right'
          ? 0
          : Math.round(widthDelta / 2),
    y:
      verticalAnchor === 'top'
        ? heightDelta
        : verticalAnchor === 'bottom'
          ? 0
          : Math.round(heightDelta / 2),
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

function findTargetShapes(state: CanvasState, target: CommandTarget) {
  const result = resolveTargetSelection(state, target)
  return result.status === 'matched' ? result.shapes : []
}

function getSharedGroupId(shapes: ShapeObject[]) {
  const groupIds = new Set(
    shapes.flatMap((shape) => (shape.groupId ? [shape.groupId] : [])),
  )

  return groupIds.size === 1 ? Array.from(groupIds)[0] : undefined
}

function updateTargetShapes(
  state: CanvasState,
  target: CommandTarget,
  updateShape: (shape: ShapeObject, selectedShapes: ShapeObject[]) => ShapeObject,
) {
  const targetShapes = findTargetShapes(state, target)

  if (targetShapes.length === 0) {
    return state
  }

  const targetIds = new Set(targetShapes.map((shape) => shape.id))

  return {
    ...state,
    future: [],
    history: [...state.history, takeSnapshot(state)],
    selectedId: targetShapes.at(-1)?.id,
    selectedGroupId:
      targetShapes.length > 1 || target.mode === 'semantic'
        ? getSharedGroupId(targetShapes)
        : undefined,
    shapes: state.shapes.map((shape) =>
      targetIds.has(shape.id) ? updateShape(shape, targetShapes) : shape,
    ),
  }
}

function getShapesBounds(shapes: ShapeObject[]) {
  const minX = Math.min(...shapes.map((shape) => shape.x))
  const minY = Math.min(...shapes.map((shape) => shape.y))
  const maxX = Math.max(...shapes.map((shape) => shape.x + shape.width))
  const maxY = Math.max(...shapes.map((shape) => shape.y + shape.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function clampGroupDelta(
  canvas: Pick<CanvasState, 'width' | 'height'>,
  bounds: ReturnType<typeof getShapesBounds>,
  delta: { x: number; y: number },
) {
  return {
    x: Math.max(24 - bounds.x, Math.min(canvas.width - bounds.x - bounds.width - 24, delta.x)),
    y: Math.max(24 - bounds.y, Math.min(canvas.height - bounds.y - bounds.height - 24, delta.y)),
  }
}

function getSpatialMoveDelta(
  targetBounds: ReturnType<typeof getShapesBounds>,
  referenceBounds: ReturnType<typeof getShapesBounds>,
  command: Extract<MoveShapeCommand, { mode: 'spatial' }>,
) {
  const gap = Math.max(0, Math.min(command.gap ?? 24, 240))
  const align = command.align ?? 'preserve'
  const referenceCenterX = referenceBounds.x + referenceBounds.width / 2
  const referenceCenterY = referenceBounds.y + referenceBounds.height / 2
  let nextX = targetBounds.x
  let nextY = targetBounds.y

  if (command.relation === 'left-of') {
    nextX = referenceBounds.x - targetBounds.width - gap
    nextY =
      align === 'preserve'
        ? targetBounds.y
        : align === 'start'
        ? referenceBounds.y
        : align === 'end'
          ? referenceBounds.y + referenceBounds.height - targetBounds.height
          : referenceCenterY - targetBounds.height / 2
  }

  if (command.relation === 'right-of') {
    nextX = referenceBounds.x + referenceBounds.width + gap
    nextY =
      align === 'preserve'
        ? targetBounds.y
        : align === 'start'
        ? referenceBounds.y
        : align === 'end'
          ? referenceBounds.y + referenceBounds.height - targetBounds.height
          : referenceCenterY - targetBounds.height / 2
  }

  if (command.relation === 'above') {
    nextY = referenceBounds.y - targetBounds.height - gap
    nextX =
      align === 'preserve'
        ? targetBounds.x
        : align === 'start'
        ? referenceBounds.x
        : align === 'end'
          ? referenceBounds.x + referenceBounds.width - targetBounds.width
          : referenceCenterX - targetBounds.width / 2
  }

  if (command.relation === 'below') {
    nextY = referenceBounds.y + referenceBounds.height + gap
    nextX =
      align === 'preserve'
        ? targetBounds.x
        : align === 'start'
        ? referenceBounds.x
        : align === 'end'
          ? referenceBounds.x + referenceBounds.width - targetBounds.width
          : referenceCenterX - targetBounds.width / 2
  }

  return {
    x: Math.round(nextX - targetBounds.x),
    y: Math.round(nextY - targetBounds.y),
  }
}

function getBoundsDeltaInsideCanvas(
  canvas: Pick<CanvasState, 'width' | 'height'>,
  bounds: ReturnType<typeof getShapesBounds>,
) {
  const minX = 24
  const minY = 24
  const maxX = canvas.width - bounds.width - 24
  const maxY = canvas.height - bounds.height - 24

  return {
    x:
      bounds.width > canvas.width - 48
        ? minX - bounds.x
        : Math.max(minX - bounds.x, Math.min(maxX - bounds.x, 0)),
    y:
      bounds.height > canvas.height - 48
        ? minY - bounds.y
        : Math.max(minY - bounds.y, Math.min(maxY - bounds.y, 0)),
  }
}

function resizeShapeAroundBounds(
  shape: ShapeObject,
  bounds: ReturnType<typeof getShapesBounds>,
  scale: number,
) {
  const boundsCenterX = bounds.x + bounds.width / 2
  const boundsCenterY = bounds.y + bounds.height / 2
  const shapeCenterX = shape.x + shape.width / 2
  const shapeCenterY = shape.y + shape.height / 2
  const nextWidth = Math.max(24, Math.round(shape.width * scale))
  const nextHeight =
    shape.type === 'line' ? Math.round(shape.height * scale) : Math.max(24, Math.round(shape.height * scale))
  const nextCenterX = boundsCenterX + (shapeCenterX - boundsCenterX) * scale
  const nextCenterY = boundsCenterY + (shapeCenterY - boundsCenterY) * scale

  return {
    ...shape,
    width: nextWidth,
    height: nextHeight,
    strokeWidth: shape.strokeWidth
      ? Math.max(1, Math.round(shape.strokeWidth * scale))
      : undefined,
    fontSize: shape.fontSize
      ? Math.max(12, Math.round(shape.fontSize * scale))
      : undefined,
    x: Math.round(nextCenterX - nextWidth / 2),
    y: Math.round(nextCenterY - nextHeight / 2),
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
    selectedGroupId: undefined,
    shapes: [...state.shapes, shape],
  }
}

export function applySceneCommand(
  state: CanvasState,
  command: SceneCommand,
): CanvasState {
  return appendSceneElements(state, command)
}

export function applyAddSceneObjectCommand(
  state: CanvasState,
  command: AddSceneObjectCommand,
): CanvasState {
  return appendSceneElements(state, command)
}

function appendSceneElements(
  state: CanvasState,
  command: SceneCommand | AddSceneObjectCommand,
): CanvasState {
  const shapes = createShapesFromSceneCommand(command, state)

  if (shapes.length === 0) {
    return state
  }

  return {
    ...state,
    future: [],
    history: [...state.history, takeSnapshot(state)],
    selectedId: shapes.at(-1)?.id,
    selectedGroupId: getLastSceneGroupId(shapes),
    shapes: [...state.shapes, ...shapes],
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
    selectedGroupId: undefined,
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
  const targetShapes = findTargetShapes(state, command.target)

  if (targetShapes.length === 0) {
    return state
  }

  const bounds = getShapesBounds(targetShapes)
  let delta: { x: number; y: number }

  if (command.mode === 'relative') {
    const distance = command.distance ?? 48
    delta = {
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
  } else if (command.mode === 'spatial') {
    const referenceShapes = findTargetShapes(state, command.reference)

    if (referenceShapes.length === 0) {
      return state
    }

    const referenceBounds = getShapesBounds(referenceShapes)

    delta = getSpatialMoveDelta(bounds, referenceBounds, command)
  } else {
    const position = getShapePosition({ position: command.position }, state, bounds)

    delta = {
      x: position.x - bounds.x,
      y: position.y - bounds.y,
    }
  }

  const clampedDelta = clampGroupDelta(state, bounds, delta)

  return updateTargetShapes(state, command.target, (shape) => ({
    ...shape,
    x: shape.x + clampedDelta.x,
    y: shape.y + clampedDelta.y,
  }))
}

export function applyRecolorCommand(
  state: CanvasState,
  command: RecolorShapeCommand,
): CanvasState {
  const style = colorStyles[command.color]

  return updateTargetShapes(state, command.target, (shape) => ({
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
  const targetShapes = findTargetShapes(state, command.target)

  if (targetShapes.length === 0) {
    return state
  }

  const bounds = getShapesBounds(targetShapes)
  const resizedShapes = targetShapes.map((shape) =>
    resizeShapeAroundBounds(shape, bounds, scale),
  )
  const resizedBounds = getShapesBounds(resizedShapes)
  const correctionDelta = getBoundsDeltaInsideCanvas(state, resizedBounds)
  const resizedShapeById = new Map(
    resizedShapes.map((shape) => [
      shape.id,
      {
        ...shape,
        x: shape.x + correctionDelta.x,
        y: shape.y + correctionDelta.y,
      },
    ]),
  )

  return updateTargetShapes(state, command.target, (shape) =>
    resizedShapeById.get(shape.id) ?? shape,
  )
}

function applyBatchStepCommand(
  state: CanvasState,
  command: BatchStepCommand,
): CanvasState {
  let nextState: CanvasState

  switch (command.action) {
    case 'create':
      nextState = applyCreateCommand(state, command)
      break
    case 'delete':
      nextState = applyDeleteCommand(state, command)
      break
    case 'move':
      nextState = applyMoveCommand(state, command)
      break
    case 'recolor':
      nextState = applyRecolorCommand(state, command)
      break
    case 'resize':
      nextState = applyResizeCommand(state, command)
      break
    case 'resizeCanvas':
      nextState = applyResizeCanvasCommand(state, command)
      break
    default:
      nextState = state
  }

  if (nextState === state) {
    return state
  }

  return {
    ...nextState,
    future: state.future,
    history: state.history,
  }
}

export function applyBatchCommand(
  state: CanvasState,
  command: BatchCommand,
): CanvasState {
  const initialSnapshot = takeSnapshot(state)
  const nextState = command.commands.reduce(
    (currentState, step) => applyBatchStepCommand(currentState, step),
    state,
  )

  if (nextState === state) {
    return state
  }

  return {
    ...nextState,
    future: [],
    history: [...state.history, initialSnapshot],
  }
}

export function applyResizeCanvasCommand(
  state: CanvasState,
  command: ResizeCanvasCommand,
): CanvasState {
  const nextSize =
    command.mode === 'absolute'
      ? {
          width: command.width,
          height: command.height,
        }
      : {
          width:
            command.direction === 'wider' || command.direction === 'larger'
              ? state.width + (command.amount ?? 120)
              : command.direction === 'narrower' || command.direction === 'smaller'
                ? state.width - (command.amount ?? 120)
                : state.width,
          height:
            command.direction === 'taller' || command.direction === 'larger'
              ? state.height + (command.amount ?? 120)
              : command.direction === 'shorter' || command.direction === 'smaller'
                ? state.height - (command.amount ?? 120)
                : state.height,
        }
  const width = clampCanvasDimension(nextSize.width)
  const height = clampCanvasDimension(nextSize.height)
  const offset = getCanvasResizeOffset(
    width - state.width,
    height - state.height,
    command.anchor,
  )

  if (width === state.width && height === state.height) {
    return state
  }

  return {
    ...state,
    width,
    height,
    future: [],
    history: [...state.history, takeSnapshot(state)],
    shapes: state.shapes.map((shape) => ({
      ...shape,
      x: shape.x + offset.x,
      y: shape.y + offset.y,
    })),
  }
}

export function applyDeleteCommand(
  state: CanvasState,
  command: DeleteShapeCommand,
): CanvasState {
  const targetShapes = findTargetShapes(state, command.target)

  if (targetShapes.length === 0) {
    return state
  }

  const targetIds = new Set(targetShapes.map((shape) => shape.id))

  return {
    ...state,
    future: [],
    history: [...state.history, takeSnapshot(state)],
    selectedId: undefined,
    selectedGroupId: undefined,
    shapes: state.shapes.filter((shape) => !targetIds.has(shape.id)),
  }
}
