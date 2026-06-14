import { describe, expect, it } from 'vitest'
import { aiPlanner, shouldUseAiPlanner } from './aiPlanner'
import type { ParsedCommand } from '../commands/types'

describe('shouldUseAiPlanner', () => {
  const createCircleCommand: ParsedCommand = {
    action: 'create',
    shape: 'circle',
    color: 'red',
    size: 'medium',
    sourceText: '画一个红色圆形',
  }

  it('uses AI for unknown commands', () => {
    expect(
      shouldUseAiPlanner('画一个漂亮的生日派对', {
        action: 'unknown',
        reason: 'planner-required-scene-or-shape',
        sourceText: '画一个漂亮的生日派对',
      }),
    ).toBe(true)
  })

  it('uses AI for text-heavy commands even when local parser finds a command', () => {
    expect(
      shouldUseAiPlanner(
        '添加一个文本框在右上角内容是我是张红兵颜色是蓝色',
        {
          ...createCircleCommand,
          shape: 'text',
          sourceText: '添加一个文本框在右上角内容是我是张红兵颜色是蓝色',
        },
      ),
    ).toBe(true)
  })

  it('uses AI for noisy or casual voice input', () => {
    expect(shouldUseAiPlanner('话不左边宽一点', createCircleCommand)).toBe(true)
    expect(shouldUseAiPlanner('帮我稍微画一个红色圆形', createCircleCommand)).toBe(true)
  })

  it('uses AI for approximate edit wording so targets can be normalized safely', () => {
    expect(
      shouldUseAiPlanner('把靠近左边的圆挪开一点', {
        action: 'move',
        target: {
          mode: 'shape',
          shape: 'circle',
        },
        mode: 'relative',
        direction: 'right',
        distance: 48,
        sourceText: '把靠近左边的圆挪开一点',
      }),
    ).toBe(true)
  })

  it('keeps simple geometry commands on the local path', () => {
    expect(shouldUseAiPlanner('画一个红色圆形', createCircleCommand)).toBe(false)
  })

  it('falls back to a validated align command when the upstream planner is too conservative', async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = (() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            rawCommand: {
              action: 'unknown',
              reason: 'unsupported-action',
              sourceText: '让三个圆左对齐',
            },
          }),
      } as Response)) as typeof fetch

    const result = await aiPlanner({
      sourceText: '让三个圆左对齐',
      localCommand: {
        action: 'unknown',
        reason: 'unsupported-action',
        sourceText: '让三个圆左对齐',
      },
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
        objects: [
          {
            id: 'circle-1',
            type: 'circle',
            x: 120,
            y: 100,
            width: 80,
            height: 80,
            fill: '#ef4444',
            text: undefined,
          },
          {
            id: 'circle-2',
            type: 'circle',
            x: 280,
            y: 180,
            width: 80,
            height: 80,
            fill: '#3b82f6',
            text: undefined,
          },
          {
            id: 'circle-3',
            type: 'circle',
            x: 430,
            y: 260,
            width: 80,
            height: 80,
            fill: '#facc15',
            text: undefined,
          },
        ],
      },
    })

    expect(result).toMatchObject({
      status: 'planned',
      command: {
        action: 'align',
        target: {
          mode: 'shape',
          shape: 'circle',
          scope: 'all',
          count: 3,
        },
        axis: 'left',
      },
    })

    globalThis.fetch = originalFetch
  })
})
