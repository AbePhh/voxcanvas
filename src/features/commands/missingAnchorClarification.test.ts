import { describe, expect, it } from 'vitest'
import {
  createMissingAnchorClarification,
  createMissingAnchorFeedback,
  resolveMissingAnchorClarification,
} from './missingAnchorClarification'

const missingSunIntent = {
  anchorLabel: '太阳',
  objectLabel: '云',
  relation: 'below' as const,
  sourceText: '在太阳下面再加一朵云',
}

describe('missingAnchorClarification', () => {
  it('creates actionable feedback for missing reference objects', () => {
    expect(createMissingAnchorFeedback(missingSunIntent)).toMatchObject({
      status: 'needs-clarification',
      title: 'Missing Reference',
      details: expect.arrayContaining([
        'Reference: 太阳',
        'New content: 云',
      ]),
    })
  })

  it('turns a confirmation into a whole-scene prompt', () => {
    const pending = createMissingAnchorClarification(missingSunIntent)

    expect(resolveMissingAnchorClarification('可以', pending)).toMatchObject({
      status: 'confirmed',
      prompt: expect.stringContaining('生成一个包含太阳和云的完整场景'),
    })
  })

  it('lets users cancel missing-anchor recovery', () => {
    const pending = createMissingAnchorClarification(missingSunIntent)

    expect(resolveMissingAnchorClarification('不用了', pending)).toEqual({
      status: 'cancelled',
    })
  })
})
