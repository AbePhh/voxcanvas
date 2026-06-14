import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
  SpeechRecognitionInstance,
  VoiceInputState,
} from './speechTypes'

const INTERIM_UPDATE_INTERVAL_MS = 120
const RESTART_DELAY_MS = 320

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition
}

function normalizeTranscript(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function useVoiceInput(language = 'zh-CN') {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const listeningRef = useRef(false)
  const autoRestartRef = useRef(false)
  const manuallyStoppedRef = useRef(false)
  const restartTimerRef = useRef<number | null>(null)
  const lastInterimUpdateRef = useRef(0)
  const sessionTranscriptRef = useRef('')
  const initialSupportStatus =
    typeof window === 'undefined' || !getSpeechRecognition() ? 'unsupported' : 'supported'

  const [state, setState] = useState<VoiceInputState>(() => ({
    supportStatus: initialSupportStatus,
    isListening: false,
    transcript: '',
    transcriptId: 0,
    interimTranscript: '',
    errorMessage: '',
  }))

  const supportStatus = state.supportStatus

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [])

  const requestRecognitionStart = useCallback(() => {
    const recognition = recognitionRef.current

    if (!recognition || listeningRef.current) {
      return
    }

    try {
      recognition.start()
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : ''

      if (errorName !== 'InvalidStateError') {
        setState((current) => ({
          ...current,
          errorMessage: 'Speech recognition could not start. Please allow microphone access.',
        }))
      }
    }
  }, [])

  const scheduleAutoRestart = useCallback(() => {
    clearRestartTimer()

    if (!autoRestartRef.current || manuallyStoppedRef.current) {
      return
    }

    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null
      requestRecognitionStart()
    }, RESTART_DELAY_MS)
  }, [clearRestartTimer, requestRecognitionStart])

  const handleRecognitionError = useCallback((event: SpeechRecognitionErrorEvent) => {
    listeningRef.current = false

    const isPermissionError =
      event.error === 'not-allowed' || event.error === 'service-not-allowed'
    const isTransientError =
      event.error === 'no-speech' ||
      event.error === 'audio-capture' ||
      event.error === 'network'

    if (isPermissionError) {
      autoRestartRef.current = false
      manuallyStoppedRef.current = true
    }

    setState((current) => ({
      ...current,
      isListening: false,
      interimTranscript: '',
      errorMessage: isPermissionError
        ? 'Microphone permission is blocked. Please allow microphone access in the browser.'
        : isTransientError
          ? ''
          : `Speech recognition failed: ${event.error}`,
    }))
  }, [])

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition()

    if (!SpeechRecognition) {
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = language
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      listeningRef.current = true
      clearRestartTimer()
      setState((current) => ({
        ...current,
        isListening: true,
        errorMessage: '',
      }))
    }

    recognition.onend = () => {
      listeningRef.current = false
      setState((current) => ({
        ...current,
        isListening: false,
        interimTranscript: '',
      }))
      scheduleAutoRestart()
    }

    recognition.onerror = handleRecognitionError

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = ''
      let interimText = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript ?? ''

        if (result.isFinal) {
          finalText += transcript
        } else {
          interimText += transcript
        }
      }

      const normalizedFinal = normalizeTranscript(finalText)
      const normalizedInterim = normalizeTranscript(interimText)
      const now = performance.now()
      const shouldUpdateInterim =
        normalizedFinal.length > 0 ||
        now - lastInterimUpdateRef.current >= INTERIM_UPDATE_INTERVAL_MS

      if (!shouldUpdateInterim) {
        return
      }

      if (normalizedFinal) {
        sessionTranscriptRef.current = normalizedFinal
      }

      lastInterimUpdateRef.current = now
      setState((current) => ({
        ...current,
        transcript: sessionTranscriptRef.current,
        transcriptId: normalizedFinal ? current.transcriptId + 1 : current.transcriptId,
        interimTranscript: normalizedInterim,
      }))
    }

    recognitionRef.current = recognition

    return () => {
      clearRestartTimer()
      autoRestartRef.current = false
      manuallyStoppedRef.current = true
      listeningRef.current = false
      recognition.abort()
      recognitionRef.current = null
    }
  }, [clearRestartTimer, handleRecognitionError, language, scheduleAutoRestart])

  const resetTranscript = useCallback(() => {
    sessionTranscriptRef.current = ''
    setState((current) => ({
      ...current,
      transcript: '',
      interimTranscript: '',
      errorMessage: '',
    }))
  }, [])

  const stopListening = useCallback(() => {
    manuallyStoppedRef.current = true
    autoRestartRef.current = false
    clearRestartTimer()
    listeningRef.current = false
    recognitionRef.current?.stop()
    setState((current) => ({
      ...current,
      isListening: false,
      interimTranscript: '',
    }))
  }, [clearRestartTimer])

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setState((current) => ({
        ...current,
        supportStatus: 'unsupported',
        errorMessage: 'Web Speech API is not available in this browser. Please test with Chrome.',
      }))
      return
    }

    manuallyStoppedRef.current = false
    autoRestartRef.current = true
    sessionTranscriptRef.current = ''
    setState((current) => ({
      ...current,
      transcript: '',
      interimTranscript: '',
      errorMessage: '',
    }))

    requestRecognitionStart()
  }, [requestRecognitionStart])

  useEffect(() => {
    if (supportStatus !== 'supported') {
      return
    }

    startListening()

    return () => {
      stopListening()
    }
  }, [startListening, stopListening, supportStatus])

  return useMemo(
    () => ({
      ...state,
      supportStatus,
      resetTranscript,
      startListening,
      stopListening,
    }),
    [resetTranscript, startListening, state, stopListening, supportStatus],
  )
}
