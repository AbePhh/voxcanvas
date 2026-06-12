import type { ParsedCommand } from './types'
import './CommandPreview.css'

type CommandPreviewProps = {
  command: ParsedCommand | null
}

function formatCommand(command: ParsedCommand) {
  if (command.action === 'unknown') {
    return `Unknown: ${command.reason}`
  }

  if (command.action === 'create') {
    return [
      `Create ${command.shape}`,
      command.color ? `color ${command.color}` : 'default color',
      command.position ? `at ${command.position}` : 'default position',
      `size ${command.size}`,
    ].join(' / ')
  }

  return command.action
}

export function CommandPreview({ command }: CommandPreviewProps) {
  return (
    <div className="command-preview" aria-live="polite">
      <h3>Parsed Command</h3>
      {command ? (
        <>
          <p className={command.action === 'unknown' ? 'parse-error' : 'parse-ok'}>
            {formatCommand(command)}
          </p>
          <pre>{JSON.stringify(command, null, 2)}</pre>
        </>
      ) : (
        <p className="parse-empty">Waiting for recognized speech.</p>
      )}
    </div>
  )
}
