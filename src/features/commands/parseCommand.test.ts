import { describe, expect, it } from 'vitest'
import { parseCommand } from './parseCommand'

describe('parseCommand', () => {
  it('parses a shape creation command with color and position', () => {
    expect(parseCommand('画一个红色圆形，放在左上角')).toMatchObject({
      action: 'create',
      shape: 'circle',
      color: 'red',
      position: 'top-left',
      size: 'medium',
    })
  })

  it('parses size keywords for creation commands', () => {
    expect(parseCommand('添加一个大的蓝色矩形')).toMatchObject({
      action: 'create',
      shape: 'rect',
      color: 'blue',
      size: 'large',
    })
  })

  it('parses undo, redo, and clear commands', () => {
    expect(parseCommand('撤销')).toMatchObject({ action: 'undo' })
    expect(parseCommand('重做')).toMatchObject({ action: 'redo' })
    expect(parseCommand('清空画布')).toMatchObject({ action: 'clear' })
  })

  it('returns an unknown command for unsupported text', () => {
    expect(parseCommand('今天天气怎么样')).toMatchObject({
      action: 'unknown',
      reason: 'unsupported-action',
    })
  })

  it('returns a missing-shape reason when create intent has no supported shape', () => {
    expect(parseCommand('画一个漂亮的东西')).toMatchObject({
      action: 'unknown',
      reason: 'missing-shape',
    })
  })
})
