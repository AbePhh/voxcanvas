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
        '左上方的绿色圆形',
        '当前选中的中间的绿色圆形',
      ]),
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
