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

const localFallbackReasons = new Set([
  'canvas-resize-needs-semantic-normalization',
  'canvas-resize-intent-needs-normalization',
  'voice-input-may-need-correction',
])

const textCommandPattern = /文本|文字|文本框|标题|标签|写着|写上|内容是|内容为|插入/
const conversationalPattern = /帮我|麻烦|可以|能不能|稍微|一点点|弄一下|调一下|挪一下|放一下|搞/
const asrNoisePattern = /话不|画不|画部|原型|园形|兰色|吕色|绿的|黄的|红的|蓝的|黑的|白的/
const approximateIntentPattern = /差不多|大概|附近|靠近|旁边/
const canvasIntentPattern = /画布|画板|话不|画不|画部/
const canvasResizeIntentPattern = /宽|窄|高|矮|大|小|空间|留白|尺寸|大小/
const bulkEditIntentPattern = /所有|全部|全都|这些|它们|一起|统一|批量|每个|每一/
const alignmentIntentPattern = /对齐|排成|排列|一行|一列|横排|竖排|居中|水平|垂直/
const sceneObjectPattern =
  /场景|房子|屋子|树|太阳|云|桥|河|蛋糕|气球|桌子|椅子|城堡|机器人|花园|小路|山|车|船|鸟|草地|森林/
const sceneCompositionPattern = /旁边|附近|天上|下面|上面|左边|右边|还有|以及|和|一排|一群|多个|几个/

const lowRiskLocalActions = new Set<ParsedCommand['action']>([
  'create',
  'undo',
  'redo',
  'clear',
  'export',
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

function containsBulkOrAlignmentIntent(sourceText: string) {
  return bulkEditIntentPattern.test(sourceText) || alignmentIntentPattern.test(sourceText)
}

function containsSceneCompositionIntent(sourceText: string) {
  return (
    sourceText.length >= 8 &&
    sceneObjectPattern.test(sourceText) &&
    sceneCompositionPattern.test(sourceText)
  )
}

export function getNormalizationDecision(
  sourceText: string,
  localCommand: ParsedCommand,
): NormalizationDecision {
  if (containsTextCommandIntent(sourceText)) {
    return {
      useAi: true,
      reason: 'text-command-needs-semantic-normalization',
    }
  }

  if (containsSceneCompositionIntent(sourceText)) {
    return {
      useAi: true,
      reason: 'complex-scene-needs-planning',
    }
  }

  if (containsBulkOrAlignmentIntent(sourceText)) {
    return {
      useAi: true,
      reason: 'bulk-or-alignment-command-needs-planning',
    }
  }

  if (localCommand.action === 'unknown') {
    return {
      useAi: true,
      reason: localCommand.reason,
    }
  }

  if (localCommand.action === 'resizeCanvas') {
    return {
      useAi: true,
      reason: 'canvas-resize-needs-semantic-normalization',
    }
  }

  if ('target' in localCommand) {
    return {
      useAi: true,
      reason: 'edit-command-needs-semantic-normalization',
    }
  }

  if (containsNoisyOrCasualLanguage(sourceText)) {
    return {
      useAi: true,
      reason: 'voice-input-may-need-correction',
    }
  }

  if (containsCanvasResizeIntent(sourceText)) {
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

export function canFallbackToLocalCommand(
  decision: NormalizationDecision,
  localCommand: ParsedCommand,
) {
  return (
    decision.useAi &&
    localCommand.action !== 'unknown' &&
    localFallbackReasons.has(decision.reason)
  )
}
