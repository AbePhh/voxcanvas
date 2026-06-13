import type { CommandExecutionFeedback } from './commandFeedback'
import './CommandFeedbackPanel.css'

type CommandFeedbackPanelProps = {
  feedback: CommandExecutionFeedback | null
}

const statusLabels: Record<CommandExecutionFeedback['status'], string> = {
  ready: 'Ready',
  executed: 'Executed',
  'needs-clarification': 'Needs clarification',
  blocked: 'Blocked',
}

const sourceLabels: Record<CommandExecutionFeedback['source'], string> = {
  local: 'Local parser',
  ai: 'AI correction',
}

export function CommandFeedbackPanel({ feedback }: CommandFeedbackPanelProps) {
  if (!feedback) {
    return (
      <section className="command-feedback is-empty" aria-label="Command feedback">
        <h3>Understanding</h3>
        <p>Command understanding feedback will appear here after a command runs.</p>
      </section>
    )
  }

  return (
    <section className="command-feedback" aria-label="Command feedback">
      <div className="command-feedback__header">
        <h3>Understanding</h3>
        <span>{statusLabels[feedback.status]}</span>
      </div>

      <p className="command-feedback__summary">{feedback.summary}</p>

      <dl>
        <div>
          <dt>Source</dt>
          <dd>{sourceLabels[feedback.source]}</dd>
        </div>
        {feedback.correction?.confidence ? (
          <div>
            <dt>Confidence</dt>
            <dd>{feedback.correction.confidence}</dd>
          </div>
        ) : null}
        {feedback.correction?.correctedText ? (
          <div>
            <dt>Correction</dt>
            <dd>{feedback.correction.correctedText}</dd>
          </div>
        ) : null}
        {feedback.correction?.interpretedIntent ? (
          <div>
            <dt>Intent</dt>
            <dd>{feedback.correction.interpretedIntent}</dd>
          </div>
        ) : null}
        {feedback.correction?.explanation ? (
          <div>
            <dt>Why</dt>
            <dd>{feedback.correction.explanation}</dd>
          </div>
        ) : null}
      </dl>

      {feedback.details.length > 0 ? (
        <ul>
          {feedback.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
