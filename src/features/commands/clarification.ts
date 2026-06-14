import {
  colorKeywords,
  positionKeywords,
  shapeKeywords,
} from './commandDictionaries'
import type { CommandPosition, CommandTarget, ParsedCommand } from './types'
import type { TargetCandidate } from '../canvas/targetDescriptions'
import type { TargetFeedbackRole } from '../canvas/targetDescriptions'
import type { ShapeKind } from '../canvas/types'

type EditableCommand = Extract<
  ParsedCommand,
  { action: 'move' | 'recolor' | 'resize' | 'delete' | 'align' | 'arrange' }
>

export type PendingClarification = {
  command: EditableCommand
  candidates: TargetCandidate[]
  sourceText: string
  role: TargetFeedbackRole
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, '').replace(/[，。！？、,.!?]/g, '').trim()
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword))
}

function findDictionaryMatch<T extends string>(
  text: string,
  dictionary: Record<T, string[]>,
) {
  return (Object.entries(dictionary) as Array<[T, string[]]>)
    .flatMap(([key, keywords]) => keywords.map((keyword) => ({ key, keyword })))
    .sort((left, right) => right.keyword.length - left.keyword.length)
    .find(({ keyword }) => text.includes(keyword))?.key
}

function detectCandidateIndex(text: string) {
  if (includesAny(text, ['第一个', '第一项', '第一棵', '第一个树', '一号', '1号'])) {
    return 0
  }

  if (includesAny(text, ['第二个', '第二项', '第二棵', '第二个树', '二号', '2号'])) {
    return 1
  }

  if (includesAny(text, ['第三个', '第三项', '第三棵', '第三个树', '三号', '3号'])) {
    return 2
  }

  return undefined
}

function parseClarifiedTarget(text: string): CommandTarget | null {
  if (includesAny(text, ['取消', '算了', '不用了'])) {
    return null
  }

  const shape = findDictionaryMatch<ShapeKind>(text, shapeKeywords)
  const color = findDictionaryMatch(text, colorKeywords)
  const position = findDictionaryMatch<CommandPosition>(text, positionKeywords)

  if (shape || color || position) {
    return {
      mode: shape ? 'shape' : position ? 'position' : 'any',
      shape,
      color,
      position,
    }
  }

  if (includesAny(text, ['选中', '当前', '这个', '那个', '它'])) {
    return {
      mode: 'selected',
      shape,
      color,
      position,
    }
  }

  if (includesAny(text, ['刚才', '刚刚', '最近', '上一个'])) {
    return {
      mode: 'last',
      shape,
      color,
      position,
    }
  }

  return null
}

function mergeTarget(baseTarget: CommandTarget, clarifiedTarget: CommandTarget) {
  return {
    ...baseTarget,
    ...clarifiedTarget,
    shape: clarifiedTarget.shape ?? baseTarget.shape,
    color: clarifiedTarget.color ?? baseTarget.color,
    position: clarifiedTarget.position ?? baseTarget.position,
  }
}

export function createPendingClarification(
  command: ParsedCommand,
  candidates: TargetCandidate[],
  sourceText: string,
  role: TargetFeedbackRole = 'target',
): PendingClarification | null {
  if (
    command.action !== 'move' &&
    command.action !== 'recolor' &&
    command.action !== 'resize' &&
    command.action !== 'delete' &&
    command.action !== 'align' &&
    command.action !== 'arrange'
  ) {
    return null
  }

  return {
    command,
    candidates,
    sourceText,
    role,
  }
}

function applyClarifiedTarget(
  command: EditableCommand,
  target: CommandTarget,
  role: TargetFeedbackRole,
): EditableCommand {
  if (role === 'reference' && command.action === 'move' && command.mode === 'spatial') {
    return {
      ...command,
      reference: target,
    }
  }

  return {
    ...command,
    target,
  }
}

export function resolveClarificationResponse(
  rawText: string,
  pending: PendingClarification,
): ParsedCommand | null {
  const text = normalizeText(rawText)

  if (!text || includesAny(text, ['取消', '算了', '不用了'])) {
    return null
  }

  const candidateIndex = detectCandidateIndex(text)
  const clarifiedTarget = parseClarifiedTarget(text)

  if (candidateIndex !== undefined) {
    const candidate = pending.candidates[candidateIndex]

    if (!candidate) {
      return null
    }

    return {
      ...applyClarifiedTarget(
        pending.command,
        candidate.target ?? {
          mode: 'any',
          id: candidate.id,
        },
        pending.role,
      ),
      sourceText: `${pending.sourceText}；澄清：${rawText}`,
    }
  }

  if (!clarifiedTarget) {
    return null
  }

  const baseTarget =
    pending.role === 'reference' &&
    pending.command.action === 'move' &&
    pending.command.mode === 'spatial'
      ? pending.command.reference
      : pending.command.target

  return {
    ...applyClarifiedTarget(
      pending.command,
      mergeTarget(baseTarget, clarifiedTarget),
      pending.role,
    ),
    sourceText: `${pending.sourceText}；澄清：${rawText}`,
  }
}
