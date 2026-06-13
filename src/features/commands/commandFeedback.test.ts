import { describe, expect, it } from 'vitest'
import {
  createCancellationFeedback,
  createCommandExecutionFeedback,
} from './commandFeedback'

describe('commandFeedback', () => {
  it('describes executed AI-corrected create commands', () => {
    expect(
      createCommandExecutionFeedback(
        {
          action: 'create',
          shape: 'circle',
          color: 'blue',
          position: 'center',
          size: 'medium',
          sourceText: '画一个兰色园形',
        },
        {
          source: 'ai',
          status: 'executed',
          correction: {
            correctedText: '画一个蓝色圆形',
            interpretedIntent: '在画布中心创建蓝色圆形',
            explanation: '将“兰色园形”纠正为“蓝色圆形”',
            confidence: 'high',
          },
        },
      ),
    ).toEqual({
      source: 'ai',
      status: 'executed',
      title: '创建图形',
      summary: '创建蓝色圆形。',
      details: ['图形：圆形', '尺寸：medium', '颜色：蓝色', '位置：中间'],
      correction: {
        correctedText: '画一个蓝色圆形',
        interpretedIntent: '在画布中心创建蓝色圆形',
        explanation: '将“兰色园形”纠正为“蓝色圆形”',
        confidence: 'high',
      },
    })
  })

  it('creates cancellation feedback without executing a command', () => {
    expect(createCancellationFeedback('停下')).toEqual({
      source: 'local',
      status: 'blocked',
      title: '取消命令',
      summary: '已取消当前语音命令，没有执行新的绘图操作。',
      details: ['取消输入：停下'],
    })
  })
})
