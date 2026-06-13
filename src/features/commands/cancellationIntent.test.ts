import { describe, expect, it } from 'vitest'
import { isCancellationIntent } from './cancellationIntent'

describe('isCancellationIntent', () => {
  it('detects direct cancellation phrases', () => {
    expect(isCancellationIntent('取消')).toBe(true)
    expect(isCancellationIntent('停下')).toBe(true)
    expect(isCancellationIntent('停止')).toBe(true)
    expect(isCancellationIntent('算了')).toBe(true)
    expect(isCancellationIntent('不用了')).toBe(true)
    expect(isCancellationIntent('别执行')).toBe(true)
  })

  it('detects cancellation phrases at the end of a longer command', () => {
    expect(isCancellationIntent('画一间房子，旁边有一棵树，右上角有太阳取消')).toBe(true)
    expect(isCancellationIntent('生成一个生日派对，算了')).toBe(true)
    expect(isCancellationIntent('把房子移动到左边，不用了')).toBe(true)
    expect(isCancellationIntent('画一个蓝色圆形 停止')).toBe(true)
  })

  it('detects strong cancellation phrases inside a command', () => {
    expect(isCancellationIntent('刚才那句别执行')).toBe(true)
    expect(isCancellationIntent('这个命令不要执行')).toBe(true)
    expect(isCancellationIntent('这次别画了，先停一下')).toBe(true)
    expect(isCancellationIntent('画房子算了再说')).toBe(true)
  })

  it('does not cancel when cancellation words are text content or object names', () => {
    expect(isCancellationIntent('添加文字取消按钮')).toBe(false)
    expect(isCancellationIntent('画一个取消图标')).toBe(false)
    expect(isCancellationIntent('写上取消两个字')).toBe(false)
    expect(isCancellationIntent('添加一个文本内容是取消')).toBe(false)
    expect(isCancellationIntent('生成一个标题是不要执行')).toBe(false)
  })

  it('ignores empty text and unrelated commands', () => {
    expect(isCancellationIntent('')).toBe(false)
    expect(isCancellationIntent('   ')).toBe(false)
    expect(isCancellationIntent('画一个蓝色圆形')).toBe(false)
  })
})
