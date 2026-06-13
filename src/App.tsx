import { useCallback, useRef, useState } from 'react'
import './App.css'
import {
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
import { DrawingCanvas } from './features/canvas/DrawingCanvas'
import { sampleCanvas } from './features/canvas/sampleCanvas'
import type { ParsedCommand } from './features/commands/types'
import { exportSvgElement } from './features/export/exportCanvas'
import { VoiceInputPanel } from './features/voice/VoiceInputPanel'

function App() {
  const canvasSvgRef = useRef<SVGSVGElement>(null)
  const [canvasState, setCanvasState] = useState(sampleCanvas)
  const [exportMessage, setExportMessage] = useState('')

  const handleCommandParsed = useCallback((command: ParsedCommand) => {
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
      switch (command.action) {
        case 'create':
          return applyCreateCommand(current, command)
        case 'delete':
          return applyDeleteCommand(current, command)
        case 'move':
          return applyMoveCommand(current, command)
        case 'recolor':
          return applyRecolorCommand(current, command)
        case 'resize':
          return applyResizeCommand(current, command)
        case 'resizeCanvas':
          return applyResizeCanvasCommand(current, command)
        case 'scene':
          return applySceneCommand(current, command)
        case 'clear':
          return applyClearCommand(current)
        case 'undo':
          return applyUndoCommand(current)
        case 'redo':
          return applyRedoCommand(current)
        case 'unknown':
          return current
        default:
          return current
      }
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
        <aside className="side-panel" aria-label="Workspace controls">
          <VoiceInputPanel
            canvasState={canvasState}
            onCommandParsed={handleCommandParsed}
          />

          {exportMessage ? (
            <section className="export-status" aria-live="polite">
              {exportMessage}
            </section>
          ) : null}

          <section className="inspector" aria-label="Canvas object list">
            <h2>Scene Objects</h2>
            <ul>
              {canvasState.shapes.map((shape) => (
                <li key={shape.id}>
                  <span className="object-name">{shape.id}</span>
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
