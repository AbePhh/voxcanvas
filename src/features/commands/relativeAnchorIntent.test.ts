import { describe, expect, it } from 'vitest'
import {
  createWholeScenePromptFromMissingAnchor,
  detectRelativeAdditionIntent,
  findAnchorReferenceGroups,
} from './relativeAnchorIntent'

describe('relativeAnchorIntent', () => {
  it('detects relative semantic additions with anchor and object labels', () => {
    expect(detectRelativeAdditionIntent('在太阳下面再加一朵云')).toEqual({
      anchorLabel: '太阳',
      objectLabel: '云',
      relation: 'below',
      sourceText: '在太阳下面再加一朵云',
    })

    expect(detectRelativeAdditionIntent('在房子的右边再生成一棵树')).toEqual({
      anchorLabel: '房子',
      objectLabel: '树',
      relation: 'right-of',
      sourceText: '在房子的右边再生成一棵树',
    })
  })

  it('matches anchors by semantic reference labels', () => {
    expect(
      findAnchorReferenceGroups(
        [
          {
            groupLabel: '太阳',
            displayLabel: '太阳',
            referenceLabels: ['sun-1', '太阳'],
          },
        ],
        '太阳',
      ),
    ).toHaveLength(1)
  })

  it('builds a whole-scene recovery prompt for missing anchors', () => {
    const intent = detectRelativeAdditionIntent('在太阳下面再加一朵云')

    expect(intent).not.toBeNull()
    expect(createWholeScenePromptFromMissingAnchor(intent!)).toContain(
      '生成一个包含太阳和云的完整场景',
    )
  })
})
