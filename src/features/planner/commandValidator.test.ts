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
  const canvasWithHouseAnchor = {
    ...canvasWithOneCircle,
    semanticGroups: [
      {
        id: 'house-1',
        groupId: 'house-1',
        groupLabel: '房子',
        displayLabel: '房子',
        referenceLabels: ['房子', 'house-1'],
        partLabels: ['墙体'],
        objectIds: ['house-wall'],
        bounds: { x: 360, y: 300, width: 240, height: 160 },
        selected: false,
      },
    ],
    objects: [
      ...canvasWithOneCircle.objects,
      {
        id: 'house-wall',
        type: 'rect' as const,
        x: 360,
        y: 300,
        width: 240,
        height: 160,
        fill: '#f97316',
        text: undefined,
        groupId: 'house-1',
        groupLabel: '房子',
        partLabel: '墙体',
        zIndex: 10,
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

  it('preserves sanitized correction metadata from planner output', () => {
    expect(
      validatePlannedCommand({
        action: 'create',
        shape: 'circle',
        color: 'blue',
        position: 'center',
        size: 'medium',
        sourceText: '画一个兰色园形',
        correction: {
          correctedText: '画一个蓝色圆形',
          interpretedIntent: '在画布中心创建蓝色圆形',
          explanation: '将“兰色园形”纠正为“蓝色圆形”',
          confidence: 'high',
          shouldConfirm: false,
          ignoredField: 'not allowed',
        },
      }),
    ).toMatchObject({
      status: 'planned',
      correction: {
        correctedText: '画一个蓝色圆形',
        interpretedIntent: '在画布中心创建蓝色圆形',
        explanation: '将“兰色园形”纠正为“蓝色圆形”',
        confidence: 'high',
        shouldConfirm: false,
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
        { canvas: canvasWithHouseAnchor },
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
        { canvas: canvasWithHouseAnchor },
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
        { canvas: canvasWithHouseAnchor },
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

  it('accepts incremental scene object additions from planner output', () => {
    expect(
      validatePlannedCommand(
        {
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
              groupId: 'tree-2',
              groupLabel: '树',
              partLabel: '树干',
              shape: 'rect',
              color: 'orange',
              bbox: { x: 680, y: 360, width: 50, height: 140 },
              zIndex: 10,
            },
            {
              id: 'tree-crown',
              groupId: 'tree-2',
              groupLabel: '树',
              partLabel: '树冠',
              shape: 'circle',
              color: 'green',
              bbox: { x: 625, y: 250, width: 160, height: 160 },
              zIndex: 11,
            },
          ],
        },
        { canvas: canvasWithHouseAnchor },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'addSceneObject',
        objectLabel: '树',
        anchor: {
          groupLabel: '房子',
          relation: 'right-of',
        },
        elements: [
          {
            id: 'tree-trunk',
            groupId: 'tree-2',
            groupLabel: '树',
            partLabel: '树干',
          },
          {
            id: 'tree-crown',
            groupId: 'tree-2',
            groupLabel: '树',
            partLabel: '树冠',
          },
        ],
      },
    })
  })

  it('coerces full scenes into incremental semantic additions when they contain new elements', () => {
    const options = {
      canvas: canvasWithHouseAnchor,
      sourceText: '在房子的右边再生成一棵树',
      localCommand: {
        action: 'unknown',
        reason: 'planner-required-scene-or-shape',
        sourceText: '在房子的右边再生成一棵树',
      } as const,
    }

    expect(
      validatePlannedCommand(
        {
          action: 'scene',
          title: '房子和树',
          sourceText: '在房子的右边再生成一棵树',
          elements: [
            {
              id: 'house-wall',
              groupId: 'house-1',
              groupLabel: '房子',
              shape: 'rect',
              color: 'orange',
              bbox: { x: 380, y: 330, width: 240, height: 160 },
            },
            {
              id: 'tree-trunk',
              groupId: 'tree-1',
              groupLabel: '树',
              partLabel: '树干',
              shape: 'rect',
              color: 'orange',
              bbox: { x: 680, y: 360, width: 50, height: 140 },
            },
            {
              id: 'tree-crown',
              groupId: 'tree-1',
              groupLabel: '树',
              partLabel: '树冠',
              shape: 'circle',
              color: 'green',
              bbox: { x: 625, y: 250, width: 160, height: 160 },
            },
          ],
        },
        options,
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'addSceneObject',
        objectLabel: '树',
        elements: [
          {
            id: 'tree-trunk',
            groupLabel: '树',
          },
          {
            id: 'tree-crown',
            groupLabel: '树',
          },
        ],
      },
    })
  })

  it('rejects primitive creates for incremental semantic additions', () => {
    const options = {
      canvas: canvasWithHouseAnchor,
      sourceText: '在房子的右边再生成一棵树',
      localCommand: {
        action: 'unknown',
        reason: 'planner-required-scene-or-shape',
        sourceText: '在房子的右边再生成一棵树',
      } as const,
    }

    expect(
      validatePlannedCommand(
        {
          action: 'create',
          shape: 'rect',
          color: 'orange',
          position: 'right',
          size: 'medium',
          sourceText: '在房子的右边再生成一棵树',
        },
        options,
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'incremental-addition-requires-add-scene-object',
    })
  })

  it('blocks relative additions when the referenced anchor is missing', () => {
    const options = {
      canvas: {
        ...canvasWithOneCircle,
        selectedId: undefined,
        objects: [],
        semanticGroups: [],
      },
      sourceText: '在太阳下面再加一朵云',
      localCommand: {
        action: 'unknown',
        reason: 'planner-required-scene-or-shape',
        sourceText: '在太阳下面再加一朵云',
      } as const,
    }

    expect(
      validatePlannedCommand(
        {
          action: 'create',
          shape: 'circle',
          color: 'white',
          position: 'bottom',
          size: 'medium',
          sourceText: '在太阳下面再加一朵云',
        },
        options,
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'missing-anchor',
      rawValue: {
        anchorLabel: '太阳',
        objectLabel: '云',
        relation: 'below',
      },
    })

    expect(
      validatePlannedCommand(
        {
          action: 'addSceneObject',
          objectLabel: '云',
          anchor: { groupLabel: '太阳', relation: 'below' },
          sourceText: '在太阳下面再加一朵云',
          elements: [
            {
              id: 'cloud',
              groupId: 'cloud-1',
              groupLabel: '云',
              shape: 'circle',
              color: 'white',
              bbox: { x: 400, y: 180, width: 160, height: 90 },
            },
          ],
        },
        options,
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'missing-anchor',
    })
  })

  it('allows relative additions when the referenced semantic anchor exists', () => {
    const options = {
      canvas: {
        ...canvasWithOneCircle,
        selectedId: undefined,
        semanticGroups: [
          {
            id: 'sun-1',
            groupId: 'sun-1',
            groupLabel: '太阳',
            displayLabel: '太阳',
            referenceLabels: ['太阳', 'sun-1'],
            partLabels: ['太阳'],
            objectIds: ['sun-body'],
            bounds: { x: 720, y: 60, width: 120, height: 120 },
            selected: false,
          },
        ],
        objects: [
          {
            id: 'sun-body',
            type: 'circle' as const,
            x: 720,
            y: 60,
            width: 120,
            height: 120,
            fill: '#facc15',
            text: undefined,
            groupId: 'sun-1',
            groupLabel: '太阳',
            partLabel: '太阳',
            zIndex: 20,
          },
        ],
      },
      sourceText: '在太阳下面再加一朵云',
      localCommand: {
        action: 'unknown',
        reason: 'planner-required-scene-or-shape',
        sourceText: '在太阳下面再加一朵云',
      } as const,
    }

    expect(
      validatePlannedCommand(
        {
          action: 'addSceneObject',
          objectLabel: '云',
          anchor: { groupLabel: '太阳', relation: 'below' },
          sourceText: '在太阳下面再加一朵云',
          elements: [
            {
              id: 'cloud',
              groupId: 'cloud-1',
              groupLabel: '云',
              shape: 'circle',
              color: 'white',
              bbox: { x: 720, y: 220, width: 160, height: 90 },
            },
          ],
        },
        options,
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'addSceneObject',
        objectLabel: '云',
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

  it('accepts spatial move commands with a semantic reference target', () => {
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
        },
        {
          id: 'tree-crown',
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
        },
        {
          id: 'house-wall',
          type: 'rect' as const,
          x: 260,
          y: 300,
          width: 260,
          height: 150,
          fill: '#f97316',
          text: undefined,
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '墙体',
        },
      ],
    }

    const result = validatePlannedCommand(
      {
        action: 'move',
        target: { mode: 'semantic', groupLabel: '树' },
        mode: 'spatial',
        reference: { mode: 'semantic', groupLabel: '房子' },
        relation: 'right-of',
        align: 'center',
        gap: 24,
        sourceText: '把树放到房子右边',
      },
      { canvas: canvasWithSceneObjects },
    )

    expect(result).toMatchObject({
      status: 'planned',
      command: {
        action: 'move',
        mode: 'spatial',
        reference: {
          mode: 'semantic',
          groupLabel: '房子',
        },
        relation: 'right-of',
        align: 'preserve',
        gap: 24,
      },
    })
  })

  it('rejects spatial move commands when the reference object is missing', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'move',
          target: { mode: 'shape', shape: 'circle' },
          mode: 'spatial',
          reference: { mode: 'semantic', groupLabel: '房子' },
          relation: 'right-of',
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'reference-not-found',
    })
  })

  it('normalizes misplaced part-level absolute moves into whole-group spatial moves', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'move',
          target: {
            mode: 'semantic',
            groupLabel: '树',
            partLabel: '树冠',
          },
          mode: 'absolute',
          position: 'bottom',
          sourceText: '把这颗树移动到地面的上方',
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            objects: [
              {
                id: 'ground',
                type: 'line',
                x: 120,
                y: 460,
                width: 720,
                height: 0,
                fill: 'transparent',
                text: undefined,
                groupId: 'ground-1',
                groupLabel: '地面',
                partLabel: '地平线',
              },
              {
                id: 'tree-trunk',
                type: 'rect',
                x: 210,
                y: 350,
                width: 44,
                height: 100,
                fill: '#f97316',
                text: undefined,
                groupId: 'tree-1',
                groupLabel: '树',
                partLabel: '树干',
              },
              {
                id: 'tree-crown',
                type: 'circle',
                x: 165,
                y: 250,
                width: 134,
                height: 134,
                fill: '#22c55e',
                text: undefined,
                groupId: 'tree-1',
                groupLabel: '树',
                partLabel: '树冠',
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
          mode: 'semantic',
          groupLabel: '树',
          partLabel: undefined,
        },
        mode: 'spatial',
        reference: {
          mode: 'semantic',
          groupLabel: '地面',
        },
        relation: 'above',
        align: 'preserve',
        gap: 0,
      },
    })
  })

  it('normalizes misplaced part-level relative moves into whole-group moves', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'move',
          target: {
            mode: 'semantic',
            groupLabel: '树',
            partLabel: '树冠',
          },
          mode: 'relative',
          direction: 'right',
          distance: 48,
          sourceText: '把这棵树往右边移动一点',
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            objects: [
              {
                id: 'tree-trunk',
                type: 'rect',
                x: 210,
                y: 350,
                width: 44,
                height: 100,
                fill: '#f97316',
                text: undefined,
                groupId: 'tree-1',
                groupLabel: '树',
                partLabel: '树干',
              },
              {
                id: 'tree-crown',
                type: 'circle',
                x: 165,
                y: 250,
                width: 134,
                height: 134,
                fill: '#22c55e',
                text: undefined,
                groupId: 'tree-1',
                groupLabel: '树',
                partLabel: '树冠',
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
          mode: 'semantic',
          groupLabel: '树',
          partLabel: undefined,
        },
        mode: 'relative',
        direction: 'right',
        distance: 48,
      },
    })
  })

  it('normalizes misplaced part labels for any semantic object-level move', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'move',
          target: {
            mode: 'semantic',
            groupLabel: '房子',
            partLabel: '墙体',
          },
          mode: 'relative',
          direction: 'right',
          distance: 48,
          sourceText: '把房子往右移动一点',
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            objects: [
              {
                id: 'house-wall',
                type: 'rect',
                x: 260,
                y: 300,
                width: 260,
                height: 150,
                fill: '#f97316',
                text: undefined,
                groupId: 'house-1',
                groupLabel: '房子',
                partLabel: '墙体',
              },
              {
                id: 'house-roof',
                type: 'triangle',
                x: 230,
                y: 210,
                width: 320,
                height: 120,
                fill: '#ef4444',
                text: undefined,
                groupId: 'house-1',
                groupLabel: '房子',
                partLabel: '屋顶',
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
          mode: 'semantic',
          groupLabel: '房子',
          partLabel: undefined,
        },
        mode: 'relative',
        direction: 'right',
        distance: 48,
      },
    })
  })

  it('keeps explicit semantic part targets when the user names the part', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'move',
          target: {
            mode: 'semantic',
            groupLabel: '房子',
            partLabel: '屋顶',
          },
          mode: 'relative',
          direction: 'right',
          distance: 48,
          sourceText: '把房子的屋顶往右移动一点',
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            objects: [
              {
                id: 'house-wall',
                type: 'rect',
                x: 260,
                y: 300,
                width: 260,
                height: 150,
                fill: '#f97316',
                text: undefined,
                groupId: 'house-1',
                groupLabel: '房子',
                partLabel: '墙体',
              },
              {
                id: 'house-roof',
                type: 'triangle',
                x: 230,
                y: 210,
                width: 320,
                height: 120,
                fill: '#ef4444',
                text: undefined,
                groupId: 'house-1',
                groupLabel: '房子',
                partLabel: '屋顶',
              },
            ],
          },
        },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        target: {
          mode: 'semantic',
          groupLabel: '房子',
          partLabel: '屋顶',
        },
      },
    })
  })

  it('allows ambiguous semantic scene targets so the UI can clarify them', () => {
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
      status: 'planned',
      command: {
        action: 'delete',
        target: {
          mode: 'semantic',
          groupLabel: '树',
        },
      },
    })
  })

  it('accepts the selected semantic group when labels are duplicated', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'recolor',
          target: { mode: 'semantic', groupLabel: '树' },
          color: 'red',
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            selectedGroupId: 'tree-2',
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
      status: 'planned',
      command: {
        action: 'recolor',
        target: {
          mode: 'semantic',
          groupLabel: '树',
        },
      },
    })
  })

  it('normalizes duplicate semantic reference labels to group ids', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'move',
          target: { mode: 'semantic', groupLabel: '树 2' },
          mode: 'relative',
          direction: 'right',
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            semanticGroups: [
              {
                id: 'tree-1',
                groupId: 'tree-1',
                groupLabel: '树',
                displayLabel: '树 1',
                referenceLabels: ['tree-1', '树 1', '第一棵树'],
                partLabels: ['树冠'],
                objectIds: ['tree-1-top'],
                bounds: { x: 100, y: 100, width: 80, height: 80 },
                selected: false,
              },
              {
                id: 'tree-2',
                groupId: 'tree-2',
                groupLabel: '树',
                displayLabel: '树 2',
                referenceLabels: ['tree-2', '树 2', '第二棵树'],
                partLabels: ['树冠'],
                objectIds: ['tree-2-top'],
                bounds: { x: 300, y: 100, width: 80, height: 80 },
                selected: false,
              },
            ],
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
      status: 'planned',
      command: {
        action: 'move',
        target: {
          mode: 'semantic',
          groupId: 'tree-2',
          groupLabel: '树',
        },
      },
    })
  })

  it('accepts valid multi-step edit commands from planner output', () => {
    const canvasWithHouse = {
      ...canvasWithOneCircle,
      semanticGroups: [
        {
          id: 'house-1',
          groupId: 'house-1',
          groupLabel: '房子',
          displayLabel: '房子',
          referenceLabels: ['房子', 'house-1'],
          partLabels: ['墙体', '屋顶'],
          objectIds: ['house-wall', 'house-roof'],
          bounds: { x: 260, y: 210, width: 320, height: 240 },
          selected: false,
        },
      ],
      objects: [
        {
          id: 'house-wall',
          type: 'rect' as const,
          x: 300,
          y: 300,
          width: 240,
          height: 150,
          fill: '#f97316',
          text: undefined,
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '墙体',
        },
        {
          id: 'house-roof',
          type: 'triangle' as const,
          x: 260,
          y: 210,
          width: 320,
          height: 120,
          fill: '#ef4444',
          text: undefined,
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '屋顶',
        },
      ],
    }

    expect(
      validatePlannedCommand(
        {
          action: 'batch',
          sourceText: '把房子往右边移动一点，屋顶变成黑色',
          commands: [
            {
              action: 'move',
              target: { mode: 'semantic', groupLabel: '房子' },
              mode: 'relative',
              direction: 'right',
              distance: 48,
              sourceText: '把房子往右边移动一点',
            },
            {
              action: 'recolor',
              target: { mode: 'semantic', groupLabel: '房子', partLabel: '屋顶' },
              color: 'black',
              sourceText: '屋顶变成黑色',
            },
          ],
          correction: {
            interpretedIntent: '先移动房子，再把屋顶改成黑色',
            confidence: 'high',
          },
        },
        { canvas: canvasWithHouse },
      ),
    ).toMatchObject({
      status: 'planned',
      correction: {
        interpretedIntent: '先移动房子，再把屋顶改成黑色',
      },
      command: {
        action: 'batch',
        commands: [
          {
            action: 'move',
            target: {
              mode: 'semantic',
              groupId: 'house-1',
              groupLabel: '房子',
            },
          },
          {
            action: 'recolor',
            target: {
              mode: 'semantic',
              groupId: 'house-1',
              groupLabel: '房子',
              partLabel: '屋顶',
            },
            color: 'black',
          },
        ],
      },
    })
  })

  it('accepts resize plus recolor as one ordered batch', () => {
    const canvasWithTree = {
      ...canvasWithOneCircle,
      semanticGroups: [
        {
          id: 'tree-1',
          groupId: 'tree-1',
          groupLabel: '树',
          displayLabel: '树',
          referenceLabels: ['树', 'tree-1'],
          partLabels: ['树干', '树冠'],
          objectIds: ['tree-trunk', 'tree-crown'],
          bounds: { x: 280, y: 180, width: 160, height: 250 },
          selected: false,
        },
      ],
      objects: [
        {
          id: 'tree-trunk',
          type: 'rect' as const,
          x: 350,
          y: 300,
          width: 48,
          height: 130,
          fill: '#92400e',
          text: undefined,
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树干',
        },
        {
          id: 'tree-crown',
          type: 'circle' as const,
          x: 280,
          y: 180,
          width: 160,
          height: 160,
          fill: '#22c55e',
          text: undefined,
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树冠',
        },
      ],
    }

    expect(
      validatePlannedCommand(
        {
          action: 'batch',
          sourceText: '把树缩小一点，然后把树冠改成黄色',
          commands: [
            {
              action: 'resize',
              target: { mode: 'semantic', groupLabel: '树' },
              direction: 'smaller',
              sourceText: '把树缩小一点',
            },
            {
              action: 'recolor',
              target: { mode: 'semantic', groupLabel: '树', partLabel: '树冠' },
              color: 'yellow',
              sourceText: '把树冠改成黄色',
            },
          ],
        },
        { canvas: canvasWithTree },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'batch',
        commands: [
          {
            action: 'resize',
            target: {
              mode: 'semantic',
              groupId: 'tree-1',
              groupLabel: '树',
            },
          },
          {
            action: 'recolor',
            target: {
              mode: 'semantic',
              groupId: 'tree-1',
              groupLabel: '树',
              partLabel: '树冠',
            },
            color: 'yellow',
          },
        ],
      },
    })
  })

  it('accepts bulk semantic recolor commands with explicit scope all', () => {
    const canvasWithBalloons = {
      ...canvasWithOneCircle,
      semanticGroups: [
        {
          id: 'balloon-1',
          groupId: 'balloon-1',
          groupLabel: '气球',
          displayLabel: '气球 1',
          referenceLabels: ['气球 1', '第一只气球', 'balloon-1'],
          partLabels: ['主体'],
          objectIds: ['balloon-1-body'],
          bounds: { x: 120, y: 120, width: 80, height: 80 },
          selected: false,
        },
        {
          id: 'balloon-2',
          groupId: 'balloon-2',
          groupLabel: '气球',
          displayLabel: '气球 2',
          referenceLabels: ['气球 2', '第二只气球', 'balloon-2'],
          partLabels: ['主体'],
          objectIds: ['balloon-2-body'],
          bounds: { x: 260, y: 160, width: 80, height: 80 },
          selected: false,
        },
      ],
      objects: [
        {
          id: 'balloon-1-body',
          type: 'circle' as const,
          x: 120,
          y: 120,
          width: 80,
          height: 80,
          fill: '#3b82f6',
          text: undefined,
          groupId: 'balloon-1',
          groupLabel: '气球',
          partLabel: '主体',
        },
        {
          id: 'balloon-2-body',
          type: 'circle' as const,
          x: 260,
          y: 160,
          width: 80,
          height: 80,
          fill: '#22c55e',
          text: undefined,
          groupId: 'balloon-2',
          groupLabel: '气球',
          partLabel: '主体',
        },
      ],
    }

    expect(
      validatePlannedCommand(
        {
          action: 'recolor',
          target: { mode: 'semantic', groupLabel: '气球', scope: 'all' },
          color: 'red',
          sourceText: '把所有气球变成红色',
        },
        { canvas: canvasWithBalloons },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'recolor',
        target: {
          mode: 'semantic',
          groupLabel: '气球',
          scope: 'all',
        },
        color: 'red',
      },
    })
  })

  it('accepts align and arrange commands for counted primitive targets', () => {
    const canvasWithThreeCircles = {
      ...canvasWithOneCircle,
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
        {
          id: 'circle-2',
          type: 'circle' as const,
          x: 240,
          y: 240,
          width: 80,
          height: 80,
          fill: '#22c55e',
          text: undefined,
        },
        {
          id: 'circle-3',
          type: 'circle' as const,
          x: 420,
          y: 160,
          width: 80,
          height: 80,
          fill: '#facc15',
          text: undefined,
        },
      ],
    }

    expect(
      validatePlannedCommand(
        {
          action: 'align',
          target: { mode: 'shape', shape: 'circle', scope: 'all', count: 3 },
          axis: 'left',
          sourceText: '让三个圆左对齐',
        },
        { canvas: canvasWithThreeCircles },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'align',
        axis: 'left',
      },
    })

    expect(
      validatePlannedCommand(
        {
          action: 'arrange',
          target: { mode: 'shape', shape: 'circle', scope: 'all', count: 3 },
          layout: 'row',
          spacing: 32,
          sourceText: '把三个圆排成一行',
        },
        { canvas: canvasWithThreeCircles },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'arrange',
        layout: 'row',
        spacing: 32,
      },
    })
  })

  it('rejects unsafe bulk targets and defers counted target mismatches to clarification', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'recolor',
          target: { mode: 'any', scope: 'all' },
          color: 'red',
          sourceText: '全部改成红色',
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'unsafe-bulk-target',
    })

    expect(
      validatePlannedCommand(
        {
          action: 'arrange',
          target: { mode: 'shape', shape: 'circle', scope: 'all', count: 3 },
          layout: 'row',
          sourceText: '把三个圆排成一行',
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'arrange',
        target: {
          count: 3,
        },
      },
    })

    expect(
      validatePlannedCommand(
        {
          action: 'batch',
          sourceText: '把三个圆排成一行，然后变成红色',
          commands: [
            {
              action: 'arrange',
              target: { mode: 'shape', shape: 'circle', scope: 'all', count: 3 },
              layout: 'row',
              sourceText: '把三个圆排成一行',
            },
            {
              action: 'recolor',
              target: { mode: 'shape', shape: 'circle', scope: 'all', count: 3 },
              color: 'red',
              sourceText: '变成红色',
            },
          ],
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'invalid-batch-step-target-count-mismatch',
    })
  })

  it('rejects single-step planner output for multi-step utterances', () => {
    const canvasWithTreeAndHouse = {
      ...canvasWithOneCircle,
      semanticGroups: [
        {
          id: 'tree-1',
          groupId: 'tree-1',
          groupLabel: '树',
          displayLabel: '树',
          referenceLabels: ['树', 'tree-1'],
          partLabels: ['树干', '树冠'],
          objectIds: ['tree-trunk', 'tree-crown'],
          bounds: { x: 280, y: 180, width: 160, height: 250 },
          selected: false,
        },
        {
          id: 'house-1',
          groupId: 'house-1',
          groupLabel: '房子',
          displayLabel: '房子',
          referenceLabels: ['房子', 'house-1'],
          partLabels: ['墙体', '屋顶'],
          objectIds: ['house-wall', 'house-roof'],
          bounds: { x: 520, y: 220, width: 240, height: 210 },
          selected: false,
        },
      ],
      objects: [
        {
          id: 'tree-trunk',
          type: 'rect' as const,
          x: 350,
          y: 300,
          width: 48,
          height: 130,
          fill: '#92400e',
          text: undefined,
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树干',
        },
        {
          id: 'tree-crown',
          type: 'circle' as const,
          x: 280,
          y: 180,
          width: 160,
          height: 160,
          fill: '#22c55e',
          text: undefined,
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树冠',
        },
        {
          id: 'house-wall',
          type: 'rect' as const,
          x: 550,
          y: 310,
          width: 180,
          height: 120,
          fill: '#f97316',
          text: undefined,
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '墙体',
        },
        {
          id: 'house-roof',
          type: 'triangle' as const,
          x: 520,
          y: 220,
          width: 240,
          height: 110,
          fill: '#ef4444',
          text: undefined,
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '屋顶',
        },
      ],
    }

    expect(
      validatePlannedCommand(
        {
          action: 'resize',
          target: { mode: 'semantic', groupId: 'tree-1', groupLabel: '树' },
          direction: 'smaller',
          sourceText: '把树缩小一点，然后把树冠改成黄色',
        },
        { canvas: canvasWithTreeAndHouse },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'multi-step-command-requires-batch',
    })

    expect(
      validatePlannedCommand(
        {
          action: 'create',
          shape: 'circle',
          color: 'red',
          size: 'medium',
          sourceText: '画一个红色圆形，然后把它移动到右上角',
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            selectedId: undefined,
            objects: [],
            semanticGroups: [],
          },
        },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'multi-step-command-requires-batch',
    })

    expect(
      validatePlannedCommand(
        {
          action: 'move',
          target: { mode: 'semantic', groupId: 'house-1', groupLabel: '房子' },
          mode: 'relative',
          direction: 'right',
          distance: 48,
          sourceText: '把房子往右边移动一点，屋顶变成黑色',
        },
        { canvas: canvasWithTreeAndHouse },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'multi-step-command-requires-batch',
    })
  })

  it('allows later batch steps to target the object created by an earlier step', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'batch',
          sourceText: '画一个红色圆形，然后把它移动到右上角',
          commands: [
            {
              action: 'create',
              shape: 'circle',
              color: 'red',
              position: 'center',
              size: 'medium',
              sourceText: '画一个红色圆形',
            },
            {
              action: 'move',
              target: { mode: 'selected' },
              mode: 'absolute',
              position: 'top-right',
              sourceText: '把它移动到右上角',
            },
          ],
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            selectedId: undefined,
            objects: [],
            semanticGroups: [],
          },
        },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'batch',
        commands: [
          {
            action: 'create',
          },
          {
            action: 'move',
            target: { mode: 'selected' },
          },
        ],
      },
    })
  })

  it('accepts three-step batch commands with inherited selected targets', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'batch',
          sourceText: '画一个红色圆形，然后把它移动到右上角，再把它改成蓝色',
          commands: [
            {
              action: 'create',
              shape: 'circle',
              color: 'red',
              position: 'center',
              size: 'medium',
              sourceText: '画一个红色圆形',
            },
            {
              action: 'move',
              target: { mode: 'selected' },
              mode: 'absolute',
              position: 'top-right',
              sourceText: '把它移动到右上角',
            },
            {
              action: 'recolor',
              target: { mode: 'selected' },
              color: 'blue',
              sourceText: '再把它改成蓝色',
            },
          ],
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            selectedId: undefined,
            objects: [],
            semanticGroups: [],
          },
        },
      ),
    ).toMatchObject({
      status: 'planned',
      command: {
        action: 'batch',
        commands: [
          {
            action: 'create',
          },
          {
            action: 'move',
            target: { mode: 'selected' },
          },
          {
            action: 'recolor',
            target: { mode: 'selected' },
            color: 'blue',
          },
        ],
      },
    })
  })

  it('rejects batch steps that reference planner-only transient ids', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'batch',
          sourceText: '画一个红色圆形，然后把它移动到右上角',
          commands: [
            {
              action: 'create',
              shape: 'circle',
              color: 'red',
              position: 'center',
              size: 'medium',
              sourceText: '画一个红色圆形',
            },
            {
              action: 'move',
              target: { mode: 'any', id: 'batch-circle-1' },
              mode: 'absolute',
              position: 'top-right',
              sourceText: '把它移动到右上角',
            },
          ],
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            selectedId: undefined,
            objects: [],
            semanticGroups: [],
          },
        },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'invalid-batch-step-transient-id',
    })
  })

  it('rejects unsafe batch commands instead of running partial edits', () => {
    expect(
      validatePlannedCommand(
        {
          action: 'batch',
          sourceText: '移动圆形，然后清空画布',
          commands: [
            {
              action: 'move',
              target: { mode: 'shape', shape: 'circle' },
              mode: 'relative',
              direction: 'right',
            },
            {
              action: 'clear',
              sourceText: '清空画布',
            },
          ],
        },
        { canvas: canvasWithOneCircle },
      ),
    ).toMatchObject({
      status: 'invalid',
      reason: 'unsupported-batch-step',
    })

    expect(
      validatePlannedCommand(
        {
          action: 'batch',
          sourceText: '把树往右移动一点，然后变成红色',
          commands: [
            {
              action: 'move',
              target: { mode: 'semantic', groupLabel: '树' },
              mode: 'relative',
              direction: 'right',
              sourceText: '把树往右移动一点',
            },
            {
              action: 'recolor',
              target: { mode: 'semantic', groupLabel: '树' },
              color: 'red',
              sourceText: '变成红色',
            },
          ],
        },
        {
          canvas: {
            ...canvasWithOneCircle,
            semanticGroups: [
              {
                id: 'tree-1',
                groupId: 'tree-1',
                groupLabel: '树',
                displayLabel: '树 1',
                referenceLabels: ['树 1', 'tree-1'],
                partLabels: ['树冠'],
                objectIds: ['tree-1-top'],
                bounds: { x: 100, y: 100, width: 80, height: 80 },
                selected: false,
              },
              {
                id: 'tree-2',
                groupId: 'tree-2',
                groupLabel: '树',
                displayLabel: '树 2',
                referenceLabels: ['树 2', 'tree-2'],
                partLabels: ['树冠'],
                objectIds: ['tree-2-top'],
                bounds: { x: 300, y: 100, width: 80, height: 80 },
                selected: false,
              },
            ],
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
      reason: 'invalid-batch-step-ambiguous-target',
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
        selectedGroupId: undefined,
        semanticGroups: [],
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
