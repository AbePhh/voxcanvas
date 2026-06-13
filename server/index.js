import 'dotenv/config'
import express from 'express'
import { z } from 'zod'
import { buildSceneFewShotPrompt } from './sceneFewShotExamples.js'

const app = express()
const port = Number(process.env.PORT ?? 8787)
const deepSeekApiKey = process.env.DEEPSEEK_API_KEY
const deepSeekModel = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'

const plannerRequestSchema = z.object({
  sourceText: z.string().min(1).max(500),
  localCommand: z.unknown().optional(),
  sceneSpace: z.object({
    width: z.number(),
    height: z.number(),
    origin: z.literal('top-left'),
    unit: z.literal('normalized'),
  }),
  sceneCapabilities: z.object({
    allowedShapes: z.array(z.enum(['circle', 'rect', 'triangle', 'line', 'text'])),
    allowedColors: z.array(
      z.enum([
        'red',
        'orange',
        'yellow',
        'green',
        'blue',
        'purple',
        'black',
        'white',
        'gray',
      ]),
    ),
    maxElements: z.number(),
  }),
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
        groupId: z.string().optional(),
        groupLabel: z.string().optional(),
        partLabel: z.string().optional(),
        zIndex: z.number().optional(),
      }),
    ),
  }),
})

app.use(express.json({ limit: '128kb' }))

