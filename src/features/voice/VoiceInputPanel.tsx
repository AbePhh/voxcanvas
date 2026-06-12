import { useEffect, useMemo, useRef } from 'react'
import { useVoiceInput } from './useVoiceInput'
import { CommandPreview } from '../commands/CommandPreview'
import { parseCommand } from '../commands/parseCommand'
import type { ParsedCommand } from '../commands/types'
import type { CanvasState } from '../canvas/types'
import { shouldUseAiPlanner } from '../planner/aiPlanner'
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
    const localCommand = parseCommand(transcript)

    if (!shouldUseAiPlanner(transcript, localCommand.action)) {
      onCommandParsed?.(localCommand)
      return
    }

    void planCommand(transcript, canvasState).then((result) => {
      if (!result) {
        return
      }

      if (result.status === 'planned') {
        onCommandParsed?.(result.command)
      }
    })
  }, [canvasState, onCommandParsed, planCommand, transcript])

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
        <button type="button" disabled={!hasTranscript} onClick={resetTranscript}>
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
      <PlannerPreview
        canvasState={canvasState}
        enabled={
          isPlanning ||
          plannerResult !== null ||
          parsedCommand?.action === 'unknown'
        }
        isPlanning={isPlanning}
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
