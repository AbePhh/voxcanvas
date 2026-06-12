import { describe, expect, it } from 'vitest'
import { shouldUseAiPlanner } from './aiPlanner'

describe('shouldUseAiPlanner', () => {
  it('uses AI for unknown commands', () => {
    expect(shouldUseAiPlanner('画一个漂亮的生日派对', 'unknown')).toBe(true)
  })

  it('uses AI for text-heavy commands even when local parser finds a command', () => {
    expect(
      shouldUseAiPlanner(
        '添加一个文本框在右上角内容是我是张红兵颜色是蓝色',
        'create',
      ),
    ).toBe(true)
  })

  it('keeps simple geometry commands on the local path', () => {
    expect(shouldUseAiPlanner('画一个红色圆形', 'create')).toBe(false)
    expect(shouldUseAiPlanner('把它往右移动一点', 'move')).toBe(false)
  })
})
