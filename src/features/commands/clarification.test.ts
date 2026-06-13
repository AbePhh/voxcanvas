import { describe, expect, it } from 'vitest'
import {
  createPendingClarification,
  resolveClarificationResponse,
} from './clarification'
import type { ParsedCommand } from './types'

const moveYellowCircleCommand: ParsedCommand = {
  action: 'move',
  target: {
    mode: 'any',
    color: 'yellow',
  },
  mode: 'relative',
  direction: 'up',
  distance: 48,
  sourceText: '把黄色圆形上移',
}

const candidates = [
  {
    id: 'circle-center',
    label: '当前选中的中间的黄色圆形',
  },
  {
    id: 'circle-top-right',
    label: '右上方的黄色圆形',
  },
]

describe('clarification', () => {
  it('creates pending clarification for editable commands', () => {
    expect(
      createPendingClarification(moveYellowCircleCommand, candidates, '把黄色圆形上移'),
    ).toMatchObject({
      command: moveYellowCircleCommand,
      candidates,
      sourceText: '把黄色圆形上移',
    })

    expect(
      createPendingClarification(
        {
          action: 'create',
          shape: 'circle',
          size: 'medium',
          sourceText: '画一个圆',
        },
        candidates,
        '画一个圆',
      ),
    ).toBeNull()
  })

  it('uses candidate order to clarify a pending command', () => {
    const pending = createPendingClarification(
      moveYellowCircleCommand,
      candidates,
      '把黄色圆形上移',
    )

    expect(pending).not.toBeNull()

    expect(resolveClarificationResponse('第二个', pending!)).toMatchObject({
      action: 'move',
      target: {
        mode: 'any',
        id: 'circle-top-right',
      },
      mode: 'relative',
      direction: 'up',
    })
  })

  it('uses structured candidate targets when clarifying semantic groups', () => {
    const pending = createPendingClarification(
      {
        action: 'delete',
        target: {
          mode: 'semantic',
          groupLabel: '树',
        },
        sourceText: '删除树',
      },
      [
        {
          id: 'tree-1',
          label: '左侧的树（2个部件）',
          target: {
            mode: 'semantic',
            groupId: 'tree-1',
            groupLabel: '树',
          },
        },
        {
          id: 'tree-2',
          label: '右侧的树（2个部件）',
          target: {
            mode: 'semantic',
            groupId: 'tree-2',
            groupLabel: '树',
          },
        },
      ],
      '删除树',
    )

    expect(resolveClarificationResponse('第二个', pending!)).toMatchObject({
      action: 'delete',
      target: {
        mode: 'semantic',
        groupId: 'tree-2',
        groupLabel: '树',
      },
    })
  })

  it('uses target filters to clarify a pending command', () => {
    const pending = createPendingClarification(
      moveYellowCircleCommand,
      candidates,
      '把黄色圆形上移',
    )

    expect(resolveClarificationResponse('右上方那个', pending!)).toMatchObject({
      action: 'move',
      target: {
        mode: 'position',
        color: 'yellow',
        position: 'top-right',
      },
      mode: 'relative',
      direction: 'up',
    })
  })

  it('ignores cancellation and unsupported clarification text', () => {
    const pending = createPendingClarification(
      moveYellowCircleCommand,
      candidates,
      '把黄色圆形上移',
    )

    expect(resolveClarificationResponse('算了', pending!)).toBeNull()
    expect(resolveClarificationResponse('很好看', pending!)).toBeNull()
  })
})
