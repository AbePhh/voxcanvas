import { describe, expect, it, vi } from 'vitest'
import {
  applyClearCommand,
  applyCreateCommand,
  applyDeleteCommand,
  applyMoveCommand,
  applyRecolorCommand,
  applyResizeCanvasCommand,
  applyResizeCommand,
  applyRedoCommand,
  applySceneCommand,
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
      fontSize: 24,
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

  it('moves, recolors, resizes, and deletes target shapes', () => {
    const withCircle = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'circle',
      color: 'red',
      position: 'center',
      size: 'medium',
      sourceText: '画一个红色圆形',
    })
    const moved = applyMoveCommand(withCircle, {
      action: 'move',
      target: { mode: 'selected' },
      mode: 'absolute',
      position: 'top-right',
      sourceText: '把它移到右上角',
    })

    expect(moved.shapes[0]).toMatchObject({
      x: 712,
      y: 67,
    })

    const recolored = applyRecolorCommand(moved, {
      action: 'recolor',
      target: { mode: 'selected' },
      color: 'blue',
      sourceText: '把它改成蓝色',
    })

    expect(recolored.shapes[0]).toMatchObject({
      fill: '#3b82f6',
      stroke: '#1e40af',
    })

    const resized = applyResizeCommand(recolored, {
      action: 'resize',
      target: { mode: 'selected' },
      direction: 'larger',
      sourceText: '把它放大',
    })

    expect(resized.shapes[0].width).toBeGreaterThan(recolored.shapes[0].width)
    expect(resized.history).toHaveLength(4)

    const deleted = applyDeleteCommand(resized, {
      action: 'delete',
      target: { mode: 'selected' },
      sourceText: '删除它',
    })

    expect(deleted.shapes).toHaveLength(0)
    expect(applyUndoCommand(deleted).shapes).toHaveLength(1)
  })

  it('moves a target shape by a relative offset', () => {
    const withCircle = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'circle',
      color: 'red',
      position: 'center',
      size: 'medium',
      sourceText: '画一个红色圆形',
    })
    const moved = applyMoveCommand(withCircle, {
      action: 'move',
      target: { mode: 'selected' },
      mode: 'relative',
      direction: 'right',
      distance: 48,
      sourceText: '把它往右移动一点',
    })

    expect(moved.shapes[0].x).toBe(withCircle.shapes[0].x + 48)
    expect(moved.shapes[0].y).toBe(withCircle.shapes[0].y)
  })

  it('moves the selected shape to an absolute position without filtering by that destination', () => {
    const withCircle = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'circle',
      color: 'green',
      position: 'top-left',
      size: 'medium',
      sourceText: '画一个绿色圆形',
    })

    const moved = applyMoveCommand(withCircle, {
      action: 'move',
      target: { mode: 'selected' },
      mode: 'absolute',
      position: 'bottom-right',
      sourceText: '把它移动到右下角',
    })

    expect(moved).not.toBe(withCircle)
    expect(moved.shapes[0]).toMatchObject({
      x: 712,
      y: 381,
    })
  })

  it('moves the uniquely matched shape by color and kind', () => {
    const withGreenCircle = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'circle',
      color: 'green',
      position: 'top-left',
      size: 'medium',
      sourceText: '画一个绿色圆形',
    })
    const withBlueCircle = applyCreateCommand(withGreenCircle, {
      action: 'create',
      shape: 'circle',
      color: 'blue',
      position: 'center',
      size: 'medium',
      sourceText: '画一个蓝色圆形',
    })

    const moved = applyMoveCommand(withBlueCircle, {
      action: 'move',
      target: { mode: 'shape', shape: 'circle', color: 'green' },
      mode: 'absolute',
      position: 'top-right',
      sourceText: '把绿色的圆圈移动到右上角',
    })

    expect(moved.shapes[0]).toMatchObject({
      fill: '#22c55e',
      x: 712,
      y: 67,
    })
    expect(moved.shapes[1]).toMatchObject({
      fill: '#3b82f6',
      x: withBlueCircle.shapes[1].x,
      y: withBlueCircle.shapes[1].y,
    })
  })

  it('does not apply descriptive target commands when multiple shapes match', () => {
    const withFirstCircle = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'circle',
      color: 'green',
      position: 'top-left',
      size: 'medium',
      sourceText: '画一个绿色圆形',
    })
    const withSecondCircle = applyCreateCommand(withFirstCircle, {
      action: 'create',
      shape: 'circle',
      color: 'green',
      position: 'center',
      size: 'medium',
      sourceText: '再画一个绿色圆形',
    })

    const moved = applyMoveCommand(withSecondCircle, {
      action: 'move',
      target: { mode: 'shape', shape: 'circle', color: 'green' },
      mode: 'absolute',
      position: 'top-right',
      sourceText: '把绿色的圆圈移动到右上角',
    })

    expect(moved).toBe(withSecondCircle)
  })

  it('resizes text font size with the text object', () => {
    const withText = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'text',
      color: 'black',
      position: 'center',
      size: 'medium',
      text: 'Hello',
      sourceText: '添加文字内容是Hello',
    })
    const resized = applyResizeCommand(withText, {
      action: 'resize',
      target: { mode: 'selected' },
      direction: 'larger',
      sourceText: '把它放大',
    })

    expect(resized.shapes[0].fontSize).toBeGreaterThan(withText.shapes[0].fontSize ?? 0)
  })

  it('adds canvas space on the right without moving existing shapes', () => {
    const withCircle = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'circle',
      color: 'yellow',
      position: 'top-right',
      size: 'medium',
      sourceText: '画一个黄色圆形',
    })
    const originalShape = withCircle.shapes[0]
    const resized = applyResizeCanvasCommand(withCircle, {
      action: 'resizeCanvas',
      mode: 'absolute',
      width: 1280,
      height: withCircle.height,
      anchor: 'right',
      sourceText: '把画布设置为1280x720',
    })

    expect(resized.width).toBe(1280)
    expect(resized.height).toBe(withCircle.height)
    expect(resized.shapes[0]).toEqual(originalShape)
    expect(resized.history).toHaveLength(withCircle.history.length + 1)

    const undone = applyUndoCommand(resized)

    expect(undone.width).toBe(withCircle.width)
    expect(undone.height).toBe(withCircle.height)
    expect(undone.shapes[0]).toEqual(originalShape)
  })

  it('resizes the canvas relatively within bounds', () => {
    const resized = applyResizeCanvasCommand(baseCanvas, {
      action: 'resizeCanvas',
      mode: 'relative',
      direction: 'wider',
      anchor: 'right',
      amount: 120,
      sourceText: '把画布变宽',
    })

    expect(resized.width).toBe(baseCanvas.width + 120)
    expect(resized.height).toBe(baseCanvas.height)
  })

  it('adds canvas space from the left by shifting shapes right', () => {
    const withCircle = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'circle',
      color: 'yellow',
      position: 'center',
      size: 'medium',
      sourceText: '画一个黄色圆形',
    })
    const resized = applyResizeCanvasCommand(withCircle, {
      action: 'resizeCanvas',
      mode: 'relative',
      direction: 'wider',
      anchor: 'left',
      amount: 120,
      sourceText: '画布左边加宽一点',
    })

    expect(resized.width).toBe(withCircle.width + 120)
    expect(resized.shapes[0].x).toBe(withCircle.shapes[0].x + 120)
    expect(resized.shapes[0].y).toBe(withCircle.shapes[0].y)
  })

  it('adds canvas space from the top by shifting shapes down', () => {
    const withCircle = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'circle',
      color: 'yellow',
      position: 'center',
      size: 'medium',
      sourceText: '画一个黄色圆形',
    })
    const resized = applyResizeCanvasCommand(withCircle, {
      action: 'resizeCanvas',
      mode: 'relative',
      direction: 'taller',
      anchor: 'top',
      amount: 120,
      sourceText: '画布上面加高一点',
    })

    expect(resized.height).toBe(withCircle.height + 120)
    expect(resized.shapes[0].x).toBe(withCircle.shapes[0].x)
    expect(resized.shapes[0].y).toBe(withCircle.shapes[0].y + 120)
  })

  it('expands the canvas from the center by default', () => {
    const withCircle = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'circle',
      color: 'yellow',
      position: 'center',
      size: 'medium',
      sourceText: '画一个黄色圆形',
    })
    const resized = applyResizeCanvasCommand(withCircle, {
      action: 'resizeCanvas',
      mode: 'relative',
      direction: 'larger',
      anchor: 'center',
      amount: 120,
      sourceText: '画布变大一点',
    })

    expect(resized.width).toBe(withCircle.width + 120)
    expect(resized.height).toBe(withCircle.height + 120)
    expect(resized.shapes[0].x).toBe(withCircle.shapes[0].x + 60)
    expect(resized.shapes[0].y).toBe(withCircle.shapes[0].y + 60)
  })

  it('does not fallback from selected target to the latest shape', () => {
    const withCircle = applyCreateCommand(baseCanvas, {
      action: 'create',
      shape: 'circle',
      color: 'red',
      position: 'center',
      size: 'medium',
      sourceText: '画一个红色圆形',
    })
    const withoutSelection = {
      ...withCircle,
      selectedId: undefined,
    }

    const deleted = applyDeleteCommand(withoutSelection, {
      action: 'delete',
      target: { mode: 'selected' },
      sourceText: '删除它',
    })

    expect(deleted).toBe(withoutSelection)
  })

  it('applies a scene command as one undoable operation', () => {
    const scene = applySceneCommand(baseCanvas, {
      action: 'scene',
      title: '房子和太阳',
      sourceText: '画一间房子和太阳',
      elements: [
        {
          id: 'sun',
          groupId: 'sun-1',
          groupLabel: '太阳',
          partLabel: '主体',
          shape: 'circle',
          color: 'yellow',
          bbox: { x: 760, y: 60, width: 120, height: 120 },
          zIndex: 20,
        },
        {
          id: 'house-wall',
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '墙体',
          shape: 'rect',
          color: 'orange',
          bbox: { x: 380, y: 330, width: 240, height: 160 },
          zIndex: 10,
        },
      ],
    })

    expect(scene.shapes).toHaveLength(2)
    expect(scene.history).toHaveLength(1)
    expect(scene.shapes[0]).toMatchObject({
      type: 'rect',
      groupId: 'house-1',
      groupLabel: '房子',
      partLabel: '墙体',
      fill: '#f97316',
      x: 365,
      y: 317,
      width: 230,
      height: 154,
      zIndex: 10,
    })
    expect(scene.shapes[1]).toMatchObject({
      type: 'circle',
      groupId: 'sun-1',
      fill: '#facc15',
      zIndex: 20,
    })

    const undone = applyUndoCommand(scene)

    expect(undone.shapes).toHaveLength(0)
    expect(undone.future).toHaveLength(1)
  })

  it('fits slightly out-of-bounds scene elements into the canvas', () => {
    const scene = applySceneCommand(baseCanvas, {
      action: 'scene',
      title: '偏移场景',
      sourceText: '画一个有点偏出去的场景',
      elements: [
        {
          id: 'wide-rect',
          shape: 'rect',
          color: 'blue',
          bbox: { x: -60, y: 30, width: 1100, height: 120 },
          zIndex: 1,
        },
      ],
    })

    expect(scene.shapes[0].x).toBeGreaterThanOrEqual(0)
    expect(scene.shapes[0].x + scene.shapes[0].width).toBeLessThanOrEqual(baseCanvas.width)
  })

  it('moves, recolors, and deletes semantic scene targets', () => {
    const scene = applySceneCommand(baseCanvas, {
      action: 'scene',
      title: '房子和树',
      sourceText: '画一间房子旁边有一棵树',
      elements: [
        {
          id: 'tree-trunk',
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树干',
          shape: 'rect',
          color: 'orange',
          bbox: { x: 680, y: 330, width: 50, height: 150 },
          zIndex: 10,
        },
        {
          id: 'tree-top',
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树冠',
          shape: 'circle',
          color: 'green',
          bbox: { x: 630, y: 230, width: 150, height: 150 },
          zIndex: 11,
        },
        {
          id: 'house-roof',
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '屋顶',
          shape: 'triangle',
          color: 'red',
          bbox: { x: 260, y: 230, width: 260, height: 120 },
          zIndex: 12,
        },
      ],
    })
    const treeShapes = scene.shapes.filter((shape) => shape.groupLabel === '树')
    const houseRoof = scene.shapes.find((shape) => shape.partLabel === '屋顶')

    const moved = applyMoveCommand(scene, {
      action: 'move',
      target: { mode: 'semantic', groupLabel: '树' },
      mode: 'relative',
      direction: 'right',
      distance: 48,
      sourceText: '把树往右移动一点',
    })

    expect(moved.shapes.filter((shape) => shape.groupLabel === '树')).toEqual(
      treeShapes.map((shape) => ({
        ...shape,
        x: shape.x + 48,
      })),
    )
    expect(moved.shapes.find((shape) => shape.partLabel === '屋顶')?.x).toBe(
      houseRoof?.x,
    )

    const recolored = applyRecolorCommand(moved, {
      action: 'recolor',
      target: { mode: 'semantic', groupLabel: '房子', partLabel: '屋顶' },
      color: 'blue',
      sourceText: '把房子的屋顶改成蓝色',
    })

    expect(recolored.shapes.find((shape) => shape.partLabel === '屋顶')).toMatchObject({
      fill: '#3b82f6',
      stroke: '#1e40af',
    })

    const deleted = applyDeleteCommand(recolored, {
      action: 'delete',
      target: { mode: 'semantic', groupLabel: '树' },
      sourceText: '删除树',
    })

    expect(deleted.shapes.some((shape) => shape.groupLabel === '树')).toBe(false)
    expect(deleted.shapes.some((shape) => shape.groupLabel === '房子')).toBe(true)
    expect(applyUndoCommand(deleted).shapes.some((shape) => shape.groupLabel === '树')).toBe(
      true,
    )
  })
})
