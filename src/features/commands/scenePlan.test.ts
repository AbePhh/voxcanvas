import { describe, expect, it } from 'vitest'
import {
  createScenePlanSummary,
  createScenePlanSummaryFromShapes,
  describeSceneElement,
} from './scenePlan'
import { colorStyles } from '../canvas/colorStyles'
import type { CanvasState } from '../canvas/types'
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

  it('derives the persistent scene description from current canvas shapes', () => {
    const canvas: CanvasState = {
      width: 960,
      height: 560,
      history: [],
      future: [],
      shapes: [
        {
          id: 'scene-wall',
          type: 'rect',
          x: 400,
          y: 330,
          width: 220,
          height: 160,
          fill: colorStyles.orange.fill,
          stroke: colorStyles.orange.stroke,
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '墙体',
          zIndex: 10,
        },
        {
          id: 'scene-roof',
          type: 'triangle',
          x: 360,
          y: 220,
          width: 300,
          height: 130,
          fill: colorStyles.red.fill,
          stroke: colorStyles.red.stroke,
          groupId: 'house-1',
          groupLabel: '房子',
          partLabel: '屋顶',
          zIndex: 20,
        },
        {
          id: 'loose-circle',
          type: 'circle',
          x: 20,
          y: 20,
          width: 60,
          height: 60,
          fill: colorStyles.blue.fill,
          stroke: colorStyles.blue.stroke,
        },
      ],
    }

    expect(createScenePlanSummaryFromShapes(canvas)).toEqual({
      title: '当前场景描述',
      elementCount: 2,
      groupCount: 1,
      groups: [
        {
          id: 'house-1',
          label: '房子',
          elements: [
            expect.objectContaining({
              id: 'scene-wall',
              label: '房子的墙体',
              detail: expect.stringContaining('橙色矩形'),
            }),
            expect.objectContaining({
              id: 'scene-roof',
              label: '房子的屋顶',
              detail: expect.stringContaining('红色三角形'),
            }),
          ],
        },
      ],
      steps: ['保留房子的墙体', '保留房子的屋顶'],
    })
  })

  it('reflects scene edits because it summarizes the latest shape state', () => {
    const canvas: Pick<CanvasState, 'width' | 'height' | 'shapes'> = {
      width: 960,
      height: 560,
      shapes: [
        {
          id: 'scene-tree-crown',
          type: 'circle',
          x: 120,
          y: 80,
          width: 180,
          height: 180,
          fill: colorStyles.green.fill,
          stroke: colorStyles.green.stroke,
          groupId: 'tree-1',
          groupLabel: '树',
          partLabel: '树冠',
        },
      ],
    }

    expect(createScenePlanSummaryFromShapes(canvas)?.groups[0].elements[0]).toEqual(
      expect.objectContaining({
        colorLabel: '绿色',
        detail: expect.stringContaining('左上方'),
      }),
    )

    expect(
      createScenePlanSummaryFromShapes({
        ...canvas,
        shapes: [
          {
            ...canvas.shapes[0],
            x: 700,
            y: 360,
            fill: colorStyles.purple.fill,
            stroke: colorStyles.purple.stroke,
          },
        ],
      })?.groups[0].elements[0],
    ).toEqual(
      expect.objectContaining({
        colorLabel: '紫色',
        detail: expect.stringContaining('右下方'),
      }),
    )

    expect(createScenePlanSummaryFromShapes({ ...canvas, shapes: [] })).toBeNull()
  })
})
