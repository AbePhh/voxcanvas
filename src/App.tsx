import { useCallback, useState } from 'react'
import './App.css'
import { applyCreateCommand } from './features/canvas/canvasOperations'
import { DrawingCanvas } from './features/canvas/DrawingCanvas'
import { sampleCanvas } from './features/canvas/sampleCanvas'
import type { ParsedCommand } from './features/commands/types'
import { VoiceInputPanel } from './features/voice/VoiceInputPanel'

function App() {
  const [canvasState, setCanvasState] = useState(sampleCanvas)

  const handleCommandParsed = useCallback((command: ParsedCommand) => {
    if (command.action !== 'create') {
      return
    }

    setCanvasState((current) => applyCreateCommand(current, command))
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
          <span>SVG canvas</span>
        </div>
      </header>

      <section className="workspace" aria-label="Drawing workspace">
        <div className="canvas-stage">
          <DrawingCanvas state={canvasState} />
        </div>
        <aside className="side-panel" aria-label="Workspace controls">
          <VoiceInputPanel onCommandParsed={handleCommandParsed} />

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
