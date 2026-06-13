import type { ParsedCommand } from '../commands/types'

export type NormalizationDecision =
  | {
      useAi: true
      reason: string
    }
  | {
      useAi: false
      reason: 'local-command-is-confident'
    }

const textCommandPattern = /文本|文字|文本框|标题|标签|写着|写上|内容是|内容为|插入/
const conversationalPattern = /帮我|麻烦|可以|能不能|稍微|一点点|弄一下|调一下|挪一下|放一下|搞/
const asrNoisePattern = /话不|画不|画部|原型|园形|兰色|吕色|绿的|黄的|红的|蓝的|黑的|白的/
const approximateIntentPattern = /差不多|大概|附近|靠近|旁边/
const canvasIntentPattern = /画布|画板|话不|画不|画部/
const canvasResizeIntentPattern = /宽|窄|高|矮|大|小|空间|留白|尺寸|大小/

const lowRiskLocalActions = new Set<ParsedCommand['action']>([
  'create',
  'move',
  'recolor',
  'resize',
  'delete',
  'undo',
  'redo',
  'export',
  'resizeCanvas',
])

function containsTextCommandIntent(sourceText: string) {
  return textCommandPattern.test(sourceText)
}

function containsNoisyOrCasualLanguage(sourceText: string) {
  return (
    conversationalPattern.test(sourceText) ||
    asrNoisePattern.test(sourceText) ||
    approximateIntentPattern.test(sourceText)
  )
}

function containsCanvasResizeIntent(sourceText: string) {
  return canvasIntentPattern.test(sourceText) && canvasResizeIntentPattern.test(sourceText)
}

export function getNormalizationDecision(
  sourceText: string,
  localCommand: ParsedCommand,
): NormalizationDecision {
  if (localCommand.action === 'unknown') {
    return {
      useAi: true,
      reason: localCommand.reason,
    }
  }

  if (containsTextCommandIntent(sourceText)) {
    return {
      useAi: true,
      reason: 'text-command-needs-semantic-normalization',
    }
  }

  if (containsNoisyOrCasualLanguage(sourceText) && localCommand.action !== 'resizeCanvas') {
    return {
      useAi: true,
      reason: 'voice-input-may-need-correction',
    }
  }

  if (containsCanvasResizeIntent(sourceText) && localCommand.action !== 'resizeCanvas') {
    return {
      useAi: true,
      reason: 'canvas-resize-intent-needs-normalization',
    }
  }

  if (!lowRiskLocalActions.has(localCommand.action)) {
    return {
      useAi: true,
      reason: 'command-needs-semantic-normalization',
    }
  }

  return {
    useAi: false,
    reason: 'local-command-is-confident',
  }
}
