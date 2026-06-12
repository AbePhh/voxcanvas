import type { ExportFormat } from '../commands/types'

type ExportCanvasOptions = {
  filename?: string
  format: ExportFormat
}

function createObjectUrl(blob: Blob) {
  return URL.createObjectURL(blob)
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load SVG for export.'))
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to render exported image.'))
          return
        }

        resolve(blob)
      },
      mimeType,
      quality,
    )
  })
}

function serializeSvg(svgElement: SVGSVGElement) {
  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement

  clonedSvg.querySelectorAll('.selection-box').forEach((element) => element.remove())
  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  return new XMLSerializer().serializeToString(clonedSvg)
}

export async function exportSvgElement(
  svgElement: SVGSVGElement,
  { filename = 'voxcanvas', format }: ExportCanvasOptions,
) {
  const svgText = serializeSvg(svgElement)
  const svgBlob = new Blob([svgText], {
    type: 'image/svg+xml;charset=utf-8',
  })

  if (format === 'svg') {
    const svgDownloadUrl = createObjectUrl(svgBlob)

    try {
      triggerDownload(svgDownloadUrl, `${filename}.svg`)
    } finally {
      URL.revokeObjectURL(svgDownloadUrl)
    }

    return
  }

  const svgUrl = createObjectUrl(svgBlob)

  try {
    const image = await loadImage(svgUrl)
    const width = svgElement.viewBox.baseVal.width || svgElement.clientWidth
    const height = svgElement.viewBox.baseVal.height || svgElement.clientHeight
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Canvas export is not supported in this browser.')
    }

    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))

    if (format === 'jpg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png'
    const imageBlob = await canvasToBlob(
      canvas,
      mimeType,
      format === 'jpg' ? 0.92 : undefined,
    )
    const imageUrl = createObjectUrl(imageBlob)

    try {
      triggerDownload(imageUrl, `${filename}.${format}`)
    } finally {
      URL.revokeObjectURL(imageUrl)
    }
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}
