import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useVoiceInput } from './useVoiceInput'
import { createTargetFeedback } from '../canvas/targetDescriptions'
import {
  createPendingClarification,
  resolveClarificationResponse,
} from '../commands/clarification'
import type { PendingClarification } from '../commands/clarification'
import { isCancellationIntent } from '../commands/cancellationIntent'
import {
  createCancellationFeedback,
  createCommandExecutionFeedback,
} from '../commands/commandFeedback'
import type {
  CommandExecutionFeedback,
  CommandExecutionFeedbackContext,
} from '../commands/commandFeedback'
import { CommandFeedbackPanel } from '../commands/CommandFeedbackPanel'
import { CommandPreview } from '../commands/CommandPreview'
import {
  createPendingExportClarification,
  resolveExportClarificationResponse,
} from '../commands/exportClarification'
import type { PendingExportClarification } from '../commands/exportClarification'
import {
  createMissingAnchorClarification,
  createMissingAnchorFeedback,
  resolveMissingAnchorClarification,
} from '../commands/missingAnchorClarification'
import type { MissingAnchorClarification } from '../commands/missingAnchorClarification'
import { parseCommand } from '../commands/parseCommand'
import type { SceneRelation } from '../commands/types'
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
  executionFeedback?: CommandExecutionFeedback | null
  onCommandParsed?: (
    command: ParsedCommand,
    feedbackContext?: CommandExecutionFeedbackContext,
  ) => void
}

const sceneRelations = new Set<SceneRelation>([
  'left-of',
  'right-of',
  'above',
  'below',
  'near',
  'inside',
  'around',
])

function createPendingMissingAnchorFromPlannerResult(
  rawValue: unknown,
  sourceText: string,
) {
  if (typeof rawValue !== 'object' || rawValue === null) {
    return null
  }

  const value = rawValue as {
    anchorLabel?: unknown
    objectLabel?: unknown
    relation?: unknown
  }

  if (
    typeof value.anchorLabel !== 'string' ||
    typeof value.relation !== 'string' ||
    !sceneRelations.has(value.relation as SceneRelation)
  ) {
    return null
  }

  return createMissingAnchorClarification({
    anchorLabel: value.anchorLabel,
    objectLabel: typeof value.objectLabel === 'string' ? value.objectLabel : undefined,
    relation: value.relation as SceneRelation,
    sourceText,
  })
}

