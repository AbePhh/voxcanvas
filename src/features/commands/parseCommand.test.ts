import { describe, expect, it } from 'vitest'
import { parseCommand } from './parseCommand'

describe('parseCommand', () => {
  it('parses low-risk shape creation commands locally', () => {
    expect(parseCommand('画一个红色圆形，放在左上角')).toMatchObject({
      action: 'create',
      shape: 'circle',
      color: 'red',
      position: 'top-left',
      size: 'medium',
    })

    expect(parseCommand('添加一个大的蓝色矩形')).toMatchObject({
      action: 'create',
      shape: 'rect',
      color: 'blue',
      size: 'large',
    })
  })

  it('parses simple history and canvas commands locally', () => {
    expect(parseCommand('撤销')).toMatchObject({ action: 'undo' })
    expect(parseCommand('重做')).toMatchObject({ action: 'redo' })
    expect(parseCommand('清空画布')).toMatchObject({ action: 'clear' })
  })

  it('parses image export commands locally', () => {
    expect(parseCommand('导出图片')).toMatchObject({
      action: 'export',
      format: undefined,
    })

    expect(parseCommand('导出 JPG')).toMatchObject({
      action: 'export',
      format: 'jpg',
    })

    expect(parseCommand('导出 PNG')).toMatchObject({
      action: 'export',
      format: 'png',
    })

    expect(parseCommand('导出 SVG')).toMatchObject({
      action: 'export',
      format: 'svg',
    })
  })

  it('sends text creation commands to the planner', () => {
    expect(parseCommand('添加一段蓝色文字，内容是欢迎使用')).toMatchObject({
      action: 'unknown',
      reason: 'planner-required-text-command',
    })

    expect(parseCommand('创建文本写着“VoxCanvas”')).toMatchObject({
      action: 'unknown',
      reason: 'planner-required-text-command',
    })
  })

  it('returns unknown for unsupported or incomplete commands', () => {
    expect(parseCommand('今天天气怎么样')).toMatchObject({
      action: 'unknown',
      reason: 'unsupported-action',
    })

    expect(parseCommand('画一个漂亮的东西')).toMatchObject({
      action: 'unknown',
      reason: 'missing-shape',
    })
  })

  it('parses explicit selected or recent-object edit commands locally', () => {
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
    expect(parseCommand('把它移动到右下角')).not.toMatchObject({
      target: {
        position: 'bottom-right',
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

    expect(parseCommand('把绿色的圆圈移动到右上角')).toMatchObject({
      action: 'move',
      mode: 'absolute',
      position: 'top-right',
      target: {
        mode: 'shape',
        shape: 'circle',
        color: 'green',
      },
    })

    expect(parseCommand('把它改成黄色')).toMatchObject({
      action: 'recolor',
      color: 'yellow',
      target: {
        mode: 'selected',
      },
    })

    expect(parseCommand('把红色的三角形变成绿色')).toMatchObject({
      action: 'recolor',
      color: 'green',
      target: {
        mode: 'shape',
        shape: 'triangle',
        color: 'red',
      },
    })

    expect(parseCommand('把选中的图形缩小')).toMatchObject({
      action: 'resize',
      direction: 'smaller',
      target: {
        mode: 'selected',
      },
    })

    expect(parseCommand('删除它')).toMatchObject({
      action: 'delete',
      target: {
        mode: 'selected',
      },
    })
  })

  it('does not execute dangerous edit commands without explicit references', () => {
    expect(parseCommand('删除很厉害三个字')).toMatchObject({
      action: 'unknown',
      reason: 'unsafe-delete-target',
    })

    expect(parseCommand('删除圆形')).toMatchObject({
      action: 'delete',
      target: {
        mode: 'shape',
        shape: 'circle',
      },
    })

    expect(parseCommand('移动到右下角')).toMatchObject({
      action: 'unknown',
      reason: 'unsafe-move-target',
    })

    expect(parseCommand('改成红色')).toMatchObject({
      action: 'unknown',
      reason: 'unsafe-recolor-target',
    })

    expect(parseCommand('放大')).toMatchObject({
      action: 'unknown',
      reason: 'unsafe-resize-target',
    })
  })

  it('does not guess complex target descriptions locally', () => {
    expect(parseCommand('把蓝色的圆移动到右上角')).toMatchObject({
      action: 'move',
      target: {
        mode: 'shape',
        shape: 'circle',
        color: 'blue',
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

    expect(parseCommand('把漂亮的东西变成绿色')).toMatchObject({
      action: 'unknown',
      reason: 'unsafe-recolor-target',
    })
  })
})
