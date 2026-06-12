import { useCallback, useState } from 'react'
import './App.css'
import {
  applyClearCommand,
  applyCreateCommand,
  applyDeleteCommand,
  applyMoveCommand,
  applyRecolorCommand,
  applyResizeCommand,
  applyRedoCommand,
  applyUndoCommand,
} from './features/canvas/canvasOperations'
import { DrawingCanvas } from './features/canvas/DrawingCanvas'
import { sampleCanvas } from './features/canvas/sampleCanvas'
import type { ParsedCommand } from './features/commands/types'
import { VoiceInputPanel } from './features/voice/VoiceInputPanel'

function App() {
  const [canvasState, setCanvasState] = useState(sampleCanvas)

  const handleCommandParsed = useCallback((command: ParsedCommand) => {
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
          <span>SVG canvas</span>
        </div>
      </header>

      <section className="workspace" aria-label="Drawing workspace">
        <div className="canvas-stage">
          <DrawingCanvas state={canvasState} />
        </div>
        <aside className="side-panel" aria-label="Workspace controls">
          <VoiceInputPanel
            canvasState={canvasState}
            onCommandParsed={handleCommandParsed}
          />

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
