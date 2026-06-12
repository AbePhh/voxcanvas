import { describe, expect, it } from 'vitest'
import {
  createPendingExportClarification,
  detectExportFormat,
  resolveExportClarificationResponse,
} from './exportClarification'
import type { ParsedCommand } from './types'

const ambiguousExportCommand: ParsedCommand = {
  action: 'export',
  sourceText: '导出图片',
}

describe('exportClarification', () => {
  it('detects supported export formats', () => {
    expect(detectExportFormat('PNG')).toBe('png')
    expect(detectExportFormat('导出 jpg')).toBe('jpg')
    expect(detectExportFormat('jpeg格式')).toBe('jpg')
    expect(detectExportFormat('svg格式')).toBe('svg')
    expect(detectExportFormat('最好的')).toBeUndefined()
  })

  it('creates pending clarification only when export format is missing', () => {
    expect(createPendingExportClarification(ambiguousExportCommand)).toMatchObject({
      command: ambiguousExportCommand,
      sourceText: '导出图片',
    })

    expect(
      createPendingExportClarification({
        action: 'export',
        format: 'png',
        sourceText: '导出 PNG',
      }),
    ).toBeNull()
  })

  it('resolves a format response into the original export command', () => {
    const pending = createPendingExportClarification(ambiguousExportCommand)

    expect(resolveExportClarificationResponse('jpg', pending!)).toMatchObject({
      action: 'export',
      format: 'jpg',
      sourceText: '导出图片；格式：jpg',
    })
  })

  it('ignores cancellation and unsupported format responses', () => {
    const pending = createPendingExportClarification(ambiguousExportCommand)

    expect(resolveExportClarificationResponse('算了', pending!)).toBeNull()
    expect(resolveExportClarificationResponse('最好的', pending!)).toBeNull()
  })
})
