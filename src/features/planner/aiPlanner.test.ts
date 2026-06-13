import { describe, expect, it } from 'vitest'
import { shouldUseAiPlanner } from './aiPlanner'
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
})
