import 'dotenv/config'
import express from 'express'
import { z } from 'zod'

const app = express()
const port = Number(process.env.PORT ?? 8787)
const deepSeekApiKey = process.env.DEEPSEEK_API_KEY
const deepSeekModel = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'

const plannerRequestSchema = z.object({
  sourceText: z.string().min(1).max(500),
  canvas: z.object({
    width: z.number(),
    height: z.number(),
    selectedId: z.string().optional(),
    objects: z.array(
      z.object({
        id: z.string(),
        type: z.enum(['circle', 'rect', 'triangle', 'line', 'text']),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        fill: z.string(),
        text: z.string().optional(),
      }),
    ),
  }),
})

app.use(express.json({ limit: '128kb' }))

function buildPlannerPrompt(input) {
  return [
    'You are the command planner for VoxCanvas, a voice-controlled SVG drawing tool.',
    'Convert the user command into exactly one JSON command.',
    'Return JSON only. Do not include markdown or explanations.',
    '',
    'Allowed actions:',
    '- create: { action, shape, color?, position?, size, text?, sourceText }',
    '- move absolute: { action, target, mode: "absolute", position, sourceText }',
    '- move relative: { action, target, mode: "relative", direction, distance, sourceText }',
    '- recolor: { action, target, color, sourceText }',
    '- resize: { action, target, direction, sourceText }',
    '- delete: { action, target, sourceText }',
    '- resizeCanvas absolute: { action, mode: "absolute", width, height, anchor?, sourceText }',
    '- resizeCanvas relative: { action, mode: "relative", direction, anchor?, amount?, sourceText }',
    '- undo / redo / clear: { action, sourceText }',
    '',
    'Allowed shapes: circle, rect, triangle, line, text.',
    'Allowed colors: red, orange, yellow, green, blue, purple, black, white, gray.',
    'Allowed positions: top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right.',
    'Allowed sizes: small, medium, large.',
    'Allowed canvas resize directions: larger, smaller, wider, narrower, taller, shorter.',
    'Allowed canvas resize anchors: center, left, right, top, bottom, top-left, top-right, bottom-left, bottom-right.',
    'Allowed target modes: selected, last, shape, position, any.',
    'Targets may include filters: { mode, id?, shape?, color?, position? }.',
    '',
    'Rules:',
    '- Prefer create text for text box, title, label, words, writing, or inserting text.',
    '- For text commands, separate style attributes from text content.',
    '- Example: "添加一个文本框在右上角内容是我是张红兵颜色是蓝色" -> color blue, text "我是张红兵", position top-right.',
    '- Example: "把绿色的圆圈移动到右上角" -> target { mode: "shape", shape: "circle", color: "green" }, mode "absolute", position "top-right".',
    '- Use target color only to identify existing objects; use command color to set a new color.',
    '- For canvas resize commands, use anchor to describe where space is added or removed. Examples: "左边多一点空间" -> direction wider, anchor left; "下面留白多一点" -> direction taller, anchor bottom; "内容保持中间" -> anchor center.',
    '- If the user asks for unsupported complex art, return the closest supported single command.',
    '- If the command is unsafe or impossible, return { "action": "unknown", "reason": "unsupported-action", "sourceText": original text }.',
    '',
    `User command: ${input.sourceText}`,
    `Canvas context: ${JSON.stringify(input.canvas)}`,
  ].join('\n')
}

app.post('/api/plan-command', async (request, response) => {
  if (!deepSeekApiKey) {
    response.status(500).json({
      error: 'missing-api-key',
      message: 'DEEPSEEK_API_KEY is not configured.',
    })
    return
  }

  const parsedBody = plannerRequestSchema.safeParse(request.body)

  if (!parsedBody.success) {
    response.status(400).json({
      error: 'invalid-request',
      details: parsedBody.error.flatten(),
    })
    return
  }

  try {
    const deepSeekResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deepSeekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: deepSeekModel,
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You produce strict JSON commands for a drawing application. Return JSON only.',
          },
          {
            role: 'user',
            content: buildPlannerPrompt(parsedBody.data),
          },
        ],
      }),
    })

    if (!deepSeekResponse.ok) {
      const errorText = await deepSeekResponse.text()
      response.status(502).json({
        error: 'planner-upstream-error',
        details: errorText,
      })
      return
    }

    const result = await deepSeekResponse.json()
    const content = result?.choices?.[0]?.message?.content

    if (typeof content !== 'string') {
      response.status(502).json({
        error: 'planner-empty-response',
      })
      return
    }

    response.json({
      rawCommand: JSON.parse(content),
    })
  } catch (error) {
    response.status(500).json({
      error: 'planner-request-failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.listen(port, () => {
  console.log(`VoxCanvas planner API listening on http://localhost:${port}`)
})
