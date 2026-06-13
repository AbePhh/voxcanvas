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

  it('preserves unknown reasons returned by the planner', () => {
    expect(
      validatePlannedCommand({
        action: 'unknown',
        reason: 'unsupported-action',
        sourceText: '话不左边加宽',
      }),
    ).toMatchObject({
      status: 'invalid',
      reason: 'unsupported-action',
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

  it('accepts valid canvas resize commands', () => {
    expect(
      validatePlannedCommand({
        action: 'resizeCanvas',
        mode: 'absolute',
        width: 1280,
        height: 720,
      }),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'resizeCanvas',
        mode: 'absolute',
        width: 1280,
        height: 720,
      },
    })

    expect(
      validatePlannedCommand({
        action: 'resizeCanvas',
        mode: 'relative',
        direction: 'wider',
        anchor: 'left',
      }),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'resizeCanvas',
        mode: 'relative',
        direction: 'wider',
        anchor: 'left',
      },
    })

    expect(
      validatePlannedCommand({
        action: 'resizeCanvas',
        mode: 'relative',
        direction: 'wider',
        anchor: 'outside',
      }),
    ).toMatchObject({
      status: 'invalid',
      reason: 'invalid-resize-canvas-anchor',
    })
  })

  it('accepts a valid scene graph command', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'scene',
          title: '房子和太阳',
          sourceText: '画一间房子和太阳',
          elements: [
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
            {
              id: 'sun',
              groupId: 'sun-1',
              groupLabel: '太阳',
              shape: 'circle',
              color: 'yellow',
              bbox: { x: 760, y: 60, width: 120, height: 120 },
              zIndex: 20,
            },
            {
              id: 'ground-line',
              groupId: 'ground-1',
              groupLabel: '地面',
              partLabel: '地平线',
              shape: 'line',
              color: 'green',
              bbox: { x: 90, y: 500, width: 820, height: 0 },
              zIndex: 1,
            },
          ],
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'scene',
        title: '房子和太阳',
        elements: [
          {
            id: 'house-wall',
            groupId: 'house-1',
            groupLabel: '房子',
            partLabel: '墙体',
            shape: 'rect',
            color: 'orange',
          },
          {
            id: 'sun',
            groupId: 'sun-1',
            shape: 'circle',
            color: 'yellow',
          },
          {
            id: 'ground-line',
            shape: 'line',
            color: 'green',
          },
        ],
      },
    })
  })

  it('rejects invalid scene graph commands', () => {
    expect(
      validatePlannedCommand({
        action: 'scene',
        elements: [],
      }),
    ).toMatchObject({
      status: 'invalid',
      reason: 'missing-canvas-context',
    })

    expect(
      validatePlannedCommand(
        {
          action: 'scene',
          elements: [],
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'invalid-scene-element-count',
    })

    expect(
      validatePlannedCommand(
        {
          action: 'scene',
          elements: Array.from({ length: 25 }, (_, index) => ({
            id: `shape-${index}`,
            shape: 'circle',
            color: 'blue',
            bbox: { x: 20, y: 20, width: 40, height: 40 },
          })),
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'invalid-scene-element-count',
    })

    expect(
      validatePlannedCommand(
        {
          action: 'scene',
          elements: [
            {
              id: 'bad-shape',
              shape: 'star',
              color: 'blue',
              bbox: { x: 20, y: 20, width: 40, height: 40 },
            },
          ],
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'invalid-scene-element',
    })

    expect(
      validatePlannedCommand(
        {
          action: 'scene',
          elements: [
            {
              id: 'bad-bbox',
              shape: 'circle',
              color: 'blue',
              bbox: { x: Number.NaN, y: 20, width: 40, height: 40 },
            },
          ],
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'invalid-scene-element',
    })

    expect(
      validatePlannedCommand(
        {
          action: 'scene',
          elements: [
            {
              id: 'wild-bbox',
              shape: 'circle',
              color: 'blue',
              bbox: { x: 5000, y: 20, width: 40, height: 40 },
            },
          ],
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'invalid-scene-element',
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
  it('accepts semantic scene targets for unique groups and parts', () => {
    const canvasWithSceneObjects = {
      ...canvasWithOneCircle,
      objects: [
        {
          id: 'tree-trunk',
          type: 'rect' as const,
          x: 650,
          y: 330,
          width: 50,
          height: 150,
          fill: '#f97316',
          text: undefined,
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树干',
          zIndex: 10,
        },
        {
          id: 'tree-top',
          type: 'circle' as const,
          x: 610,
          y: 230,
          width: 150,
          height: 150,
          fill: '#22c55e',
          text: undefined,
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树冠',
          zIndex: 11,
        },
        {
          id: 'house-roof',
          type: 'triangle' as const,
          x: 260,
          y: 230,
          width: 260,
          height: 120,
          fill: '#ef4444',
          text: undefined,
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '屋顶',
          zIndex: 12,
        },
      ],
    }

    expect(
      validatePlannedCommand(
        {
          action: 'move',
          target: { mode: 'semantic', groupLabel: '树' },
          mode: 'relative',
          direction: 'right',
          distance: 48,
        },
        { canvas: canvasWithSceneObjects },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'move',
        target: {
          mode: 'semantic',
          groupLabel: '树',
        },
      },
    })

    expect(
      validatePlannedCommand(
        {
          action: 'recolor',
          target: { mode: 'semantic', groupLabel: '房子', partLabel: '屋顶' },
          color: 'blue',
        },
        { canvas: canvasWithSceneObjects },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'recolor',
        target: {
          mode: 'semantic',
          groupLabel: '房子',
          partLabel: '屋顶',
        },
      },
    })

    expect(
      validatePlannedCommand(
        {
          action: 'resize',
          target: { mode: 'semantic', groupLabel: '树' },
          direction: 'larger',
        },
        { canvas: canvasWithSceneObjects },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'resize',
        target: {
          mode: 'semantic',
          groupLabel: '树',
        },
      },
    })
  })

  it('rejects ambiguous semantic scene targets', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'delete',
          target: { mode: 'semantic', groupLabel: '树' },
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            objects: [
              {
                id: 'tree-1-top',
                type: 'circle',
                x: 100,
                y: 100,
                width: 80,
                height: 80,
                fill: '#22c55e',
                text: undefined,
                groupId: 'tree-1',
                groupLabel: '树',
              },
              {
                id: 'tree-2-top',
                type: 'circle',
                x: 300,
                y: 100,
                width: 80,
                height: 80,
                fill: '#22c55e',
                text: undefined,
                groupId: 'tree-2',
                groupLabel: '树',
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

    const localCommand = {
      action: 'unknown',
      reason: 'unsupported-action',
      sourceText: '把靠近房子的圆移开',
    } as const

    expect(createPlannerInput('把靠近房子的圆移开', state, localCommand)).toEqual({
      sourceText: '把靠近房子的圆移开',
      localCommand,
      sceneSpace: {
        width: 1000,
        height: 583,
        origin: 'top-left',
        unit: 'normalized',
      },
      sceneCapabilities: {
        allowedShapes: ['circle', 'rect', 'triangle', 'line', 'text'],
        allowedColors: [
          'red',
          'orange',
          'yellow',
          'green',
          'blue',
          'purple',
          'black',
          'white',
          'gray',
        ],
        maxElements: 24,
      },
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
            groupId: undefined,
            groupLabel: undefined,
            partLabel: undefined,
            zIndex: undefined,
          },
        ],
      },
    })
  })
})
