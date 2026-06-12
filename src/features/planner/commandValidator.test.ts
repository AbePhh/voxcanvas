import { describe, expect, it } from 'vitest'
import { validatePlannedCommand } from './commandValidator'
import { createPlannerInput } from './types'
import type { CanvasState } from '../canvas/types'

describe('validatePlannedCommand', () => {
  const canvasWithOneCircle = {
    width: 960,
    height: 560,
    selectedId: 'circle-1',
    objects: [
      {
        id: 'circle-1',
        type: 'circle' as const,
        x: 100,
        y: 120,
        width: 80,
        height: 80,
        fill: '#3b82f6',
        text: undefined,
      },
    ],
  }

  it('accepts a valid create command from planner output', () => {
    expect(
      validatePlannedCommand({
        action: 'create',
        shape: 'text',
        color: 'blue',
        position: 'top-right',
        size: 'medium',
        text: '我是张红兵',
        sourceText: '添加一个文本框在右上角内容是我是张红兵颜色是蓝色',
      }),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'create',
        shape: 'text',
        color: 'blue',
        position: 'top-right',
        text: '我是张红兵',
      },
    })
  })

  it('defaults create command size to medium when planner omits it', () => {
    expect(
      validatePlannedCommand({
        action: 'create',
        shape: 'text',
        color: 'blue',
        position: 'top-right',
        text: '我是张红兵',
      }),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'create',
        shape: 'text',
        color: 'blue',
        position: 'top-right',
        size: 'medium',
        text: '我是张红兵',
      },
    })
  })

  it('rejects unsupported actions and shapes', () => {
    expect(
      validatePlannedCommand({
        action: 'rotate',
        sourceText: '旋转它',
      }),
    ).toMatchObject({
      status: 'invalid',
      reason: 'unsupported-action',
    })

    expect(
      validatePlannedCommand({
        action: 'create',
        shape: 'cat',
        size: 'medium',
      }),
    ).toMatchObject({
      status: 'invalid',
      reason: 'invalid-create-shape',
    })
  })

  it('accepts valid edit commands', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'move',
          target: { mode: 'selected' },
          mode: 'relative',
          direction: 'right',
          distance: 80,
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'move',
        mode: 'relative',
        direction: 'right',
        distance: 80,
      },
    })

    expect(
      validatePlannedCommand(
        {
          action: 'recolor',
          target: 'selected',
          color: 'green',
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'recolor',
        target: {
          mode: 'selected',
        },
        color: 'green',
      },
    })
  })

  it('requires canvas context for dangerous edit commands', () => {
    expect(
      validatePlannedCommand({
        action: 'delete',
        target: { mode: 'selected' },
      }),
    ).toMatchObject({
      status: 'invalid',
      reason: 'missing-canvas-context',
    })
  })

  it('rejects dangerous edit commands when the target is missing or ambiguous', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'delete',
          target: { mode: 'selected' },
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            selectedId: undefined,
          },
        },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'target-not-found',
    })

    expect(
      validatePlannedCommand(
        {
          action: 'delete',
          target: { mode: 'shape', shape: 'circle' },
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            objects: [
              ...canvasWithOneCircle.objects,
              {
                id: 'circle-2',
                type: 'circle',
                x: 300,
                y: 120,
                width: 80,
                height: 80,
                fill: '#ef4444',
                text: undefined,
              },
            ],
          },
        },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'ambiguous-target',
    })
  })

  it('accepts descriptive targets only when color and kind identify one object', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'move',
          target: { mode: 'shape', shape: 'circle', color: 'green' },
          mode: 'absolute',
          position: 'top-right',
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            objects: [
              {
                ...canvasWithOneCircle.objects[0],
                fill: '#22c55e',
              },
              {
                id: 'circle-2',
                type: 'circle',
                x: 300,
                y: 120,
                width: 80,
                height: 80,
                fill: '#3b82f6',
                text: undefined,
              },
            ],
          },
        },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'move',
        target: {
          mode: 'shape',
          shape: 'circle',
          color: 'green',
        },
      },
    })

    expect(
      validatePlannedCommand(
        {
          action: 'move',
          target: { mode: 'shape', shape: 'circle', color: 'green' },
          mode: 'absolute',
          position: 'top-right',
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            objects: [
              {
                ...canvasWithOneCircle.objects[0],
                fill: '#22c55e',
              },
              {
                id: 'circle-2',
                type: 'circle',
                x: 300,
                y: 120,
                width: 80,
                height: 80,
                fill: '#22c55e',
                text: undefined,
              },
            ],
          },
        },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'ambiguous-target',
    })
  })
})

describe('createPlannerInput', () => {
  it('creates a compact canvas context for future AI planners', () => {
    const state: CanvasState = {
      width: 960,
      height: 560,
      selectedId: 'circle-1',
      history: [],
      future: [],
      shapes: [
        {
          id: 'circle-1',
          type: 'circle',
          x: 100,
          y: 120,
          width: 80,
          height: 80,
          fill: '#3b82f6',
          stroke: '#1e40af',
        },
      ],
    }

    expect(createPlannerInput('把靠近房子的圆移开', state)).toEqual({
      sourceText: '把靠近房子的圆移开',
      canvas: {
        width: 960,
        height: 560,
        selectedId: 'circle-1',
        objects: [
          {
            id: 'circle-1',
            type: 'circle',
            x: 100,
            y: 120,
            width: 80,
            height: 80,
            fill: '#3b82f6',
            text: undefined,
          },
        ],
      },
    })
  })
})
