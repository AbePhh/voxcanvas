import type { ExportFormat, ParsedCommand } from './types'

type ExportCommand = Extract<ParsedCommand, { action: 'export' }>

export type PendingExportClarification = {
  command: ExportCommand
  sourceText: string
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, '').replace(/[，。！？、,.!?]/g, '').trim()
}

export function detectExportFormat(text: string): ExportFormat | undefined {
  const normalizedText = normalizeText(text).toLowerCase()

  if (normalizedText.includes('svg')) {
    return 'svg'
  }

  if (normalizedText.includes('jpg') || normalizedText.includes('jpeg')) {
    return 'jpg'
  }

  if (normalizedText.includes('png')) {
    return 'png'
  }

  return undefined
}

export function createPendingExportClarification(
  command: ParsedCommand,
): PendingExportClarification | null {
  if (command.action !== 'export' || command.format) {
    return null
  }

  return {
    command,
    sourceText: command.sourceText,
  }
}

export function resolveExportClarificationResponse(
  rawText: string,
  pending: PendingExportClarification,
): ParsedCommand | null {
  const text = normalizeText(rawText)

  if (!text || ['取消', '算了', '不用了'].some((keyword) => text.includes(keyword))) {
    return null
  }

  const format = detectExportFormat(text)

  if (!format) {
    return null
  }

  return {
    ...pending.command,
    format,
    sourceText: `${pending.sourceText}；格式：${rawText}`,
  }
}
