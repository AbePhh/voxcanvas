import { useEffect, useMemo, useRef, useState } from 'react'
import { useVoiceInput } from './useVoiceInput'
import { createTargetFeedback } from '../canvas/targetDescriptions'
import {
  createPendingClarification,
  resolveClarificationResponse,
} from '../commands/clarification'
import type { PendingClarification } from '../commands/clarification'
import { CommandPreview } from '../commands/CommandPreview'
import {
  createPendingExportClarification,
  resolveExportClarificationResponse,
} from '../commands/exportClarification'
import type { PendingExportClarification } from '../commands/exportClarification'
import { parseCommand } from '../commands/parseCommand'
import type { ParsedCommand } from '../commands/types'
import type { CanvasState } from '../canvas/types'
import {
  canFallbackToLocalCommand,
  getNormalizationDecision,
} from '../planner/normalizationPolicy'
import { PlannerPreview } from '../planner/PlannerPreview'
import { useCommandPlanner } from '../planner/useCommandPlanner'
import './VoiceInputPanel.css'

type VoiceInputPanelProps = {
  canvasState: CanvasState
  onCommandParsed?: (command: ParsedCommand) => void
}

export function VoiceInputPanel({
  canvasState,
  onCommandParsed,
}: VoiceInputPanelProps) {
  const {
    errorMessage,
    interimTranscript,
    isListening,
    resetTranscript,
    startListening,
    stopListening,
    supportStatus,
    transcript,
  } = useVoiceInput()

  const hasTranscript = transcript || interimTranscript
  const previewText = transcript || interimTranscript
  const parsedCommand = useMemo(
    () => (previewText ? parseCommand(previewText) : null),
    [previewText],
  )
  const lastExecutedTranscriptRef = useRef('')
  const [clarificationFeedback, setClarificationFeedback] = useState<ReturnType<
    typeof createTargetFeedback
  > | null>(null)
  const [pendingClarification, setPendingClarification] =
    useState<PendingClarification | null>(null)
  const [pendingExportClarification, setPendingExportClarification] =
    useState<PendingExportClarification | null>(null)
  const { isPlanning, planCommand, plannerResult, resetPlanner } = useCommandPlanner()

  useEffect(() => {
    if (isListening) {
      lastExecutedTranscriptRef.current = ''
      resetPlanner()
    }
  }, [isListening, resetPlanner])

  useEffect(() => {
    if (!transcript || transcript === lastExecutedTranscriptRef.current) {
      return
    }

    lastExecutedTranscriptRef.current = transcript

    if (pendingExportClarification) {
      const clarifiedExportCommand = resolveExportClarificationResponse(
        transcript,
        pendingExportClarification,
      )

      if (clarifiedExportCommand) {
        queueMicrotask(() => {
          setPendingExportClarification(null)
          setClarificationFeedback(null)
          setPendingClarification(null)
        })
        onCommandParsed?.(clarifiedExportCommand)
        return
      }
    }

    if (pendingClarification) {
      const clarifiedCommand = resolveClarificationResponse(
        transcript,
        pendingClarification,
      )

      if (clarifiedCommand) {
        const clarifiedFeedback = createTargetFeedback(clarifiedCommand, canvasState)

        if (clarifiedFeedback.status !== 'ok') {
          queueMicrotask(() => {
            setClarificationFeedback(clarifiedFeedback)
            setPendingClarification(
              clarifiedFeedback.status === 'ambiguous'
                ? createPendingClarification(
                    clarifiedCommand,
                    clarifiedFeedback.candidates,
                    transcript,
                  )
                : null,
            )
          })
          return
        }

        queueMicrotask(() => {
          setClarificationFeedback(null)
          setPendingClarification(null)
        })
        onCommandParsed?.(clarifiedCommand)
        return
      }
    }

    const localCommand = parseCommand(transcript)
    const localTargetFeedback = createTargetFeedback(localCommand, canvasState)

    if (localCommand.action === 'export' && !localCommand.format) {
      queueMicrotask(() => {
        setPendingExportClarification(createPendingExportClarification(localCommand))
        setClarificationFeedback(null)
        setPendingClarification(null)
      })
      return
    }

    const normalizationDecision = getNormalizationDecision(transcript, localCommand)
    const needsAiNormalization =
      normalizationDecision.useAi || localTargetFeedback.status !== 'ok'

    if (!needsAiNormalization) {
      queueMicrotask(() => {
        setClarificationFeedback(null)
        setPendingClarification(null)
        setPendingExportClarification(null)
      })
      onCommandParsed?.(localCommand)
      return
    }

    void planCommand(transcript, canvasState, localCommand).then((result) => {
      if (!result) {
        return
      }

      if (result.status === 'planned') {
        const plannedTargetFeedback = createTargetFeedback(result.command, canvasState)

        if (plannedTargetFeedback.status !== 'ok') {
          queueMicrotask(() => {
            setClarificationFeedback(plannedTargetFeedback)
            setPendingClarification(
              plannedTargetFeedback.status === 'ambiguous'
                ? createPendingClarification(
                    result.command,
                    plannedTargetFeedback.candidates,
                    transcript,
                  )
                : null,
            )
          })
          return
        }

        queueMicrotask(() => {
          setClarificationFeedback(null)
          setPendingClarification(null)
          setPendingExportClarification(null)
        })
        onCommandParsed?.(result.command)
        return
      }

      if (localTargetFeedback.status !== 'ok') {
        queueMicrotask(() => {
          setClarificationFeedback(localTargetFeedback)
          setPendingClarification(
            localTargetFeedback.status === 'ambiguous'
              ? createPendingClarification(
                  localCommand,
                  localTargetFeedback.candidates,
                  transcript,
                )
              : null,
          )
        })
        return
      }

      if (canFallbackToLocalCommand(normalizationDecision, localCommand)) {
        queueMicrotask(() => {
          setClarificationFeedback(null)
          setPendingClarification(null)
          setPendingExportClarification(null)
        })
        onCommandParsed?.(localCommand)
      }
    })
  }, [
    canvasState,
    onCommandParsed,
    pendingClarification,
    pendingExportClarification,
    planCommand,
    transcript,
  ])

  const handleClear = () => {
    resetTranscript()
    setClarificationFeedback(null)
    setPendingClarification(null)
    setPendingExportClarification(null)
  }

  return (
    <section className="voice-panel" aria-label="Voice input">
      <div className="voice-panel__header">
        <div>
          <h2>Voice Input</h2>
          <p>{isListening ? 'Listening for a drawing command' : 'Ready for speech'}</p>
        </div>
        <span className={isListening ? 'voice-status is-active' : 'voice-status'}>
          {isListening ? 'Live' : 'Idle'}
        </span>
      </div>

      <div className="voice-actions">
        <button
          type="button"
          className="primary-action"
          disabled={supportStatus === 'unsupported' || isListening}
          onClick={startListening}
        >
          Start listening
        </button>
        <button type="button" disabled={!isListening} onClick={stopListening}>
          Stop
        </button>
        <button
          type="button"
          disabled={!hasTranscript && !clarificationFeedback}
          onClick={handleClear}
        >
          Clear
        </button>
      </div>

      <div className="transcript-box" aria-live="polite">
        {hasTranscript ? (
          <>
            <p>{transcript}</p>
            {interimTranscript ? <p className="interim">{interimTranscript}</p> : null}
          </>
        ) : (
          <p className="placeholder">Speech recognition output will appear here.</p>
        )}
      </div>

      <CommandPreview command={parsedCommand} />
      {clarificationFeedback && clarificationFeedback.status !== 'ok' ? (
        <div className="target-feedback" aria-live="polite">
          <h3>Target Needs Clarification</h3>
          <p>{clarificationFeedback.message}</p>
          {clarificationFeedback.status === 'ambiguous' ? (
            <ul>
              {clarificationFeedback.candidates.map((candidate) => (
                <li key={candidate.id}>{candidate.label}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {pendingExportClarification ? (
        <div className="format-feedback" aria-live="polite">
          <h3>Choose Export Format</h3>
          <p>请说明要导出 PNG、JPG 还是 SVG。</p>
          <ul>
            <li>PNG：适合保留清晰线条和透明能力</li>
            <li>JPG：适合普通图片分享，白色背景</li>
            <li>SVG：适合继续编辑和保持矢量清晰度</li>
          </ul>
        </div>
      ) : null}
      <PlannerPreview
        canvasState={canvasState}
        enabled={
          isPlanning ||
          plannerResult !== null ||
          parsedCommand?.action === 'unknown'
        }
        isPlanning={isPlanning}
        localCommand={parsedCommand}
        result={plannerResult}
        sourceText={previewText}
      />

      {supportStatus === 'unsupported' ? (
        <p className="voice-message">
          Web Speech API is not available in this browser. Please test with Chrome.
        </p>
      ) : null}

      {errorMessage ? <p className="voice-message">{errorMessage}</p> : null}
    </section>
  )
}
