import { describe, expect, it, vi } from 'vitest'
import {
  applyClearCommand,
  applyCreateCommand,
  applyRedoCommand,
  applyUndoCommand,
  createShapeFromCommand,
} from './canvasOperations'
import type { CanvasState } from './types'

const baseCanvas: CanvasState = {
  width: 960,
  height: 560,
  shapes: [],
  history: [],
  future: [],
}

describe('canvasOperations', () => {
  it('creates a styled shape from a create command', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    vi.spyOn(Math, 'random').mockReturnValue(0.12345)

    const shape = createShapeFromCommand(
      {
        action: 'create',
        shape: 'circle',
        color: 'red',
        position: 'top-left',
        size: 'medium',
        sourceText: '画一个红色圆形，放在左上角',
      },
      baseCanvas,
    )

    expect(shape.id).toMatch(/^circle-loyw3v28-/)
    expect(shape).toMatchObject({
      type: 'circle',
      fill: '#ef4444',
      stroke: '#991b1b',
      width: 112,
      height: 112,
      x: 136,
      y: 67,
    })

    vi.restoreAllMocks()
  })

  it('appends the created shape and selects it', () => {
    const nextState = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'rect',
      color: 'blue',
      position: 'center',
      size: 'large',
      sourceText: '添加一个大的蓝色矩形',
    })

    expect(nextState.shapes).toHaveLength(1)
    expect(nextState.selectedId).toBe(nextState.shapes[0].id)
    expect(nextState.shapes[0]).toMatchObject({
      type: 'rect',
      fill: '#3b82f6',
      width: 201,
      height: 141,
    })
    expect(nextState.history).toHaveLength(1)
    expect(nextState.future).toHaveLength(0)
  })

  it('uses command text content for text shapes', () => {
    const shape = createShapeFromCommand(
      {
        action: 'create',
        shape: 'text',
        color: 'black',
        position: 'center',
        size: 'medium',
        text: '你好 VoxCanvas',
        sourceText: '添加文字内容是你好 VoxCanvas',
      },
      baseCanvas,
    )

    expect(shape).toMatchObject({
      type: 'text',
      text: '你好 VoxCanvas',
      fill: '#111827',
    })
  })

  it('clears the canvas and supports undo and redo', () => {
    const withShape = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'circle',
      color: 'green',
      position: 'center',
      size: 'medium',
      sourceText: '画一个绿色圆形',
    })
    const cleared = applyClearCommand(withShape)

    expect(cleared.shapes).toHaveLength(0)
    expect(cleared.history).toHaveLength(2)
    expect(cleared.future).toHaveLength(0)

    const undone = applyUndoCommand(cleared)

    expect(undone.shapes).toHaveLength(1)
    expect(undone.future).toHaveLength(1)

    const redone = applyRedoCommand(undone)

    expect(redone.shapes).toHaveLength(0)
    expect(redone.history).toHaveLength(2)
    expect(redone.future).toHaveLength(0)
  })

  it('returns the same state when undo, redo, or clear cannot be applied', () => {
    expect(applyUndoCommand(baseCanvas)).toBe(baseCanvas)
    expect(applyRedoCommand(baseCanvas)).toBe(baseCanvas)
    expect(applyClearCommand(baseCanvas)).toBe(baseCanvas)
  })
})
