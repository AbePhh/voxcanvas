import { describe, expect, it } from 'vitest'
import { createTargetFeedback } from './targetDescriptions'
import type { CanvasState } from './types'

const baseCanvas: CanvasState = {
  width: 960,
  height: 560,
  history: [],
  future: [],
  shapes: [],
}

describe('createTargetFeedback', () => {
  it('returns ok when a target resolves to one shape', () => {
    const canvas: CanvasState = {
      ...baseCanvas,
      shapes: [
        {
          id: 'green-circle-1',
          type: 'circle',
          x: 100,
          y: 100,
          width: 80,
          height: 80,
          fill: '#22c55e',
          stroke: '#166534',
        },
      ],
    }

    expect(
      createTargetFeedback(
        {
          action: 'move',
          target: {
            mode: 'shape',
            shape: 'circle',
            color: 'green',
          },
          mode: 'absolute',
          position: 'top-right',
          sourceText: '把绿色圆形移动到右上角',
        },
        canvas,
      ),
    ).toEqual({
      status: 'ok',
    })
  })

  it('describes candidate shapes when a target is ambiguous', () => {
    const canvas: CanvasState = {
      ...baseCanvas,
      selectedId: 'green-circle-2',
      shapes: [
        {
          id: 'green-circle-1',
          type: 'circle',
          x: 100,
          y: 80,
          width: 80,
          height: 80,
          fill: '#22c55e',
          stroke: '#166534',
        },
        {
          id: 'green-circle-2',
          type: 'circle',
          x: 440,
          y: 240,
          width: 80,
          height: 80,
          fill: '#22c55e',
          stroke: '#166534',
        },
      ],
    }

    const feedback = createTargetFeedback(
      {
        action: 'move',
        target: {
          mode: 'shape',
          shape: 'circle',
          color: 'green',
        },
        mode: 'absolute',
        position: 'top-right',
        sourceText: '把绿色圆形移动到右上角',
      },
      canvas,
    )

    expect(feedback).toMatchObject({
      status: 'ambiguous',
      message: '找到 2 个匹配的绿色圆形，请说得更具体一些。',
      candidates: expect.arrayContaining([
        expect.objectContaining({
          id: 'green-circle-1',
          label: '左上方的绿色圆形',
        }),
        expect.objectContaining({
          id: 'green-circle-2',
          label: '当前选中的中间的绿色圆形',
        }),
      ]),
    })
  })

  it('prefers scene group and part labels for generated scene objects', () => {
    const canvas: CanvasState = {
      ...baseCanvas,
      selectedId: 'house-roof',
      shapes: [
        {
          id: 'house-roof',
          type: 'triangle',
          x: 360,
          y: 180,
          width: 260,
          height: 120,
          fill: '#ef4444',
          stroke: '#991b1b',
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '屋顶',
          zIndex: 20,
        },
        {
          id: 'tree-top',
          type: 'circle',
          x: 680,
          y: 220,
          width: 130,
          height: 130,
          fill: '#22c55e',
          stroke: '#166534',
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树冠',
          zIndex: 12,
        },
      ],
    }

    const feedback = createTargetFeedback(
      {
        action: 'delete',
        target: {
          mode: 'any',
        },
        sourceText: '删除一个东西',
      },
      canvas,
    )

    expect(feedback).toMatchObject({
      status: 'ambiguous',
      candidates: expect.arrayContaining([
        expect.objectContaining({
          id: 'house-roof',
          label: '当前选中的房子的屋顶',
        }),
        expect.objectContaining({
          id: 'tree-top',
          label: '树的树冠',
        }),
      ]),
    })
  })

  it('treats one semantic group with multiple parts as a valid target', () => {
    const canvas: CanvasState = {
      ...baseCanvas,
      shapes: [
        {
          id: 'tree-trunk',
          type: 'rect',
          x: 680,
          y: 330,
          width: 50,
          height: 150,
          fill: '#f97316',
          stroke: '#9a3412',
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树干',
        },
        {
          id: 'tree-top',
          type: 'circle',
          x: 630,
          y: 230,
          width: 150,
          height: 150,
          fill: '#22c55e',
          stroke: '#166534',
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树冠',
        },
      ],
    }

    expect(
      createTargetFeedback(
        {
          action: 'move',
          target: {
            mode: 'semantic',
            groupLabel: '树',
          },
          mode: 'relative',
          direction: 'right',
          distance: 48,
          sourceText: '把树往右移动一点',
        },
        canvas,
      ),
    ).toEqual({ status: 'ok' })
  })

  it('creates group-level candidates when a semantic target is ambiguous', () => {
    const canvas: CanvasState = {
      ...baseCanvas,
      shapes: [
        {
          id: 'left-tree-trunk',
          type: 'rect',
          x: 120,
          y: 330,
          width: 50,
          height: 150,
          fill: '#f97316',
          stroke: '#9a3412',
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树干',
        },
        {
          id: 'left-tree-top',
          type: 'circle',
          x: 80,
          y: 230,
          width: 150,
          height: 150,
          fill: '#22c55e',
          stroke: '#166534',
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树冠',
        },
        {
          id: 'right-tree-trunk',
          type: 'rect',
          x: 720,
          y: 330,
          width: 50,
          height: 150,
          fill: '#f97316',
          stroke: '#9a3412',
          groupId: 'tree-2',
          groupLabel: '树',
          partLabel: '树干',
        },
        {
          id: 'right-tree-top',
          type: 'circle',
          x: 680,
          y: 230,
          width: 150,
          height: 150,
          fill: '#22c55e',
          stroke: '#166534',
          groupId: 'tree-2',
          groupLabel: '树',
          partLabel: '树冠',
        },
      ],
    }

    expect(
      createTargetFeedback(
        {
          action: 'delete',
          target: {
            mode: 'semantic',
            groupLabel: '树',
          },
          sourceText: '删除树',
        },
        canvas,
      ),
    ).toMatchObject({
      status: 'ambiguous',
      candidates: [
        {
          id: 'tree-1',
          label: '左侧的树（2个部件）',
          target: {
            mode: 'semantic',
            groupId: 'tree-1',
            groupLabel: '树',
          },
        },
        {
          id: 'tree-2',
          label: '右侧的树（2个部件）',
          target: {
            mode: 'semantic',
            groupId: 'tree-2',
            groupLabel: '树',
          },
        },
      ],
    })
  })

  it('explains when no target matches', () => {
    expect(
      createTargetFeedback(
        {
          action: 'delete',
          target: {
            mode: 'shape',
            shape: 'triangle',
            color: 'red',
          },
          sourceText: '删除红色三角形',
        },
        baseCanvas,
      ),
    ).toMatchObject({
      status: 'missing',
      message: '没有找到匹配的红色三角形。请重新描述目标，或者先选中要编辑的图形。',
    })
  })
})
