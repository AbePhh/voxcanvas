import type { CanvasState, ShapeObject } from './types'
import './DrawingCanvas.css'

type DrawingCanvasProps = {
  state: CanvasState
}

function getTrianglePoints(shape: ShapeObject) {
  const top = `${shape.x + shape.width / 2},${shape.y}`
  const left = `${shape.x},${shape.y + shape.height}`
  const right = `${shape.x + shape.width},${shape.y + shape.height}`

  return `${top} ${right} ${left}`
}

function renderShape(shape: ShapeObject, isSelected: boolean) {
  const commonProps = {
    fill: shape.fill,
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth ?? 2,
  }

  const content = (() => {
    switch (shape.type) {
      case 'circle':
        return (
          <ellipse
            {...commonProps}
            cx={shape.x + shape.width / 2}
            cy={shape.y + shape.height / 2}
            rx={shape.width / 2}
            ry={shape.height / 2}
          />
        )
      case 'rect':
        return (
          <rect
            {...commonProps}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rx="4"
          />
        )
      case 'triangle':
        return <polygon {...commonProps} points={getTrianglePoints(shape)} />
      case 'line':
        return (
          <line
            x1={shape.x}
            y1={shape.y}
            x2={shape.x + shape.width}
            y2={shape.y + shape.height}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth ?? 4}
            strokeLinecap="round"
          />
        )
      case 'text':
        return (
          <text
            x={shape.x + shape.width / 2}
            y={shape.y + shape.height / 2}
            fill={shape.fill}
            fontSize={shape.fontSize ?? 24}
            fontWeight="700"
            dominantBaseline="middle"
            textAnchor="middle"
          >
            {shape.text}
          </text>
        )
      default:
        return null
    }
  })()

  return (
    <g
      key={shape.id}
      transform={
        shape.rotation
          ? `rotate(${shape.rotation} ${shape.x + shape.width / 2} ${
              shape.y + shape.height / 2
            })`
          : undefined
      }
    >
      {content}
      {isSelected ? (
        <rect
          className="selection-box"
          x={shape.x - 8}
          y={shape.y - 8}
          width={shape.width + 16}
          height={shape.height + 16}
          rx="6"
        />
      ) : null}
    </g>
  )
}

export function DrawingCanvas({ state }: DrawingCanvasProps) {
  return (
    <svg
      className="drawing-canvas"
      viewBox={`0 0 ${state.width} ${state.height}`}
      role="img"
      aria-label="VoxCanvas drawing preview"
    >
      <defs>
        <pattern
          id="canvas-grid"
          width="32"
          height="32"
          patternUnits="userSpaceOnUse"
        >
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e5e7eb" />
        </pattern>
      </defs>
      <rect width={state.width} height={state.height} fill="#f8fafc" />
      <rect width={state.width} height={state.height} fill="url(#canvas-grid)" />
      {state.shapes.map((shape) => renderShape(shape, shape.id === state.selectedId))}
    </svg>
  )
}
