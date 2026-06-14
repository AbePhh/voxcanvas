import { colorLabels, positionLabels, shapeLabels } from './commandLabels'
import type { CommandTarget, ParsedCommand, SpatialMoveRelation } from './types'
import type { CommandCorrectionSummary } from '../planner/types'

export type CommandExecutionFeedback = {
  source: 'local' | 'ai'
  status: 'ready' | 'executed' | 'needs-clarification' | 'blocked'
  title: string
  summary: string
  details: string[]
  metrics?: CommandFeedbackMetric[]
  correction?: CommandCorrectionSummary
}

export type CommandFeedbackMetric = {
  label: string
  value: string
}

export type CommandExecutionFeedbackContext = {
  source: CommandExecutionFeedback['source']
  correction?: CommandCorrectionSummary
}

function describeTarget(target: CommandTarget) {
  if (target.mode === 'semantic') {
    if (target.groupLabel && target.partLabel) {
      return `${target.groupLabel}的${target.partLabel}`
    }

    return target.groupLabel ?? target.groupId ?? target.partLabel ?? '语义对象'
  }

  if (target.mode === 'selected') {
    return '当前选中的对象'
  }

  if (target.mode === 'last') {
    return '最近添加的对象'
  }

  const parts = [
    target.position ? positionLabels[target.position] : undefined,
    target.color ? colorLabels[target.color] : undefined,
    target.shape ? shapeLabels[target.shape] : undefined,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join('') : '匹配的对象'
}

const spatialRelationLabels: Record<SpatialMoveRelation, string> = {
  'left-of': '左侧',
  'right-of': '右侧',
  above: '上方',
  below: '下方',
}

function describeCommand(command: ParsedCommand) {
  if (command.action === 'unknown') {
    return {
      title: '未能理解命令',
      summary: `原因：${command.reason}`,
      details: ['系统没有执行任何绘图操作。'],
    }
  }

  if (command.action === 'create') {
    const details = [
      `图形：${shapeLabels[command.shape]}`,
      `尺寸：${command.size}`,
      command.color ? `颜色：${colorLabels[command.color]}` : '颜色：默认',
      command.position ? `位置：${positionLabels[command.position]}` : '位置：默认',
    ]

    if (command.text) {
      details.push(`文本：${command.text}`)
    }

    return {
      title: '创建图形',
      summary: `创建${command.color ? colorLabels[command.color] : ''}${
        shapeLabels[command.shape]
      }。`,
      details,
    }
  }

  if (command.action === 'move') {
    const target = describeTarget(command.target)
    const reference = command.mode === 'spatial' ? describeTarget(command.reference) : null
    const summary =
      command.mode === 'spatial'
        ? `将${target}放到${reference}的${spatialRelationLabels[command.relation]}。`
        : command.mode === 'relative'
          ? `将${target}向${command.direction === 'left' ? '左' : command.direction === 'right' ? '右' : command.direction === 'up' ? '上' : '下'}移动。`
          : `将${target}移动到${command.position ? positionLabels[command.position] : '指定位置'}。`

    return {
      title: '移动对象',
      summary,
      details: [
        `目标：${target}`,
        command.mode === 'spatial'
          ? `参照物：${reference}，关系：${spatialRelationLabels[command.relation]}，间距：${command.gap ?? 24}px`
          : command.mode === 'relative'
            ? `距离：${command.distance ?? 48}px`
            : `位置：${command.position ? positionLabels[command.position] : '未指定'}`,
      ],
    }
  }

  if (command.action === 'recolor') {
    const target = describeTarget(command.target)

    return {
      title: '修改颜色',
      summary: `将${target}改为${colorLabels[command.color]}。`,
      details: [`目标：${target}`, `颜色：${colorLabels[command.color]}`],
    }
  }

  if (command.action === 'resize') {
    const target = describeTarget(command.target)

    return {
      title: '调整大小',
      summary: `${command.direction === 'larger' ? '放大' : '缩小'}${target}。`,
      details: [
        `目标：${target}`,
        `方向：${command.direction === 'larger' ? '放大' : '缩小'}`,
      ],
    }
  }

  if (command.action === 'delete') {
    const target = describeTarget(command.target)

    return {
      title: '删除对象',
      summary: `删除${target}。`,
      details: [`目标：${target}`],
    }
  }

  if (command.action === 'resizeCanvas') {
    if (command.mode === 'absolute') {
      return {
        title: '调整画布',
        summary: `将画布设置为 ${command.width} x ${command.height}。`,
        details: [
          `宽度：${command.width}px`,
          `高度：${command.height}px`,
          `锚点：${command.anchor ?? 'center'}`,
        ],
      }
    }

    return {
      title: '调整画布',
      summary: `让画布${command.direction}。`,
      details: [
        `方向：${command.direction}`,
        `锚点：${command.anchor ?? 'center'}`,
        `幅度：${command.amount ?? 120}px`,
      ],
    }
  }

  if (command.action === 'scene') {
    return {
      title: '生成场景',
      summary: `生成${command.title ?? '场景'}，包含 ${command.elements.length} 个基础图形。`,
      details: [
        `场景：${command.title ?? '未命名'}`,
        `元素数量：${command.elements.length}`,
      ],
    }
  }

  if (command.action === 'addSceneObject') {
    return {
      title: '新增内容',
      summary: `新增${command.objectLabel ?? command.title ?? '内容'}，包含 ${
        command.elements.length
      } 个基础图形。`,
      details: [
        `内容：${command.objectLabel ?? command.title ?? '未命名'}`,
        `元素数量：${command.elements.length}`,
      ],
    }
  }

  if (command.action === 'export') {
    return {
      title: '导出作品',
      summary: command.format
        ? `导出为 ${command.format.toUpperCase()}。`
        : '需要先选择导出格式。',
      details: [`格式：${command.format?.toUpperCase() ?? '未指定'}`],
    }
  }

  return {
    title: command.action === 'undo' ? '撤销' : command.action === 'redo' ? '重做' : '清空画布',
    summary:
      command.action === 'undo'
        ? '撤销上一步。'
        : command.action === 'redo'
          ? '恢复上一步。'
          : '清空画布。',
    details: [],
  }
}

export function createCommandExecutionFeedback(
  command: ParsedCommand,
  options: {
    source: 'local' | 'ai'
    status: CommandExecutionFeedback['status']
    correction?: CommandCorrectionSummary
  },
): CommandExecutionFeedback {
  const description = describeCommand(command)

  return {
    source: options.source,
    status: options.status,
    correction: options.correction,
    ...description,
  }
}

export function createCancellationFeedback(sourceText: string): CommandExecutionFeedback {
  return {
    source: 'local',
    status: 'blocked',
    title: '取消命令',
    summary: '已取消当前语音命令，没有执行新的绘图操作。',
    details: sourceText.trim() ? [`取消输入：${sourceText.trim()}`] : [],
  }
}
