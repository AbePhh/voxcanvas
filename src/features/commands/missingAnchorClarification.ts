import {
  createWholeScenePromptFromMissingAnchor,
  describeRelation,
  type RelativeAdditionIntent,
} from './relativeAnchorIntent'
import type { CommandExecutionFeedback } from './commandFeedback'

export type MissingAnchorClarification = {
  intent: RelativeAdditionIntent
  prompt: string
}

const confirmPattern =
  /^(?:可以|好|好的|行|没问题|确认|是|对|生成|创建|画|先画|帮我生成|帮我画)$/
const rejectPattern = /^(?:不要|不用|不用了|取消|算了|先不|否|不是)$/

function normalizeText(text: string) {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?；;：:"“”'‘’（）()[\]{}]/g, '')
    .trim()
}

export function createMissingAnchorClarification(
  intent: RelativeAdditionIntent,
): MissingAnchorClarification {
  return {
    intent,
    prompt: createWholeScenePromptFromMissingAnchor(intent),
  }
}

export function resolveMissingAnchorClarification(
  rawText: string,
  pending: MissingAnchorClarification,
) {
  const text = normalizeText(rawText)

  if (!text || rejectPattern.test(text)) {
    return {
      status: 'cancelled' as const,
    }
  }

  if (confirmPattern.test(text)) {
    return {
      status: 'confirmed' as const,
      prompt: pending.prompt,
    }
  }

  return null
}

export function createMissingAnchorFeedback(
  intent: RelativeAdditionIntent,
): CommandExecutionFeedback {
  const objectLabel = intent.objectLabel ?? '新内容'

  return {
    source: 'ai',
    status: 'needs-clarification',
    title: 'Missing Reference',
    summary: `I could not find "${intent.anchorLabel}", so I cannot place "${objectLabel}" ${describeRelation(intent.relation)} it yet.`,
    details: [
      `Reference: ${intent.anchorLabel}`,
      `New content: ${objectLabel}`,
      `Relation: ${describeRelation(intent.relation)}`,
      `Say "可以" to generate a complete scene with both ${intent.anchorLabel} and ${objectLabel}.`,
    ],
  }
}