function buildPlannerPrompt(input) {
  return [
    'You are the AI command normalizer for VoxCanvas, a voice-controlled SVG drawing tool.',
    'Your job is to correct noisy speech-recognition text and normalize casual user language into exactly one supported JSON command.',
    'Return JSON only. Do not include markdown or explanations.',
    'Never invent a new action or field. Use only the schemas listed below.',
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
    '- scene: { action: "scene", title?, sourceText, elements: [{ id, groupId?, groupLabel?, partLabel?, shape, color, bbox, zIndex?, text? }] }',
    '- undo / redo / clear: { action, sourceText }',
    '',
    'Allowed shapes: circle, rect, triangle, line, text.',
    'Allowed colors: red, orange, yellow, green, blue, purple, black, white, gray.',
    'Allowed positions: top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right.',
    'Allowed sizes: small, medium, large.',
    'Allowed canvas resize directions: larger, smaller, wider, narrower, taller, shorter.',
    'Allowed canvas resize anchors: center, left, right, top, bottom, top-left, top-right, bottom-left, bottom-right.',
    'Allowed target modes: selected, last, shape, position, any, semantic.',
    'Targets may include filters: { mode, id?, shape?, color?, position?, groupId?, groupLabel?, partLabel? }.',
    'Use target mode "semantic" when editing AI-generated scene graph objects or parts by their labels.',
    'Semantic target examples: { mode: "semantic", groupLabel: "房子" } edits the whole house group; { mode: "semantic", groupLabel: "房子", partLabel: "屋顶" } edits only the roof.',
    'Resize may target one concrete object, one semantic part, or one unique semantic group. If multiple semantic groups share the same label, include groupId or return unknown so the UI can clarify.',
    '',
    'Rules:',
    '- Treat the user command as speech-recognition output. It may contain homophones, missing words, casual phrases, or minor recognition mistakes.',
    '- Correct likely ASR mistakes only when the drawing intent is clear. Examples: "话不" may mean "画布", "园形" may mean "圆形", "兰色" may mean "蓝色".',
    '- Preserve the original user text in sourceText. Do not rewrite sourceText.',
    '- Use the local parser result as a hint, not as authority. If it is unsafe, incomplete, or clearly caused by noisy speech, normalize to the best supported command.',
    '- If the user intent is unclear, ambiguous, unsafe, or unsupported, return { "action": "unknown", "reason": "unsupported-action", "sourceText": original text }.',
    '- For complex multi-object scene requests, prefer action "scene" instead of forcing the request into a single create command.',
    '- A scene must be decomposed into editable primitive elements. Do not output bitmap images, SVG strings, paths, CSS, external assets, or template names.',
    '- Scene elements must use normalized bbox coordinates inside sceneSpace. bbox uses top-left origin: { x, y, width, height }.',
    '- Preserve semantic grouping with groupId, groupLabel, and partLabel. Example: a house may have wall, roof, and door elements sharing groupId "house-1".',
    '- Use zIndex for layering; higher zIndex appears above lower zIndex.',
    '- Keep scene elements visually balanced and inside sceneSpace. Do not exceed sceneCapabilities.maxElements.',
    '- Scene output should be complete, recognizable, and editable. Complex scenes should not collapse into one element unless the user truly requested one simple object.',
    '- Use as many elements as the scene needs, while staying under sceneCapabilities.maxElements. Avoid tiny, decorative-only elements that do not help recognition.',
    '- Main objects should have a reasonable visual footprint, related parts in the same group should be spatially close, and the layout should reflect user relations such as beside, above, below, and in the sky.',
    '- Use the examples below as quality and formatting references, not as fixed templates. Adapt coordinates to the provided sceneSpace and the user request.',
    '- Prefer create text for text box, title, label, words, writing, or inserting text.',
    '- For text commands, separate style attributes from text content.',
    '- Example: "添加一个文本框在右上角内容是我是张红兵颜色是蓝色" -> { "action": "create", "shape": "text", "color": "blue", "position": "top-right", "size": "medium", "text": "我是张红兵", "sourceText": original text }.',
    '- Example: "把绿色的圆圈移动到右上角" -> { "action": "move", "target": { "mode": "shape", "shape": "circle", "color": "green" }, "mode": "absolute", "position": "top-right", "sourceText": original text }.',
    '- Example: "把房子的屋顶改成蓝色" -> { "action": "recolor", "target": { "mode": "semantic", "groupLabel": "房子", "partLabel": "屋顶" }, "color": "blue", "sourceText": original text }.',
    '- Example: "把树往右移动一点" -> { "action": "move", "target": { "mode": "semantic", "groupLabel": "树" }, "mode": "relative", "direction": "right", "distance": 48, "sourceText": original text }.',
    '- Example: "删除太阳" when the canvas contains a scene group labeled 太阳 -> { "action": "delete", "target": { "mode": "semantic", "groupLabel": "太阳" }, "sourceText": original text }.',
    '- Example: "话不左边宽一点" -> { "action": "resizeCanvas", "mode": "relative", "direction": "wider", "anchor": "left", "amount": 120, "sourceText": original text }.',
    '- Example: "把绿的圆挪右上一点" -> target { mode: "shape", shape: "circle", color: "green" }, mode "absolute", position "top-right".',
    '- Example: "画一间房子，旁边有一棵树，右上角有太阳" -> return action "scene" with primitive rect, triangle, circle, and line elements using bbox coordinates in sceneSpace.',
    '- Example: "画一个生日派对，有蛋糕、气球和桌子" -> return action "scene" with primitive shapes grouped as cake, balloons, and table when it can be approximated safely.',
    '- Use target color only to identify existing objects; use command color to set a new color.',
    '- For canvas resize commands, use anchor to describe where space is added or removed. Examples: "左边多一点空间" -> direction wider, anchor left; "下面留白多一点" -> direction taller, anchor bottom; "内容保持中间" -> anchor center.',
    '',
    'High-quality scene graph examples:',
    buildSceneFewShotPrompt(),
    '',
    `User command: ${input.sourceText}`,
    `Local parser result: ${JSON.stringify(input.localCommand ?? null)}`,
    `Scene space: ${JSON.stringify(input.sceneSpace)}`,
    `Scene capabilities: ${JSON.stringify(input.sceneCapabilities)}`,
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
              'You correct noisy voice commands and decompose complex scenes into strict JSON commands for a drawing application. Return JSON only.',
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
