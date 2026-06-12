import './App.css'
import { DrawingCanvas } from './features/canvas/DrawingCanvas'
import { sampleCanvas } from './features/canvas/sampleCanvas'
import { VoiceInputPanel } from './features/voice/VoiceInputPanel'

function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">VoxCanvas</p>
          <h1>AI voice drawing workspace</h1>
        </div>
        <div className="status-panel" aria-label="Canvas summary">
          <span>{sampleCanvas.shapes.length} objects</span>
          <span>SVG canvas</span>
        </div>
      </header>

      <section className="workspace" aria-label="Drawing workspace">
        <div className="canvas-stage">
          <DrawingCanvas state={sampleCanvas} />
        </div>
        <aside className="side-panel" aria-label="Workspace controls">
          <VoiceInputPanel />

          <section className="inspector" aria-label="Canvas object list">
            <h2>Scene Objects</h2>
            <ul>
              {sampleCanvas.shapes.map((shape) => (
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
