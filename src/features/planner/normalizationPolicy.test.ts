import { describe, expect, it } from 'vitest'
import { getNormalizationDecision } from './normalizationPolicy'
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
        reason: 'missing-shape',
        sourceText: '画一个漂亮的生日派对',
      }),
    ).toEqual({
      useAi: true,
      reason: 'missing-shape',
    })
  })

  it('keeps locally understood canvas ASR corrections on the local path', () => {
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
      useAi: false,
      reason: 'local-command-is-confident',
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

  it('keeps explicit edit commands local when they are not noisy', () => {
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
      useAi: false,
      reason: 'local-command-is-confident',
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
      reason: 'voice-input-may-need-correction',
    })
  })
})
