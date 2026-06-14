import { describe, expect, it } from 'vitest'
import { extractWakeCommand } from './wakeWord'

describe('extractWakeCommand', () => {
  it('extracts the command after the canonical wake word', () => {
    expect(extractWakeCommand('智能绘图，画一个红色圆形')).toMatchObject({
      status: 'command',
      commandText: '画一个红色圆形',
      wakeWord: '智能绘图',
      confidence: 'exact',
    })
  })

  it('accepts common wake word aliases from speech recognition', () => {
    expect(extractWakeCommand('智能画图，画一个蓝色矩形')).toMatchObject({
      status: 'command',
      commandText: '画一个蓝色矩形',
      wakeWord: '智能画图',
      confidence: 'alias',
    })
  })

  it('accepts fuzzy wake words only when a drawing intent follows', () => {
    expect(extractWakeCommand('智能会图，把树移动到右边')).toMatchObject({
      status: 'command',
      commandText: '把树移动到右边',
      confidence: 'alias',
    })

    expect(extractWakeCommand('智 能 汇 画，导出 PNG')).toMatchObject({
      status: 'command',
      commandText: '导出 PNG',
      confidence: 'fuzzy',
    })
  })

  it('ignores speech without a wake word', () => {
    expect(extractWakeCommand('画一个红色圆形')).toMatchObject({
      status: 'ignored',
    })
  })

  it('ignores broad drawing words that are not reliable wake words', () => {
    expect(extractWakeCommand('绘图这个功能应该怎么做')).toMatchObject({
      status: 'ignored',
    })
  })

  it('keeps waiting when only a wake word is spoken', () => {
    expect(extractWakeCommand('智能绘图')).toMatchObject({
      status: 'wake-only',
      wakeWord: '智能绘图',
      confidence: 'exact',
    })
  })

  it('uses the text after the first wake word when ambient speech appears before it', () => {
    expect(extractWakeCommand('刚才说错了，智能绘图，把树移动到右边')).toMatchObject({
      status: 'command',
      commandText: '把树移动到右边',
    })
  })
})
