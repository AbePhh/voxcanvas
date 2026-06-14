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
    selectedGroupId: z.string().optional(),
    semanticGroups: z
      .array(
        z.object({
          id: z.string(),
          groupId: z.string().optional(),
          groupLabel: z.string(),
          displayLabel: z.string(),
          referenceLabels: z.array(z.string()),
          partLabels: z.array(z.string()),
          objectIds: z.array(z.string()),
          bounds: z.object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
          }),
          selected: z.boolean(),
        }),
      )
      .optional(),
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

const explicitPrimitiveShapePattern =
  /圆形|圆圈|圆|矩形|长方形|正方形|方块|三角形|三角|线条|直线|文本|文字|文本框/
const createIntentPattern = /画|绘制|创建|添加|生成|新增|加|放|插入/
const incrementalAdditionPattern =
  /再|再来|添加|新增|加一|加个|加一个|放一|放个|放一个|插入|右边|左边|旁边|附近|上面|下面|周围/
const wholeSceneResetPattern = /重新|重画|整个|完整|从头|新场景|全新场景/

function normalizeIntentText(text) {
  return text.replace(/\s+/g, '').replace(/[，。！？、,.!?；;：:"“”'‘’（）()]/g, '')
}

function requestsSemanticObject(input) {
  const text = normalizeIntentText(input.sourceText)
  const localParserEscalatedSemanticObject =
    input.localCommand?.action === 'unknown' &&
    input.localCommand?.reason === 'planner-required-scene-or-shape'

  return (
    createIntentPattern.test(text) &&
    !explicitPrimitiveShapePattern.test(text) &&
    (localParserEscalatedSemanticObject || text.length >= 4)
  )
}

function getPlannerPolicy(input) {
  const text = normalizeIntentText(input.sourceText)
  const existingSemanticGroups = (input.canvas.semanticGroups ?? []).map((group) => ({
    groupId: group.groupId,
    groupLabel: group.groupLabel,
    displayLabel: group.displayLabel,
    referenceLabels: group.referenceLabels,
    bounds: group.bounds,
  }))
  const requiresAddSceneObject =
    input.canvas.objects.length > 0 &&
    requestsSemanticObject(input) &&
    incrementalAdditionPattern.test(text) &&
    !wholeSceneResetPattern.test(text)

  return {
    requiresAddSceneObject,
    requestedSemanticObject: requestsSemanticObject(input),
    existingSemanticGroups,
    rule: requiresAddSceneObject
      ? 'Return addSceneObject only. Do not return scene or create. elements must contain only the newly added object/content.'
      : 'Choose scene for whole-scene creation, addSceneObject for incremental semantic additions, create only for explicit primitive shapes.',
  }
}

function getPolicyViolation(rawCommand, policy) {
  if (!rawCommand || typeof rawCommand !== 'object') {
    return 'planner-output-must-be-json-command'
  }

  if (
    policy.requiresAddSceneObject &&
    rawCommand.action !== 'addSceneObject' &&
    rawCommand.action !== 'scene'
  ) {
    return `incremental semantic addition must use addSceneObject, not ${rawCommand.action}`
  }

  if (policy.requestedSemanticObject && rawCommand.action === 'create') {
    return 'semantic additions must be decomposed into addSceneObject or scene elements, not reduced to one primitive create command'
  }

  return null
}

function buildPlannerRetryPrompt(input, rawCommand, violation, attempt) {
  const policy = getPlannerPolicy(input)

  return [
    `Your previous JSON violates VoxCanvas command policy: ${violation}.`,
    `Correction attempt ${attempt}. Return a corrected JSON command only.`,
    'For this user command, the expected action is addSceneObject.',
    'The corrected command must add only the newly requested content and must not include existing canvas objects.',
    'Do not output create for semantic objects, components, or scene content. create is only for explicit primitive shapes such as 圆形, 矩形, 三角形, 线条, or 文本.',
    'Do not output scene unless the user explicitly asks for a whole new scene.',
    'If the command follows "在 <existing object> <relation> 再加/放/生成 <new object>", the existing object is the anchor and the new object is objectLabel.',
    'Examples of this pattern:',
    '- "在太阳下面再加一朵云" -> action addSceneObject, objectLabel "云", anchor { groupLabel: "太阳", relation: "below" }, elements only for the new cloud.',
    '- "在桥上面再放一只鸟" -> action addSceneObject, objectLabel "鸟", anchor { groupLabel: "桥", relation: "above" }, elements only for the new bird.',
    'The elements array must decompose the new semantic object into editable primitive parts with groupId, groupLabel, partLabel, shape, color, bbox, and zIndex.',
    `User command: ${input.sourceText}`,
    `Policy: ${JSON.stringify(policy)}`,
    `Previous JSON: ${JSON.stringify(rawCommand)}`,
  ].join('\n')
}

function buildPlannerPrompt(input) {
  const policy = getPlannerPolicy(input)

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
    '- addSceneObject: { action: "addSceneObject", title?, objectLabel?, anchor?, sourceText, elements: [{ id, groupId?, groupLabel?, partLabel?, shape, color, bbox, zIndex?, text? }] }',
    '- undo / redo / clear: { action, sourceText }',
    '',
    'Optional correction metadata:',
    '- Any non-unknown command may include correction: { correctedText?, interpretedIntent?, explanation?, confidence?, shouldConfirm? }.',
    '- confidence must be "high", "medium", or "low". Use "high" only when the intent and target are clear.',
    '- correctedText is the best corrected version of the speech text, not a rewritten sourceText.',
    '- interpretedIntent should be a short user-facing summary of what will happen.',
    '- explanation should mention the important ASR correction or disambiguation, if any.',
    '- shouldConfirm should be true when the command is plausible but not safe enough to execute without user awareness.',
    '',
    'Allowed shapes: circle, rect, triangle, line, text.',
    'Allowed colors: red, orange, yellow, green, blue, purple, black, white, gray.',
    'Allowed positions: top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right.',
    'Allowed sizes: small, medium, large.',
    'Allowed canvas resize directions: larger, smaller, wider, narrower, taller, shorter.',
    'Allowed canvas resize anchors: center, left, right, top, bottom, top-left, top-right, bottom-left, bottom-right.',
    'Allowed target modes: selected, last, shape, position, any, semantic.',
    'Targets may include filters: { mode, id?, shape?, color?, position?, groupId?, groupLabel?, partLabel? }.',
    'Allowed addSceneObject anchor relations: left-of, right-of, above, below, near, inside, around.',
    'addSceneObject anchor may include { groupId?, groupLabel?, partLabel?, relation? } to explain what existing object the new content is placed relative to.',
    'Use target mode "semantic" when editing AI-generated scene graph objects or parts by their labels.',
    'Semantic target examples: { mode: "semantic", groupLabel: "房子" } edits the whole house group; { mode: "semantic", groupLabel: "房子", partLabel: "屋顶" } edits only the roof.',
    'Canvas context includes semanticGroups. When the user refers to a displayed duplicate label, ordinal phrase, or reference label such as "树 2", "第二棵树", or "tree-2", copy that groupId into the target.',
    'Resize may target one concrete object, one semantic part, or one unique semantic group. If multiple semantic groups share the same label, include groupId or return unknown so the UI can clarify.',
    '',
    'Rules:',
    '- Treat the user command as speech-recognition output. It may contain homophones, missing words, casual phrases, or minor recognition mistakes.',
    '- Correct likely ASR mistakes only when the drawing intent is clear. Examples: "话不" may mean "画布", "园形" may mean "圆形", "兰色" may mean "蓝色".',
    '- Preserve the original user text in sourceText. Do not rewrite sourceText.',
    '- Prefer returning correction metadata so the UI can explain how noisy speech was understood.',
    '- Use the local parser result as a hint, not as authority. If it is unsafe, incomplete, or clearly caused by noisy speech, normalize to the best supported command.',
    '- If the user intent is unclear, ambiguous, unsafe, or unsupported, return { "action": "unknown", "reason": "unsupported-action", "sourceText": original text }.',
    '- If the user edits a scene object and one semanticGroups entry clearly matches their wording, include its groupId in the semantic target. If several entries still match and none is selected, return a semantic target without groupId so the UI can ask for clarification.',
    '- Use action "scene" only when the user asks to create, draw, or regenerate a whole scene or composition from scratch.',
    '- Use action "addSceneObject" when the user asks to add, insert, place, generate another, create one more, or put a semantic object/content onto an existing canvas. Chinese cues include "再", "再来", "添加", "新增", "加一个", "放一个", "在...旁边", "在...右边", "在...左边".',
    '- For addSceneObject, elements must contain only the newly added object/content. Do not repeat existing houses, trees, suns, ground, labels, or other canvas objects unless the user explicitly asks to duplicate that exact object.',
    '- For addSceneObject, use objectLabel for the requested content, for example "树", "太阳", "云", "花". Use anchor to reference an existing semantic group when the user says relative phrases such as "房子右边".',
    '- In "在 A 的 下面/上面/左边/右边/旁边 再加/放/生成 B" commands, A is the anchor and B is the new objectLabel. Do not confuse the anchor with the added object.',
    '- Example mappings: "在太阳下面再加一朵云" means add a new cloud below the existing sun; "在房子左边再放一辆车" means add a new car left of the existing house.',
    '- Never return a single create command for an added semantic object such as 云, 树, 车, 鸟, 桥, 花, 机器人, or other user-named content. Decompose it into scene elements and preserve semantic grouping.',
    '- For complex multi-object scene requests on a blank or intentionally new composition, prefer action "scene" instead of forcing the request into a single create command.',
    '- A scene must be decomposed into editable primitive elements. Do not output bitmap images, SVG strings, paths, CSS, external assets, or template names.',
    '- addSceneObject must also be decomposed into editable primitive elements using the same element schema as scene.',
    '- Scene elements must use normalized bbox coordinates inside sceneSpace. bbox uses top-left origin: { x, y, width, height }.',
    '- Preserve semantic grouping with groupId, groupLabel, and partLabel. Example: a house may have wall, roof, and door elements sharing groupId "house-1".',
    '- When adding new scene objects to an existing canvas, do not reuse any existing canvas object groupId. Use a new groupId such as "tree-2" for a second tree. If modifying an existing object, return an edit command with a semantic target instead of a scene command.',
    '- When addSceneObject references an existing object, use Canvas context semanticGroups and bounds to place the new elements near the requested anchor. The anchor object itself must not appear in elements.',
    '- Use zIndex for layering; higher zIndex appears above lower zIndex.',
    '- Keep scene elements visually balanced and inside sceneSpace. Do not exceed sceneCapabilities.maxElements.',
    '- Scene output should be complete, recognizable, and editable. Complex scenes should not collapse into one element unless the user truly requested one simple object.',
    '- Use as many elements as the scene needs, while staying under sceneCapabilities.maxElements. Avoid tiny, decorative-only elements that do not help recognition.',
    '- Main objects should have a reasonable visual footprint, related parts in the same group should be spatially close, and the layout should reflect user relations such as beside, above, below, and in the sky.',
    '- Use the examples below as quality and formatting references, not as fixed templates. Adapt coordinates to the provided sceneSpace and the user request.',
    '- Prefer create text for text box, title, label, words, writing, or inserting text.',
    '- For text commands, separate style attributes from text content.',
    '- Example: "添加一个文本框在右上角内容是我是张红兵颜色是蓝色" -> { "action": "create", "shape": "text", "color": "blue", "position": "top-right", "size": "medium", "text": "我是张红兵", "sourceText": original text, "correction": { "correctedText": "添加一个文本框在右上角，内容是我是张红兵，颜色是蓝色", "interpretedIntent": "在右上角创建蓝色文本：我是张红兵", "confidence": "high" } }.',
    '- Example: "把绿色的圆圈移动到右上角" -> { "action": "move", "target": { "mode": "shape", "shape": "circle", "color": "green" }, "mode": "absolute", "position": "top-right", "sourceText": original text, "correction": { "interpretedIntent": "把绿色圆形移动到右上角", "confidence": "high" } }.',
    '- Example: "把房子的屋顶改成蓝色" -> { "action": "recolor", "target": { "mode": "semantic", "groupLabel": "房子", "partLabel": "屋顶" }, "color": "blue", "sourceText": original text }.',
    '- Example: "把树往右移动一点" -> { "action": "move", "target": { "mode": "semantic", "groupLabel": "树" }, "mode": "relative", "direction": "right", "distance": 48, "sourceText": original text }.',
    '- Example: "删除太阳" when the canvas contains a scene group labeled 太阳 -> { "action": "delete", "target": { "mode": "semantic", "groupLabel": "太阳" }, "sourceText": original text }.',
    '- Example: "话不左边宽一点" -> { "action": "resizeCanvas", "mode": "relative", "direction": "wider", "anchor": "left", "amount": 120, "sourceText": original text, "correction": { "correctedText": "画布左边宽一点", "interpretedIntent": "从左侧增加画布宽度约 120px", "explanation": "将“话不”纠正为“画布”", "confidence": "high" } }.',
    '- Example: "把绿的圆挪右上一点" -> target { mode: "shape", shape: "circle", color: "green" }, mode "absolute", position "top-right".',
    '- Example: "画一间房子，旁边有一棵树，右上角有太阳" -> return action "scene" with primitive rect, triangle, circle, and line elements using bbox coordinates in sceneSpace.',
    '- Example: "在房子的右边再生成一棵树" when the canvas already has 房子 -> return action "addSceneObject" with objectLabel "树", anchor { "groupLabel": "房子", "relation": "right-of" }, and only the new tree trunk/crown elements using a new groupId such as "tree-2".',
    '- Example: "在太阳下面再加一朵云" when the canvas already has 太阳 -> return action "addSceneObject" with objectLabel "云", anchor { "groupLabel": "太阳", "relation": "below" }, and only the new cloud elements using groupLabel "云".',
    '- Example: "旁边再放一个太阳" when the canvas already has content -> return action "addSceneObject" with objectLabel "太阳" and only new sun elements. Do not include existing scene elements.',
    '- Example: "画一个生日派对，有蛋糕、气球和桌子" -> return action "scene" with primitive shapes grouped as cake, balloons, and table when it can be approximated safely.',
    '- Use target color only to identify existing objects; use command color to set a new color.',
    '- For canvas resize commands, use anchor to describe where space is added or removed. Examples: "左边多一点空间" -> direction wider, anchor left; "下面留白多一点" -> direction taller, anchor bottom; "内容保持中间" -> anchor center.',
    '',
    'High-quality scene graph examples:',
    buildSceneFewShotPrompt(),
    '',
    'App-level command policy:',
    JSON.stringify(policy),
    policy.requiresAddSceneObject
      ? 'IMPORTANT: This user command is an incremental semantic addition. You MUST return action "addSceneObject". Do not return "scene" or "create".'
      : 'IMPORTANT: Use "create" only for explicit primitive shapes. Use "scene" for whole scenes. Use "addSceneObject" for adding semantic objects/content to an existing canvas.',
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

  async function requestPlannerCommand(messages) {
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
        messages,
      }),
    })

    if (!deepSeekResponse.ok) {
      const errorText = await deepSeekResponse.text()
      return {
        ok: false,
        error: 'planner-upstream-error',
        details: errorText,
      }
    }

    const result = await deepSeekResponse.json()
    const content = result?.choices?.[0]?.message?.content

    if (typeof content !== 'string') {
      return {
        ok: false,
        error: 'planner-empty-response',
      }
    }

    return {
      ok: true,
      rawCommand: JSON.parse(content),
    }
  }

  try {
    const baseMessages = [
      {
        role: 'system',
        content:
          'You correct noisy voice commands, distinguish whole-scene creation from incremental content additions, and return strict JSON commands for a drawing application. Return JSON only.',
      },
      {
        role: 'user',
        content: buildPlannerPrompt(parsedBody.data),
      },
    ]
    let plannerResult = await requestPlannerCommand(baseMessages)

    if (!plannerResult.ok) {
      response.status(502).json({
        error: plannerResult.error,
        details: plannerResult.details,
      })
      return
    }

    const policy = getPlannerPolicy(parsedBody.data)
    let violation = getPolicyViolation(plannerResult.rawCommand, policy)
    let retryCount = 0

    while (violation && retryCount < 2) {
      retryCount += 1
      plannerResult = await requestPlannerCommand([
        ...baseMessages,
        {
          role: 'assistant',
          content: JSON.stringify(plannerResult.rawCommand),
        },
        {
          role: 'user',
          content: buildPlannerRetryPrompt(
            parsedBody.data,
            plannerResult.rawCommand,
            violation,
            retryCount,
          ),
        },
      ])

      if (!plannerResult.ok) {
        response.status(502).json({
          error: plannerResult.error,
          details: plannerResult.details,
        })
        return
      }

      // The client validator can normalize some safe-but-imperfect planner output
      // (for example, a scene graph returned for an incremental add request).
      // Avoid blocking here after the retry; return the JSON and let the typed
      // validator decide whether it can be executed.
      violation = getPolicyViolation(plannerResult.rawCommand, policy)
    }

    response.json({
      rawCommand: plannerResult.rawCommand,
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
