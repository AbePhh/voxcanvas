import { useVoiceInput } from './useVoiceInput'
import './VoiceInputPanel.css'

export function VoiceInputPanel() {
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

      {supportStatus === 'unsupported' ? (
        <p className="voice-message">
          Web Speech API is not available in this browser. Please test with Chrome.
        </p>
      ) : null}

      {errorMessage ? <p className="voice-message">{errorMessage}</p> : null}
    </section>
  )
}
