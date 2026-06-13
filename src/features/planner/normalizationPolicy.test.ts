import { describe, expect, it } from 'vitest'
import {
  canFallbackToLocalCommand,
  getNormalizationDecision,
} from './normalizationPolicy'
import type { ParsedCommand } from '../commands/types'

describe('getNormalizationDecision', () => {
  const confidentCreateCommand: ParsedCommand = {
    action: 'create',
    shape: 'circle',
    color: 'red',
    size: 'medium',
    sourceText: '画一个红色圆形',
  }

  it('keeps confident low-risk commands on the local path', () => {
    expect(getNormalizationDecision('画一个红色圆形', confidentCreateCommand)).toEqual({
      useAi: false,
      reason: 'local-command-is-confident',
    })
  })

  it('normalizes unknown commands through AI', () => {
    expect(
      getNormalizationDecision('画一个漂亮的生日派对', {
        action: 'unknown',
        reason: 'planner-required-scene-or-shape',
        sourceText: '画一个漂亮的生日派对',
      }),
    ).toEqual({
      useAi: true,
      reason: 'planner-required-scene-or-shape',
    })
  })

  it('routes canvas resize commands through AI normalization', () => {
    expect(
      getNormalizationDecision('话不左边宽一点', {
        action: 'resizeCanvas',
        mode: 'relative',
        direction: 'wider',
        anchor: 'left',
        amount: 120,
        sourceText: '话不左边宽一点',
      }),
    ).toEqual({
      useAi: true,
      reason: 'canvas-resize-needs-semantic-normalization',
    })
  })

  it('normalizes noisy speech and casual wording through AI when local parsing is not enough', () => {
    expect(getNormalizationDecision('话不左边宽一点', confidentCreateCommand)).toEqual({
      useAi: true,
      reason: 'voice-input-may-need-correction',
    })

    expect(getNormalizationDecision('麻烦帮我画一个红色圆形', confidentCreateCommand)).toEqual({
      useAi: true,
      reason: 'voice-input-may-need-correction',
    })
  })

  it('normalizes text commands through AI', () => {
    expect(
      getNormalizationDecision('添加文本框内容是欢迎使用', confidentCreateCommand),
    ).toEqual({
      useAi: true,
      reason: 'text-command-needs-semantic-normalization',
    })
  })

  it('routes complex multi-object scenes to AI planning', () => {
    expect(
      getNormalizationDecision('画一间房子，旁边有一棵树，右上角有太阳', {
        action: 'unknown',
        reason: 'planner-required-scene-or-shape',
        sourceText: '画一间房子，旁边有一棵树，右上角有太阳',
      }),
    ).toEqual({
      useAi: true,
      reason: 'complex-scene-needs-planning',
    })

    expect(
      getNormalizationDecision('画一个生日派对，有蛋糕、气球和桌子', confidentCreateCommand),
    ).toEqual({
      useAi: true,
      reason: 'complex-scene-needs-planning',
    })
  })

  it('does not fallback to a local single-shape command for complex scenes', () => {
    const decision = getNormalizationDecision(
      '画一间房子旁边有一棵树右上角有太阳',
      {
        action: 'create',
        shape: 'circle',
        position: 'top-right',
        size: 'medium',
        sourceText: '画一间房子旁边有一棵树右上角有太阳',
      },
    )

    expect(decision).toEqual({
      useAi: true,
      reason: 'complex-scene-needs-planning',
    })
    expect(canFallbackToLocalCommand(decision, confidentCreateCommand)).toBe(false)
  })

  it('allows local fallback for recoverable canvas resize normalization', () => {
    const localResizeCommand: ParsedCommand = {
      action: 'resizeCanvas',
      mode: 'relative',
      direction: 'wider',
      anchor: 'left',
      sourceText: '话不左边宽一点',
    }
    const decision = getNormalizationDecision('话不左边宽一点', localResizeCommand)

    expect(canFallbackToLocalCommand(decision, localResizeCommand)).toBe(true)
  })

  it('routes edit commands through AI normalization', () => {
    expect(
      getNormalizationDecision('把绿色圆形移到右上角', {
        action: 'move',
        target: {
          mode: 'shape',
          shape: 'circle',
          color: 'green',
        },
        mode: 'absolute',
        position: 'top-right',
        sourceText: '把绿色圆形移到右上角',
      }),
    ).toEqual({
      useAi: true,
      reason: 'edit-command-needs-semantic-normalization',
    })
  })

  it('normalizes approximate edit wording through AI', () => {
    expect(
      getNormalizationDecision('把靠近左边的圆挪开一点', {
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
    ).toEqual({
      useAi: true,
      reason: 'edit-command-needs-semantic-normalization',
    })
  })
})
