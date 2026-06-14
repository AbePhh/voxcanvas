import { useCallback, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  applyAddSceneObjectCommand,
  applyAlignCommand,
  applyArrangeCommand,
  applyBatchCommand,
  applyClearCommand,
  applyCreateCommand,
  applyDeleteCommand,
  applyMoveCommand,
  applyRecolorCommand,
  applyResizeCanvasCommand,
  applyResizeCommand,
  applyRedoCommand,
  applySceneCommand,
  applyUndoCommand,
} from './features/canvas/canvasOperations'
import { CanvasSceneSummary } from './features/canvas/CanvasSceneSummary'
import { DrawingCanvas } from './features/canvas/DrawingCanvas'
import { sampleCanvas } from './features/canvas/sampleCanvas'
import { createSemanticGroupSummaries } from './features/canvas/semanticGroups'
import type { SemanticGroupSummary } from './features/canvas/semanticGroups'
import type { ShapeObject } from './features/canvas/types'
import type { CommandExecutionFeedbackContext } from './features/commands/commandFeedback'
import { createPreciseExecutionFeedback } from './features/commands/executionFeedback'
import type { ParsedCommand } from './features/commands/types'
import { exportSvgElement } from './features/export/exportCanvas'
import { VoiceInputPanel } from './features/voice/VoiceInputPanel'

function getObjectDisplayName(
  shape: ShapeObject,
  semanticGroupById: Map<string, SemanticGroupSummary>,
) {
  if (!shape.groupLabel) {
    return shape.id
  }

  const groupLabel = shape.groupId
    ? semanticGroupById.get(shape.groupId)?.displayLabel
    : undefined
  const label = groupLabel ?? shape.groupLabel

  return shape.partLabel ? `${label} / ${shape.partLabel}` : label
}

function App() {
  const canvasSvgRef = useRef<SVGSVGElement>(null)
  const [canvasState, setCanvasState] = useState(sampleCanvas)
  const [exportMessage, setExportMessage] = useState('')
  const [executionFeedback, setExecutionFeedback] =
    useState<ReturnType<typeof createPreciseExecutionFeedback> | null>(null)
  const semanticGroupById = useMemo(
    () =>
      new Map(
        createSemanticGroupSummaries(canvasState.shapes, {
          selectedId: canvasState.selectedId,
          selectedGroupId: canvasState.selectedGroupId,
        }).map((group) => [group.id, group]),
      ),
    [canvasState.selectedGroupId, canvasState.selectedId, canvasState.shapes],
  )

  const handleCommandParsed = useCallback((
    command: ParsedCommand,
    feedbackContext?: CommandExecutionFeedbackContext,
  ) => {
    if (command.action === 'export') {
      const svgElement = canvasSvgRef.current

      if (!command.format) {
        setExportMessage('Please choose PNG, JPG, or SVG before exporting.')
        return
      }

      const exportFormat = command.format

      if (!svgElement) {
        setExportMessage('Canvas is not ready to export.')
        return
      }

      void exportSvgElement(svgElement, {
        filename: 'voxcanvas',
        format: exportFormat,
      })
        .then(() => {
          setExportMessage(`Exported ${exportFormat.toUpperCase()} image.`)
        })
        .catch((error) => {
          setExportMessage(
            error instanceof Error ? error.message : 'Failed to export image.',
          )
        })
      return
    }

    setCanvasState((current) => {
      let nextState: typeof current

      switch (command.action) {
        case 'create':
          nextState = applyCreateCommand(current, command)
          break
        case 'delete':
          nextState = applyDeleteCommand(current, command)
          break
        case 'move':
          nextState = applyMoveCommand(current, command)
          break
        case 'recolor':
          nextState = applyRecolorCommand(current, command)
          break
        case 'resize':
          nextState = applyResizeCommand(current, command)
          break
        case 'align':
          nextState = applyAlignCommand(current, command)
          break
        case 'arrange':
          nextState = applyArrangeCommand(current, command)
          break
        case 'resizeCanvas':
          nextState = applyResizeCanvasCommand(current, command)
          break
        case 'scene':
          nextState = applySceneCommand(current, command)
          break
        case 'addSceneObject':
          nextState = applyAddSceneObjectCommand(current, command)
          break
        case 'batch':
          nextState = applyBatchCommand(current, command)
          break
        case 'clear':
          nextState = applyClearCommand(current)
          break
        case 'undo':
          nextState = applyUndoCommand(current)
          break
        case 'redo':
          nextState = applyRedoCommand(current)
          break
        case 'unknown':
          nextState = current
          break
        default:
          nextState = current
      }

      setExecutionFeedback(
        createPreciseExecutionFeedback(command, current, nextState, feedbackContext),
      )

      return nextState
    })
  }, [])

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">VoxCanvas</p>
          <h1>AI voice drawing workspace</h1>
        </div>
        <div className="status-panel" aria-label="Canvas summary">
          <span>{canvasState.shapes.length} objects</span>
          <span>{canvasState.history.length} undo</span>
          <span>{canvasState.future.length} redo</span>
          <span>
            {canvasState.width} x {canvasState.height}
          </span>
        </div>
      </header>

      <section className="workspace" aria-label="Drawing workspace">
        <div className="canvas-stage">
          <DrawingCanvas state={canvasState} svgRef={canvasSvgRef} />
        </div>
        <aside className="control-panel" aria-label="Voice controls">
          <VoiceInputPanel
            canvasState={canvasState}
            executionFeedback={executionFeedback}
            onCommandParsed={handleCommandParsed}
          />

          {exportMessage ? (
            <section className="export-status" aria-live="polite">
              {exportMessage}
            </section>
          ) : null}
        </aside>

        <aside className="context-panel" aria-label="Scene context">
          <CanvasSceneSummary canvasState={canvasState} />

          <section className="inspector" aria-label="Canvas object list">
            <h2>Scene Objects</h2>
            <ul>
              {canvasState.shapes.map((shape) => (
                <li key={shape.id}>
                  <span className="object-name">
                    {getObjectDisplayName(shape, semanticGroupById)}
                    {shape.groupId ? (
                      <small className="object-group">{shape.groupId}</small>
                    ) : null}
                  </span>
                  <span className="object-type">{shape.type}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </section>
    </main>
  )
}

export default App
