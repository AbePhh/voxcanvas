import type { ParsedCommand } from './types'
import { ScenePlanPreview } from './ScenePlanPreview'
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

  if (command.action === 'move') {
    return command.mode === 'relative'
      ? `Move ${command.target.mode} target ${command.direction}`
      : `Move ${command.target.mode} target to ${command.position}`
  }

  if (command.action === 'recolor') {
    return `Recolor ${command.target.mode} target to ${command.color}`
  }

  if (command.action === 'resize') {
    return `Resize ${command.target.mode} target ${command.direction}`
  }

  if (command.action === 'delete') {
    return `Delete ${command.target.mode} target`
  }

  if (command.action === 'export') {
    return command.format
      ? `Export canvas as ${command.format.toUpperCase()}`
      : 'Export format required'
  }

  if (command.action === 'resizeCanvas') {
    return command.mode === 'absolute'
      ? `Resize canvas to ${command.width} x ${command.height} from ${
          command.anchor ?? 'center'
        }`
      : `Resize canvas ${command.direction} from ${command.anchor ?? 'center'}`
  }

  if (command.action === 'scene') {
    return `Create scene${command.title ? ` "${command.title}"` : ''} with ${
      command.elements.length
    } elements`
  }

  if (command.action === 'addSceneObject') {
    return `Add ${command.objectLabel ?? command.title ?? 'content'} with ${
      command.elements.length
    } elements`
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
          {command.action === 'scene' || command.action === 'addSceneObject' ? (
            <ScenePlanPreview command={command} />
          ) : null}
          <pre>{JSON.stringify(command, null, 2)}</pre>
        </>
      ) : (
        <p className="parse-empty">Waiting for recognized speech.</p>
      )}
    </div>
  )
}
