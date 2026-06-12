import { useCallback, useRef, useState } from 'react'
import { aiPlanner } from './aiPlanner'
import { createPlannerInput } from './types'
import type { CanvasState } from '../canvas/types'
import type { CommandPlannerResult } from './types'

export function useCommandPlanner() {
  const requestIdRef = useRef(0)
  const [result, setResult] = useState<CommandPlannerResult | null>(null)
  const [isPlanning, setIsPlanning] = useState(false)

  const resetPlanner = useCallback(() => {
    requestIdRef.current += 1
    setIsPlanning(false)
    setResult(null)
  }, [])

  const planCommand = useCallback(async (sourceText: string, canvasState: CanvasState) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsPlanning(true)
    setResult(null)

    const plannerInput = createPlannerInput(sourceText, canvasState)
    const nextResult = await aiPlanner(plannerInput)

    if (requestIdRef.current !== requestId) {
      return null
    }

    setIsPlanning(false)
    setResult(nextResult)

    return nextResult
  }, [])

  return {
    isPlanning,
    planCommand,
    plannerResult: result,
    resetPlanner,
  }
}
