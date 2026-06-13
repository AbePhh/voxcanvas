import { describe, expect, it } from 'vitest'
import { createScenePlanSummary, describeSceneElement } from './scenePlan'
import type { SceneCommand } from './types'

const houseScene: SceneCommand = {
  action: 'scene',
  title: '房子和太阳',
  sourceText: '画一间房子和太阳',
  elements: [
    {
      id: 'sun',
      groupId: 'sun-1',
      groupLabel: '太阳',
      shape: 'circle',
      color: 'yellow',
      bbox: { x: 760, y: 60, width: 120, height: 120 },
      zIndex: 30,
    },
    {
      id: 'house-roof',
      groupId: 'house-1',
      groupLabel: '房子',
      partLabel: '屋顶',
      shape: 'triangle',
      color: 'red',
      bbox: { x: 360, y: 220, width: 300, height: 130 },
      zIndex: 20,
    },
    {
      id: 'house-wall',
      groupId: 'house-1',
      groupLabel: '房子',
      partLabel: '墙体',
      shape: 'rect',
      color: 'orange',
      bbox: { x: 400, y: 330, width: 220, height: 160 },
      zIndex: 10,
    },
  ],
}

describe('scene plan summaries', () => {
  it('groups scene elements by semantic group and orders steps by zIndex', () => {
    expect(createScenePlanSummary(houseScene)).toEqual({
      title: '房子和太阳',
      elementCount: 3,
      groupCount: 2,
      groups: [
        {
          id: 'house-1',
          label: '房子',
          elements: [
            expect.objectContaining({
              id: 'house-wall',
              label: '房子的墙体',
              partLabel: '墙体',
            }),
            expect.objectContaining({
              id: 'house-roof',
              label: '房子的屋顶',
              partLabel: '屋顶',
            }),
          ],
        },
        {
          id: 'sun-1',
          label: '太阳',
          elements: [
            expect.objectContaining({
              id: 'sun',
              label: '太阳',
            }),
          ],
        },
      ],
      steps: ['创建房子的墙体', '创建房子的屋顶', '创建太阳'],
    })
  })

  it('falls back to visual labels when semantic labels are missing', () => {
    expect(
      describeSceneElement({
        id: 'text-1',
        shape: 'text',
        color: 'blue',
        text: '欢迎来到生日派对',
        bbox: { x: 100, y: 100, width: 240, height: 60 },
      }),
    ).toBe('蓝色文本“欢迎来到生日派对”')
  })
})
