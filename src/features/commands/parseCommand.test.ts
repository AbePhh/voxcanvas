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

  it('parses text content for text creation commands', () => {
    expect(parseCommand('添加一段蓝色文字，内容是欢迎使用')).toMatchObject({
      action: 'create',
      shape: 'text',
      color: 'blue',
      text: '欢迎使用',
    })

    expect(parseCommand('创建文本写着“VoxCanvas”')).toMatchObject({
      action: 'create',
      shape: 'text',
      text: 'VoxCanvas',
    })
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

  it('parses edit and delete commands', () => {
    expect(parseCommand('把刚才那个圆移动到右下角')).toMatchObject({
      action: 'move',
      mode: 'absolute',
      position: 'bottom-right',
      target: {
        mode: 'last',
        shape: 'circle',
      },
    })

    expect(parseCommand('把它移动到右下角')).toMatchObject({
      action: 'move',
      mode: 'absolute',
      position: 'bottom-right',
      target: {
        mode: 'selected',
      },
    })

    expect(parseCommand('把它往右移动一点')).toMatchObject({
      action: 'move',
      mode: 'relative',
      direction: 'right',
      distance: 48,
      target: {
        mode: 'selected',
      },
    })

    expect(parseCommand('把矩形改成黄色')).toMatchObject({
      action: 'recolor',
      color: 'yellow',
      target: {
        mode: 'shape',
        shape: 'rect',
      },
    })

    expect(parseCommand('把选中的图形缩小')).toMatchObject({
      action: 'resize',
      direction: 'smaller',
      target: {
        mode: 'selected',
      },
    })

    expect(parseCommand('删除左边的三角形')).toMatchObject({
      action: 'delete',
      target: {
        mode: 'shape',
        shape: 'triangle',
        position: 'left',
      },
    })
  })
})
