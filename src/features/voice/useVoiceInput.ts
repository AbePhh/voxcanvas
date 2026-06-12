import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionEvent,
  SpeechRecognitionInstance,
  VoiceInputState,
} from './speechTypes'

const INTERIM_UPDATE_INTERVAL_MS = 120

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition
}

function normalizeTranscript(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function useVoiceInput(language = 'zh-CN') {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const listeningRef = useRef(false)
  const lastInterimUpdateRef = useRef(0)
  const sessionTranscriptRef = useRef('')
  const initialSupportStatus =
    typeof window === 'undefined' || !getSpeechRecognition() ? 'unsupported' : 'supported'

  const [state, setState] = useState<VoiceInputState>(() => ({
    supportStatus: initialSupportStatus,
    isListening: false,
    transcript: '',
    interimTranscript: '',
    errorMessage: '',
  }))

  const supportStatus = state.supportStatus

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition()

    if (!SpeechRecognition) {
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = language
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      listeningRef.current = true
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
    }

    recognition.onerror = (event) => {
      listeningRef.current = false
      setState((current) => ({
        ...current,
        isListening: false,
        interimTranscript: '',
        errorMessage:
          event.error === 'not-allowed'
            ? '麦克风权限被拒绝，请允许浏览器使用麦克风。'
            : `语音识别失败：${event.error}`,
      }))
    }

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
        sessionTranscriptRef.current = normalizeTranscript(
          `${sessionTranscriptRef.current} ${normalizedFinal}`,
        )
      }

      lastInterimUpdateRef.current = now
      setState((current) => ({
        ...current,
        transcript: sessionTranscriptRef.current,
        interimTranscript: normalizedInterim,
      }))
    }

    recognitionRef.current = recognition

    return () => {
      listeningRef.current = false
      recognition.abort()
      recognitionRef.current = null
    }
  }, [language])

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
    listeningRef.current = false
    recognitionRef.current?.stop()
    setState((current) => ({
      ...current,
      isListening: false,
      interimTranscript: '',
    }))
  }, [])

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setState((current) => ({
        ...current,
        supportStatus: 'unsupported',
        errorMessage: '当前浏览器不支持 Web Speech API，请使用 Chrome 浏览器测试。',
      }))
      return
    }

    if (listeningRef.current) {
      return
    }

    sessionTranscriptRef.current = ''
    setState((current) => ({
      ...current,
      transcript: '',
      interimTranscript: '',
      errorMessage: '',
    }))

    recognitionRef.current.start()
  }, [])

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
