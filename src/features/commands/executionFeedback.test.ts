import { describe, expect, it } from 'vitest'
import type { CanvasState } from '../canvas/types'
import {
  applyAddSceneObjectCommand,
  applyCreateCommand,
  applyMoveCommand,
  applySceneCommand,
  applyUndoCommand,
} from '../canvas/canvasOperations'
import { createPreciseExecutionFeedback } from './executionFeedback'
import type { ParsedCommand } from './types'

const emptyCanvas: CanvasState = {
  width: 960,
  height: 560,
  shapes: [],
  history: [],
  future: [],
}

describe('createPreciseExecutionFeedback', () => {
  it('describes the actual created shape size and position', () => {
    const command: ParsedCommand = {
      action: 'create',
      shape: 'circle',
      color: 'blue',
      position: 'center',
      size: 'large',
      sourceText: '生成一个大一点的蓝色圆',
    }
    const after = applyCreateCommand(emptyCanvas, command)

    expect(
      createPreciseExecutionFeedback(command, emptyCanvas, after, { source: 'ai' }),
    ).toMatchObject({
      source: 'ai',
      status: 'executed',
      title: '创建完成',
      summary: '已生成一个直径约 152px 的蓝色圆形，位于画布中间。',
      metrics: [
        { label: '尺寸', value: '直径 152px' },
        { label: '位置', value: '中间' },
        { label: '中心', value: '(480, 291)' },
        { label: '颜色', value: '蓝色' },
      ],
    })
  })

  it('describes actual movement distance and target center', () => {
    const createCommand: ParsedCommand = {
      action: 'create',
      shape: 'rect',
      color: 'green',
      position: 'center',
      size: 'medium',
      sourceText: '画一个绿色矩形',
    }
    const withShape = applyCreateCommand(emptyCanvas, createCommand)
    const moveCommand: ParsedCommand = {
      action: 'move',
      target: { mode: 'selected' },
      mode: 'relative',
      direction: 'right',
      distance: 40,
      sourceText: '往右移动一点',
    }
    const moved = applyMoveCommand(withShape, moveCommand)

    expect(createPreciseExecutionFeedback(moveCommand, withShape, moved)).toMatchObject({
      title: '移动完成',
      metrics: expect.arrayContaining([
        { label: '位移', value: 'x +40px，y +0px' },
        { label: '终点', value: '(520, 291)' },
      ]),
    })
  })

  it('summarizes generated scene objects and bounds', () => {
    const command: ParsedCommand = {
      action: 'scene',
      title: '小房子',
      sourceText: '画一间房子',
      elements: [
        {
          id: 'wall',
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '墙体',
          shape: 'rect',
          color: 'orange',
          bbox: { x: 0.4, y: 0.52, width: 0.2, height: 0.24 },
        },
        {
          id: 'roof',
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '屋顶',
          shape: 'triangle',
          color: 'red',
          bbox: { x: 0.36, y: 0.38, width: 0.28, height: 0.18 },
        },
      ],
    }
    const after = applySceneCommand(emptyCanvas, command)

    expect(createPreciseExecutionFeedback(command, emptyCanvas, after)).toMatchObject({
      title: '场景生成完成',
      summary: '已生成「小房子」，新增 2 个基础图形，包含 房子。',
      metrics: expect.arrayContaining([
        { label: '新增图形', value: '2 个' },
        { label: '语义对象', value: '1 组' },
      ]),
    })
  })

  it('summarizes incremental scene object additions separately from full scenes', () => {
    const command: ParsedCommand = {
      action: 'addSceneObject',
      title: '新增树',
      objectLabel: '树',
      anchor: {
        groupLabel: '房子',
        relation: 'right-of',
      },
      sourceText: '在房子的右边再生成一棵树',
      elements: [
        {
          id: 'tree-trunk',
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树干',
          shape: 'rect',
          color: 'orange',
          bbox: { x: 680, y: 350, width: 48, height: 130 },
        },
        {
          id: 'tree-crown',
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树冠',
          shape: 'circle',
          color: 'green',
          bbox: { x: 625, y: 245, width: 158, height: 158 },
        },
      ],
    }
    const after = applyAddSceneObjectCommand(emptyCanvas, command)

    expect(createPreciseExecutionFeedback(command, emptyCanvas, after)).toMatchObject({
      title: '新增内容完成',
      summary: '已新增树，追加 2 个基础图形，参考房子（在右侧）。',
      metrics: expect.arrayContaining([
        { label: '新增内容', value: '树' },
        { label: '新增图形', value: '2 个' },
      ]),
    })
  })

  it('reports blocked feedback when history commands make no change', () => {
    const command: ParsedCommand = {
      action: 'undo',
      sourceText: '撤销',
    }

    expect(
      createPreciseExecutionFeedback(command, emptyCanvas, applyUndoCommand(emptyCanvas)),
    ).toMatchObject({
      status: 'blocked',
      title: '无法撤销',
      summary: '当前没有可以撤销的步骤。',
    })
  })
})