export function VoiceInputPanel({
  canvasState,
  executionFeedback,
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

  const [textCommand, setTextCommand] = useState('')
  const hasTranscript = transcript || interimTranscript
  const previewText = transcript || interimTranscript || textCommand
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
  const [pendingMissingAnchor, setPendingMissingAnchor] =
    useState<MissingAnchorClarification | null>(null)
  const [localExecutionFeedback, setLocalExecutionFeedback] =
    useState<CommandExecutionFeedback | null>(null)
  const processCommandTextRef = useRef<(commandText: string) => Promise<void> | void>(
    () => Promise.resolve(),
  )
  const { isPlanning, planCommand, plannerResult, resetPlanner } = useCommandPlanner()
  const displayedExecutionFeedback = localExecutionFeedback ?? executionFeedback ?? null

  const resetPendingInteraction = useCallback(() => {
    setClarificationFeedback(null)
    setPendingClarification(null)
    setPendingExportClarification(null)
    setPendingMissingAnchor(null)
  }, [])

  useEffect(() => {
    if (isListening) {
      lastExecutedTranscriptRef.current = ''
      resetPlanner()
    }
  }, [isListening, resetPlanner])

  const processCommandText = useCallback((commandText: string) => {
    if (isCancellationIntent(commandText)) {
      resetPlanner()
      queueMicrotask(() => {
        resetPendingInteraction()
        setLocalExecutionFeedback(createCancellationFeedback(commandText))
      })
      return Promise.resolve()
    }

    if (pendingExportClarification) {
      const clarifiedExportCommand = resolveExportClarificationResponse(
        commandText,
        pendingExportClarification,
      )

      if (clarifiedExportCommand) {
        queueMicrotask(() => {
          setPendingExportClarification(null)
          setClarificationFeedback(null)
          setPendingClarification(null)
          setPendingMissingAnchor(null)
          setLocalExecutionFeedback(null)
        })
        onCommandParsed?.(clarifiedExportCommand, { source: 'local' })
        return Promise.resolve()
      }
    }

    if (pendingMissingAnchor) {
      const resolvedMissingAnchor = resolveMissingAnchorClarification(
        commandText,
        pendingMissingAnchor,
      )

      if (resolvedMissingAnchor?.status === 'cancelled') {
        queueMicrotask(() => {
          setPendingMissingAnchor(null)
          setLocalExecutionFeedback(createCancellationFeedback(commandText))
        })
        return Promise.resolve()
      }

      if (resolvedMissingAnchor?.status === 'confirmed') {
        queueMicrotask(() => {
          resetPendingInteraction()
          setLocalExecutionFeedback(null)
          void processCommandTextRef.current(resolvedMissingAnchor.prompt)
        })
        return Promise.resolve()
      }
    }

    if (pendingClarification) {
      const clarifiedCommand = resolveClarificationResponse(
        commandText,
        pendingClarification,
      )

      if (clarifiedCommand) {
        const clarifiedFeedback = createTargetFeedback(clarifiedCommand, canvasState)

        if (clarifiedFeedback.status !== 'ok') {
          queueMicrotask(() => {
            setClarificationFeedback(clarifiedFeedback)
            setPendingMissingAnchor(null)
            setLocalExecutionFeedback(
              createCommandExecutionFeedback(clarifiedCommand, {
                source: 'local',
                status: 'needs-clarification',
              }),
            )
            setPendingClarification(
              clarifiedFeedback.status === 'ambiguous'
                ? createPendingClarification(
                    clarifiedCommand,
                    clarifiedFeedback.candidates,
                    commandText,
                  )
                : null,
            )
          })
          return Promise.resolve()
        }

        queueMicrotask(() => {
          setClarificationFeedback(null)
          setPendingClarification(null)
          setPendingMissingAnchor(null)
          setLocalExecutionFeedback(null)
        })
        onCommandParsed?.(clarifiedCommand, { source: 'local' })
        return Promise.resolve()
      }
    }

    const localCommand = parseCommand(commandText)
    const localTargetFeedback = createTargetFeedback(localCommand, canvasState)

    if (localCommand.action === 'export' && !localCommand.format) {
      queueMicrotask(() => {
        setPendingExportClarification(createPendingExportClarification(localCommand))
        setClarificationFeedback(null)
        setPendingClarification(null)
        setPendingMissingAnchor(null)
        setLocalExecutionFeedback(
          createCommandExecutionFeedback(localCommand, {
            source: 'local',
            status: 'needs-clarification',
          }),
        )
      })
      return Promise.resolve()
    }

    const normalizationDecision = getNormalizationDecision(commandText, localCommand)
    const needsAiNormalization =
      normalizationDecision.useAi || localTargetFeedback.status !== 'ok'

    if (!needsAiNormalization) {
      queueMicrotask(() => {
        setClarificationFeedback(null)
        setPendingClarification(null)
        setPendingExportClarification(null)
        setPendingMissingAnchor(null)
        setLocalExecutionFeedback(null)
      })
      onCommandParsed?.(localCommand, { source: 'local' })
      return Promise.resolve()
    }

    return planCommand(commandText, canvasState, localCommand).then((result) => {
      if (!result) {
        return
      }

      if (result.status === 'planned') {
        const plannedTargetFeedback = createTargetFeedback(result.command, canvasState)

        if (plannedTargetFeedback.status !== 'ok') {
          queueMicrotask(() => {
            setClarificationFeedback(plannedTargetFeedback)
            setPendingMissingAnchor(null)
            setLocalExecutionFeedback(
              createCommandExecutionFeedback(result.command, {
                source: 'ai',
                status: 'needs-clarification',
                correction: result.correction,
              }),
            )
            setPendingClarification(
              plannedTargetFeedback.status === 'ambiguous'
                ? createPendingClarification(
                    result.command,
                    plannedTargetFeedback.candidates,
                    commandText,
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
          setPendingMissingAnchor(null)
          setLocalExecutionFeedback(null)
        })
        onCommandParsed?.(result.command, {
          source: 'ai',
          correction: result.correction,
        })
        return
      }

      if (result.status === 'invalid' && result.reason === 'missing-anchor') {
        const pending = createPendingMissingAnchorFromPlannerResult(
          result.rawValue,
          commandText,
        )

        if (pending) {
          queueMicrotask(() => {
            setPendingMissingAnchor(pending)
            setClarificationFeedback(null)
            setPendingClarification(null)
            setPendingExportClarification(null)
            setLocalExecutionFeedback(createMissingAnchorFeedback(pending.intent))
          })
          return
        }
      }

      if (localTargetFeedback.status !== 'ok') {
        queueMicrotask(() => {
          setClarificationFeedback(localTargetFeedback)
          setPendingMissingAnchor(null)
          setLocalExecutionFeedback(
            createCommandExecutionFeedback(localCommand, {
              source: 'local',
              status: 'needs-clarification',
            }),
          )
          setPendingClarification(
            localTargetFeedback.status === 'ambiguous'
              ? createPendingClarification(
                  localCommand,
                  localTargetFeedback.candidates,
                  commandText,
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
          setPendingMissingAnchor(null)
          setLocalExecutionFeedback(null)
        })
        onCommandParsed?.(localCommand, { source: 'local' })
        return
      }

      queueMicrotask(() => {
        setLocalExecutionFeedback(
          createCommandExecutionFeedback(localCommand, {
            source: 'ai',
            status: 'blocked',
          }),
        )
      })
    })
  }, [
    canvasState,
    onCommandParsed,
    pendingClarification,
    pendingExportClarification,
    pendingMissingAnchor,
    planCommand,
    resetPendingInteraction,
    resetPlanner,
  ])

  useEffect(() => {
    processCommandTextRef.current = processCommandText
  }, [processCommandText])

  useEffect(() => {
    if (!transcript || transcript === lastExecutedTranscriptRef.current) {
      return
    }

    lastExecutedTranscriptRef.current = transcript

    void processCommandText(transcript)
  }, [
    processCommandText,
    transcript,
  ])

  const handleTextCommandSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const commandText = textCommand.trim()

    if (!commandText) {
      return
    }

    resetPlanner()
    void processCommandText(commandText)
  }

  const handleClear = () => {
    resetTranscript()
    setTextCommand('')
    resetPendingInteraction()
    setLocalExecutionFeedback(null)
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
          disabled={!hasTranscript && !textCommand && !clarificationFeedback}
          onClick={handleClear}
        >
          Clear
        </button>
      </div>

      <form className="text-command-form" onSubmit={handleTextCommandSubmit}>
        <input
          type="text"
          value={textCommand}
          onChange={(event) => setTextCommand(event.target.value)}
          placeholder="Type a command when the microphone is unavailable."
          aria-label="Typed drawing command"
        />
        <button type="submit" disabled={!textCommand.trim() || isPlanning}>
          Run
        </button>
      </form>

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

      <div className="voice-panel__results">
        <CommandFeedbackPanel feedback={displayedExecutionFeedback} />
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
      </div>
    </section>
  )
}
