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
  /再|再来|添加|新增|插入|创建|生成|加上|加一|加个|加一个|加只|加棵|加朵|加辆|加座|加条|加片|加颗|加块|加束|加艘|加台|放一|放个|放一个|放只|放棵|放朵|放辆|放座|放条|放片|放颗|放块|放束|放艘|放台/
const wholeSceneResetPattern = /重新|重画|整个|完整|从头|新场景|全新场景/
const multiStepConnectorPattern =
  /然后|接着|随后|之后|最后|并且|同时|顺便|再把|再将|再让|再给|[,，;；]|then|and then/i
const multiStepSplitPattern =
  /然后|接着|随后|之后|最后|并且|同时|顺便|再把|再将|再让|再给|[,，;；]|then|and then/i
const batchStepIntentPatterns = [
  /(画|绘制|创建|添加|生成|新增|插入|加|放).{0,24}(圆形|圆圈|圆|矩形|长方形|正方形|方块|三角形|三角|线条|直线|文本|文字|文本框)/i,
  /(移动|移到|移动到|挪|挪到|放到|放在|贴着|靠着|往.{0,10}(左|右|上|下).{0,10}(移|移动|挪)|到.{0,10}(左|右|上|下).{0,10}(边|角|方))/i,
  /(放大|缩小|变大|变小|大一点|小一点|缩放|扩大|缩窄)/i,
  /(改成|改为|变成|变为|换成|设成|设置为|染成|涂成).{0,18}(红|红色|橙|橙色|黄|黄色|绿|绿色|蓝|蓝色|紫|紫色|黑|黑色|白|白色|灰|灰色|red|orange|yellow|green|blue|purple|black|white|gray)/i,
  /(删除|删掉|移除|去掉|清除)/i,
  /(画布|画板).{0,18}(调整|设置|设为|变大|变小|放大|缩小|变宽|变窄|变高|变矮|加宽|加高|空间)/i,
  /(对齐|排成|排列|一行|一列|横排|竖排|居中|统一|批量|所有|全部|全都|这些|它们|一起)/i,
]

function normalizeIntentText(text) {
  return text.replace(/\s+/g, '').replace(/[，。！？、,.!?；;：:"“”'‘’（）()]/g, '')
}

function hasBatchStepIntent(text) {
  return batchStepIntentPatterns.some((pattern) => pattern.test(text))
}

function requiresBatchCommand(sourceText) {
  if (!multiStepConnectorPattern.test(sourceText)) {
    return false
  }

  const clauses = sourceText
    .split(multiStepSplitPattern)
    .map((clause) => clause.trim())
    .filter(Boolean)

  return clauses.filter(hasBatchStepIntent).length >= 2
}

function splitBatchSourceText(sourceText) {
  return sourceText
    .split(multiStepSplitPattern)
    .map((clause) => clause.trim())
    .filter(Boolean)
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
  const requiresBatch =
    !requiresAddSceneObject &&
    !wholeSceneResetPattern.test(text) &&
    requiresBatchCommand(input.sourceText)

  return {
    requiresAddSceneObject,
    requiresBatch,
    requestedSemanticObject: requestsSemanticObject(input),
    existingSemanticGroups,
    rule: requiresAddSceneObject
      ? 'Return addSceneObject only. Do not return scene or create. elements must contain only the newly added object/content.'
      : requiresBatch
        ? 'Return batch only. The user asked for multiple executable operations; preserve each operation as a separate ordered command.'
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

  if (policy.requiresBatch && rawCommand.action !== 'batch') {
    return `multi-step command must use batch, not ${rawCommand.action}`
  }

  if (
    policy.requiresBatch &&
    (!Array.isArray(rawCommand.commands) || rawCommand.commands.length < 2)
  ) {
    return 'multi-step batch must contain at least two commands'
  }

  return null
}

function buildPlannerRetryPrompt(input, rawCommand, violation, attempt) {
  const policy = getPlannerPolicy(input)

  if (policy.requiresBatch) {
    return buildBatchPlannerRetryPrompt(input, policy, rawCommand, violation, attempt)
  }

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

function buildBatchPlannerPrompt(input, policy) {
  return [
    'You are the batch command planner for VoxCanvas.',
    'The user utterance contains multiple executable drawing operations. Return exactly one JSON object.',
    '',
    'Mandatory output:',
    '- Use action "batch".',
    '- commands must contain every user-requested operation in order.',
    '- commands length must be 2 to 6.',
    '- Do not return a single create, move, recolor, resize, delete, or resizeCanvas command.',
    '- Do not drop any middle or final operation.',
    '- Do not include markdown or explanations.',
    '',
    'Allowed batch step schemas:',
    '- create: { "action": "create", "shape": "circle|rect|triangle|line|text", "color"?, "position"?, "size"?, "text"?, "sourceText" }',
    '- move absolute: { "action": "move", "target", "mode": "absolute", "position", "sourceText" }',
    '- move relative: { "action": "move", "target", "mode": "relative", "direction": "left|right|up|down", "distance"?, "sourceText" }',
    '- move spatial: { "action": "move", "target", "mode": "spatial", "reference", "relation": "left-of|right-of|above|below", "align"?, "gap"?, "sourceText" }',
    '- recolor: { "action": "recolor", "target", "color", "sourceText" }',
    '- resize: { "action": "resize", "target", "direction": "larger|smaller", "sourceText" }',
    '- delete: { "action": "delete", "target", "sourceText" }',
    '- align: { "action": "align", "target", "axis": "left|center|right|top|middle|bottom", "sourceText" }',
    '- arrange: { "action": "arrange", "target", "layout": "row|column", "spacing"?, "sourceText" }',
    '- resizeCanvas absolute: { "action": "resizeCanvas", "mode": "absolute", "width", "height", "anchor"?, "sourceText" }',
    '- resizeCanvas relative: { "action": "resizeCanvas", "mode": "relative", "direction", "anchor"?, "amount"?, "sourceText" }',
    '',
    'Forbidden inside batch.commands:',
    '- scene, addSceneObject, batch, undo, redo, clear, export, unknown.',
    '',
    'Target rules:',
    '- Existing scene objects should use { "mode": "semantic", "groupLabel": "..." }.',
    '- Existing scene parts should use { "mode": "semantic", "groupLabel": "...", "partLabel": "..." }.',
    '- For explicit bulk wording such as 所有, 全部, 全都, 这些, 它们, 一起, 统一, 每个, use target.scope "all".',
    '- For exact counted targets such as 三个圆 or 两棵树, set target.count to the requested number and usually set target.scope "all".',
    '- Never use { "mode": "any", "scope": "all" } unless the user clearly selected or described a safe subset.',
    '- If exactly one semanticGroups item matches the object label, include its groupId.',
    '- If a step edits the object created by the immediately previous create step, use target { "mode": "selected" }.',
    '- Bare object wording such as "树" or "房子" means the whole semantic group, not a part.',
    '- Part wording such as "树冠", "树干", "屋顶", "门", or "窗户" means that part only.',
    '- If the target is genuinely ambiguous and cannot be safely resolved, return { "action": "unknown", "reason": "ambiguous-target", "sourceText": original text }.',
    '',
    'Canonical examples:',
    'Input: 把树缩小一点，然后把树冠改成黄色',
    'Output: { "action": "batch", "sourceText": "把树缩小一点，然后把树冠改成黄色", "commands": [{ "action": "resize", "target": { "mode": "semantic", "groupLabel": "树" }, "direction": "smaller", "sourceText": "把树缩小一点" }, { "action": "recolor", "target": { "mode": "semantic", "groupLabel": "树", "partLabel": "树冠" }, "color": "yellow", "sourceText": "把树冠改成黄色" }] }',
    'Input: 画一个红色圆形，然后把它移动到右上角',
    'Output: { "action": "batch", "sourceText": "画一个红色圆形，然后把它移动到右上角", "commands": [{ "action": "create", "shape": "circle", "color": "red", "position": "center", "size": "medium", "sourceText": "画一个红色圆形" }, { "action": "move", "target": { "mode": "selected" }, "mode": "absolute", "position": "top-right", "sourceText": "把它移动到右上角" }] }',
    'Input: 把房子往右边移动一点，屋顶变成黑色',
    'Output: { "action": "batch", "sourceText": "把房子往右边移动一点，屋顶变成黑色", "commands": [{ "action": "move", "target": { "mode": "semantic", "groupLabel": "房子" }, "mode": "relative", "direction": "right", "distance": 48, "sourceText": "把房子往右边移动一点" }, { "action": "recolor", "target": { "mode": "semantic", "groupLabel": "房子", "partLabel": "屋顶" }, "color": "black", "sourceText": "屋顶变成黑色" }] }',
    'Input: 把所有气球变成红色，然后排成一行',
    'Output: { "action": "batch", "sourceText": "把所有气球变成红色，然后排成一行", "commands": [{ "action": "recolor", "target": { "mode": "semantic", "groupLabel": "气球", "scope": "all" }, "color": "red", "sourceText": "把所有气球变成红色" }, { "action": "arrange", "target": { "mode": "semantic", "groupLabel": "气球", "scope": "all" }, "layout": "row", "spacing": 32, "sourceText": "排成一行" }] }',
    '',
    'Supported values:',
    '- shapes: circle, rect, triangle, line, text.',
    '- colors: red, orange, yellow, green, blue, purple, black, white, gray.',
    '- positions: top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right.',
    '- sizes: small, medium, large.',
    '- canvas resize directions: larger, smaller, wider, narrower, taller, shorter.',
    '- canvas resize anchors: center, left, right, top, bottom, top-left, top-right, bottom-left, bottom-right.',
    '- spatial align: preserve, center, start, end. Use preserve unless the user explicitly asks for cross-axis alignment.',
    '- align axes: left, center, right, top, middle, bottom.',
    '- arrange layouts: row, column.',
    '',
    'App-level policy:',
    JSON.stringify(policy),
    '',
    `User command: ${input.sourceText}`,
    `Local parser result, often incomplete for multi-step commands: ${JSON.stringify(input.localCommand ?? null)}`,
    `Canvas context: ${JSON.stringify(input.canvas)}`,
  ].join('\n')
}

function buildBatchPlannerRetryPrompt(input, policy, rawCommand, violation, attempt) {
  return [
    `Your previous JSON violates VoxCanvas batch policy: ${violation}.`,
    `Correction attempt ${attempt}. Return JSON only.`,
    '',
    'You MUST return action "batch" with 2 to 6 commands.',
    'You MUST preserve every operation from the user command.',
    'Do not answer with only the first step or the first two steps.',
    'Do not answer with only create, move, resize, recolor, delete, or resizeCanvas.',
    'The number of commands must match the number of executable operations found in the utterance, up to the six-step limit.',
    'For three-step utterances, commands must contain three command objects in order.',
    '',
    'Use these exact patterns when applicable:',
    '- "把树缩小一点，然后把树冠改成黄色" -> resize whole 树, then recolor 树冠 yellow.',
    '- "画一个红色圆形，然后把它移动到右上角" -> create red circle, then move selected to top-right.',
    '- "把房子往右边移动一点，屋顶变成黑色" -> move whole 房子 right, then recolor 房子/屋顶 black.',
    '- "画一个红色圆形，然后移动到右上角，再把它改成蓝色" -> create red circle, then move selected to top-right, then recolor selected blue.',
    '',
    `User command: ${input.sourceText}`,
    `Policy: ${JSON.stringify(policy)}`,
    `Previous invalid JSON: ${JSON.stringify(rawCommand)}`,
  ].join('\n')
}

function buildBatchStepPrompt(input, steps, stepIndex, plannedCommands) {
  const stepText = steps[stepIndex]
  const previousStep = steps[stepIndex - 1]
  const previousCommand = plannedCommands[plannedCommands.length - 1]

  return [
    'You are the single-step normalizer inside VoxCanvas multi-step planning.',
    'Return exactly one JSON command for the current step only.',
    'The complete utterance may contain 2 to 6 ordered steps. This prompt is responsible for only the current step.',
    'Do not merge current step with earlier or later steps.',
    'Do not include markdown or explanations.',
    '',
    'Allowed actions for this step:',
    '- create: { action, shape, color?, position?, size?, text?, sourceText }',
    '- move absolute: { action, target, mode: "absolute", position, sourceText }',
    '- move relative: { action, target, mode: "relative", direction, distance?, sourceText }',
    '- move spatial: { action, target, mode: "spatial", reference, relation, align?, gap?, sourceText }',
    '- recolor: { action, target, color, sourceText }',
    '- resize: { action, target, direction, sourceText }',
    '- delete: { action, target, sourceText }',
    '- align: { action, target, axis, sourceText }',
    '- arrange: { action, target, layout, spacing?, sourceText }',
    '- resizeCanvas absolute: { action, mode: "absolute", width, height, anchor?, sourceText }',
    '- resizeCanvas relative: { action, mode: "relative", direction, anchor?, amount?, sourceText }',
    '',
    'Never return scene, addSceneObject, batch, undo, redo, clear, export, or unknown unless the current step cannot be safely normalized.',
    '',
    'Target inheritance rules:',
    '- If the current step says "它", "其", "这个", "这一个", omits the target, or only mentions a part such as "屋顶", "树冠", "门", "窗户", inherit the most relevant target from the previous planned commands.',
    '- If any previous step created a primitive and the current step refers to the created object, use target { "mode": "selected" }.',
    '- If the previous command targeted { mode: "semantic", groupLabel: "房子" } and the current step says "屋顶", output target { mode: "semantic", groupLabel: "房子", partLabel: "屋顶" }.',
    '- If the previous command targeted { mode: "semantic", groupLabel: "树" } and the current step says "树冠", output target { mode: "semantic", groupLabel: "树", partLabel: "树冠" }.',
    '- For third, fourth, fifth, and sixth steps, inherit from the latest relevant previous command, not only from step 1.',
    '- Bare object names such as "树" or "房子" target the whole semantic group.',
    '- Explicit part names target only that part.',
    '- If exactly one semanticGroups entry matches a semantic target, include its groupId.',
    '- For explicit bulk wording such as 所有, 全部, 全都, 这些, 它们, 一起, 统一, 每个, use target.scope "all".',
    '- For counted targets such as 三个圆 or 两棵树, set target.count and usually set target.scope "all".',
    '',
    'Supported values:',
    '- shapes: circle, rect, triangle, line, text.',
    '- colors: red, orange, yellow, green, blue, purple, black, white, gray.',
    '- positions: top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right.',
    '- sizes: small, medium, large.',
    '- move directions: left, right, up, down.',
    '- resize directions: larger, smaller.',
    '- canvas resize directions: larger, smaller, wider, narrower, taller, shorter.',
    '- canvas resize anchors: center, left, right, top, bottom, top-left, top-right, bottom-left, bottom-right.',
    '- align axes: left, center, right, top, middle, bottom.',
    '- arrange layouts: row, column.',
    '',
    'Examples:',
    'Current step: 把树缩小一点 -> { "action": "resize", "target": { "mode": "semantic", "groupLabel": "树" }, "direction": "smaller", "sourceText": "把树缩小一点" }',
    'Previous command targeted 树. Current step: 把树冠改成黄色 -> { "action": "recolor", "target": { "mode": "semantic", "groupLabel": "树", "partLabel": "树冠" }, "color": "yellow", "sourceText": "把树冠改成黄色" }',
    'Current step: 画一个红色圆形 -> { "action": "create", "shape": "circle", "color": "red", "position": "center", "size": "medium", "sourceText": "画一个红色圆形" }',
    'Previous command created a circle. Current step: 把它移动到右上角 -> { "action": "move", "target": { "mode": "selected" }, "mode": "absolute", "position": "top-right", "sourceText": "把它移动到右上角" }',
    'Current step: 把房子往右边移动一点 -> { "action": "move", "target": { "mode": "semantic", "groupLabel": "房子" }, "mode": "relative", "direction": "right", "distance": 48, "sourceText": "把房子往右边移动一点" }',
    'Previous command targeted 房子. Current step: 屋顶变成黑色 -> { "action": "recolor", "target": { "mode": "semantic", "groupLabel": "房子", "partLabel": "屋顶" }, "color": "black", "sourceText": "屋顶变成黑色" }',
    'Previous commands created and moved a circle. Current step: 再改成蓝色 -> { "action": "recolor", "target": { "mode": "selected" }, "color": "blue", "sourceText": "再改成蓝色" }',
    'Current step: 把所有气球排成一行 -> { "action": "arrange", "target": { "mode": "semantic", "groupLabel": "气球", "scope": "all" }, "layout": "row", "spacing": 32, "sourceText": "把所有气球排成一行" }',
    'Current step: 让三个圆左对齐 -> { "action": "align", "target": { "mode": "shape", "shape": "circle", "scope": "all", "count": 3 }, "axis": "left", "sourceText": "让三个圆左对齐" }',
    '',
    `Original full command: ${input.sourceText}`,
    `All split steps: ${JSON.stringify(steps)}`,
    `Current step index: ${stepIndex + 1} of ${steps.length}`,
    `Current step text: ${stepText}`,
    `Previous step text: ${previousStep ?? ''}`,
    `Previous planned command: ${JSON.stringify(previousCommand ?? null)}`,
    `Planned commands so far: ${JSON.stringify(plannedCommands)}`,
    `Canvas semantic groups: ${JSON.stringify(input.canvas.semanticGroups ?? [])}`,
    `Canvas selectedId: ${input.canvas.selectedId ?? ''}`,
    `Canvas selectedGroupId: ${input.canvas.selectedGroupId ?? ''}`,
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
    '- move spatial: { action, target, mode: "spatial", reference, relation, align?, gap?, sourceText }',
    '- recolor: { action, target, color, sourceText }',
    '- resize: { action, target, direction, sourceText }',
    '- delete: { action, target, sourceText }',
    '- align: { action, target, axis: "left|center|right|top|middle|bottom", sourceText }',
    '- arrange: { action, target, layout: "row|column", spacing?, sourceText }',
    '- resizeCanvas absolute: { action, mode: "absolute", width, height, anchor?, sourceText }',
    '- resizeCanvas relative: { action, mode: "relative", direction, anchor?, amount?, sourceText }',
    '- batch: { action: "batch", sourceText, commands: [create | move | recolor | resize | delete | align | arrange | resizeCanvas] }',
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
    'Targets may include filters: { mode, id?, shape?, color?, position?, groupId?, groupLabel?, partLabel?, scope?, count? }.',
    'Target scope may be "one" or "all". Use scope "all" only when the user explicitly says 所有, 全部, 全都, 这些, 它们, 一起, 统一, 批量, 每个, or requests a counted set such as 三个圆.',
    'Target count is an integer for exact counted sets, for example { mode: "shape", shape: "circle", scope: "all", count: 3 }.',
    'Allowed move spatial relations: left-of, right-of, above, below.',
    'Allowed move spatial alignments: preserve, center, start, end. preserve keeps the current cross-axis coordinate and is the default; center aligns centers on the cross axis; start aligns top/left edges; end aligns bottom/right edges.',
    'Allowed align axes: left, center, right, top, middle, bottom.',
    'Allowed arrange layouts: row, column.',
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
    '- Use action "batch" when one user utterance contains multiple edit intents that should run in order, such as move plus recolor, resize plus recolor, create plus move, or canvas resize plus move.',
    '- A batch command must contain 2 to 6 commands. Each command must be one existing standard command: create, move, recolor, resize, delete, align, arrange, or resizeCanvas.',
    '- Do not put scene, addSceneObject, batch, undo, redo, clear, export, or unknown inside batch.commands.',
    '- Batch commands are for complex editing, not whole-scene generation. Use scene for a new full composition and addSceneObject for adding semantic content to an existing scene.',
    '- Preserve execution order in batch. If the user says first, then, and, comma-separated clauses, or equivalent Chinese connectors such as 然后, 并且, 同时, 再, run the commands in that order.',
    '- For omitted targets in later batch steps, inherit the most specific preceding object only when the wording clearly refers to it. Example: "把房子往右边移动一点，屋顶变成黑色" means the second target is 房子/屋顶, not the whole house or whole canvas.',
    '- If any batch step has an ambiguous target and the user did not provide enough information, return unknown instead of a risky batch.',
    '- If the user edits a scene object and one semanticGroups entry clearly matches their wording, include its groupId in the semantic target. If several entries still match and none is selected, return a semantic target without groupId so the UI can ask for clarification.',
    '- Use move mode "spatial" when the user asks to place, put, or move an existing target relative to another existing reference object. This is an edit operation, not a scene or addSceneObject command.',
    '- Use action "align" when multiple existing targets should share an edge or center line: 左对齐, 右对齐, 顶部对齐, 底部对齐, 水平居中, 垂直居中.',
    '- Use action "arrange" when multiple existing targets should be laid out into a row or column: 排成一行, 横排, 排成一列, 竖排.',
    '- Use target.scope "all" for explicit bulk edits. Examples: "把所有气球变成红色", "把全部树缩小一点", "让这些圆左对齐".',
    '- Do not use bulk target { mode: "any", scope: "all" } unless the user explicitly selected the objects. Prefer shape, semantic groupLabel, color, position, or selected target filters.',
    '- In move spatial, target is the object being moved and reference is the stationary object used for placement. Do not swap them.',
    '- For move spatial, relation describes where the moved target should end up relative to the reference: left-of, right-of, above, below.',
    '- For any semantic object, object-level wording targets the whole semantic group by default. Do not add partLabel unless the user explicitly names a component/part.',
    '- Examples of object-level wording: "这棵树", "这座房子", "这个太阳", "这朵云", "这辆车", "这个机器人", or a bare object name such as "树" or "房子".',
    '- Examples of part-level wording: "树冠", "树干", "房子的屋顶", "房子的门", "太阳的光线". Only these explicit part references should include partLabel.',
    '- For relative moves such as "把这棵树往右边移动一点" or "把房子往右移动一点", target the whole semantic group. Do not target only a visual part such as 树冠, 树干, 墙体, 屋顶, or 门.',
    '- Do not convert object-to-object placement into an absolute canvas position. Phrases such as "地面的上方", "房子右边", "云上方", or "贴着水平线" must use move spatial with a reference target.',
    '- For move spatial alignment, use preserve by default so "放到右边" changes x only and "贴着地面/移动到上方" changes y only. Use center/start/end only when the user explicitly asks to align centers, left/right edges, top/bottom edges, or otherwise requests cross-axis alignment.',
    '- For phrases such as "底部贴着水平线" or "底部贴着地面", use relation "above", align "preserve", gap 0, with the line/ground as reference so the target bottom touches the line top without horizontal movement.',
    '- Use gap 0 when the user says 贴着, 靠着, 挨着, aligned, or touching. Use a small gap such as 16 or 24 for normal beside/above/below placement.',
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
    '- Example: "把房子往右边移动一点，屋顶变成黑色" -> { "action": "batch", "sourceText": original text, "commands": [{ "action": "move", "target": { "mode": "semantic", "groupLabel": "房子" }, "mode": "relative", "direction": "right", "distance": 48, "sourceText": "把房子往右边移动一点" }, { "action": "recolor", "target": { "mode": "semantic", "groupLabel": "房子", "partLabel": "屋顶" }, "color": "black", "sourceText": "屋顶变成黑色" }] }.',
    '- Example: "把树缩小一点，然后把树冠改成黄色" -> { "action": "batch", "sourceText": original text, "commands": [{ "action": "resize", "target": { "mode": "semantic", "groupLabel": "树" }, "direction": "smaller", "sourceText": "把树缩小一点" }, { "action": "recolor", "target": { "mode": "semantic", "groupLabel": "树", "partLabel": "树冠" }, "color": "yellow", "sourceText": "把树冠改成黄色" }] }.',
    '- Example: "画一个红色圆形，然后把它移动到右上角" -> { "action": "batch", "sourceText": original text, "commands": [{ "action": "create", "shape": "circle", "color": "red", "position": "center", "size": "medium", "sourceText": "画一个红色圆形" }, { "action": "move", "target": { "mode": "selected" }, "mode": "absolute", "position": "top-right", "sourceText": "把它移动到右上角" }] }.',
    '- Example: "把树往右移动一点" -> { "action": "move", "target": { "mode": "semantic", "groupLabel": "树" }, "mode": "relative", "direction": "right", "distance": 48, "sourceText": original text }.',
    '- Example: "把这棵树往右边移动一点" -> { "action": "move", "target": { "mode": "semantic", "groupLabel": "树" }, "mode": "relative", "direction": "right", "distance": 48, "sourceText": original text }. Do not add partLabel.',
    '- Example: "把房子往右移动一点" -> { "action": "move", "target": { "mode": "semantic", "groupLabel": "房子" }, "mode": "relative", "direction": "right", "distance": 48, "sourceText": original text }. Do not target only 墙体, 屋顶, or 门.',
    '- Example: "把树放到房子右边" -> { "action": "move", "target": { "mode": "semantic", "groupLabel": "树" }, "mode": "spatial", "reference": { "mode": "semantic", "groupLabel": "房子" }, "relation": "right-of", "align": "preserve", "gap": 24, "sourceText": original text }.',
    '- Example: "把这颗树移动到地面的上方" -> { "action": "move", "target": { "mode": "semantic", "groupLabel": "树" }, "mode": "spatial", "reference": { "mode": "semantic", "groupLabel": "地面" }, "relation": "above", "align": "preserve", "gap": 0, "sourceText": original text }. Do not target only 树冠 and do not move horizontally.',
    '- Example: "把太阳放到云上方" -> { "action": "move", "target": { "mode": "semantic", "groupLabel": "太阳" }, "mode": "spatial", "reference": { "mode": "semantic", "groupLabel": "云" }, "relation": "above", "align": "preserve", "gap": 16, "sourceText": original text }.',
    '- Example: "让树的底部贴着水平线" -> { "action": "move", "target": { "mode": "semantic", "groupLabel": "树" }, "mode": "spatial", "reference": { "mode": "semantic", "groupLabel": "水平线" }, "relation": "above", "align": "preserve", "gap": 0, "sourceText": original text }.',
    '- Example: "把所有气球变成红色" -> { "action": "recolor", "target": { "mode": "semantic", "groupLabel": "气球", "scope": "all" }, "color": "red", "sourceText": original text }.',
    '- Example: "把所有树缩小一点" -> { "action": "resize", "target": { "mode": "semantic", "groupLabel": "树", "scope": "all" }, "direction": "smaller", "sourceText": original text }.',
    '- Example: "把三个圆排成一行" -> { "action": "arrange", "target": { "mode": "shape", "shape": "circle", "scope": "all", "count": 3 }, "layout": "row", "spacing": 32, "sourceText": original text }.',
    '- Example: "让这些图形左对齐" when the user has selected a group -> { "action": "align", "target": { "mode": "selected", "scope": "all" }, "axis": "left", "sourceText": original text }.',
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
      : policy.requiresBatch
        ? 'IMPORTANT: This user command contains multiple executable operations. You MUST return action "batch" with every operation preserved in commands[]. Do not return only one create, move, resize, recolor, delete, or resizeCanvas command.'
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

  async function requestStepwiseBatchCommand(input, policy) {
    const steps = splitBatchSourceText(input.sourceText)

    if (steps.length < 2 || steps.length > 6) {
      return {
        ok: true,
        rawCommand: {
          action: 'unknown',
          reason:
            steps.length < 2
              ? 'batch-step-split-failed'
              : 'batch-step-count-out-of-range',
          sourceText: input.sourceText,
          stepCount: steps.length,
        },
      }
    }

    const commands = []

    for (let index = 0; index < steps.length; index += 1) {
      const stepResult = await requestPlannerCommand([
        {
          role: 'system',
          content:
            'You normalize one step of a multi-step voice drawing command into one strict JSON command. Return JSON only.',
        },
        {
          role: 'user',
          content: buildBatchStepPrompt(input, steps, index, commands),
        },
      ])

      if (!stepResult.ok) {
        return stepResult
      }

      const stepCommand = stepResult.rawCommand

      if (
        !stepCommand ||
        typeof stepCommand !== 'object' ||
        stepCommand.action === 'unknown'
      ) {
        return {
          ok: true,
          rawCommand: {
            action: 'unknown',
            reason: `batch-step-${index + 1}-unsupported`,
            sourceText: input.sourceText,
            step: steps[index],
            rawStepCommand: stepCommand,
          },
        }
      }

      commands.push({
        ...stepCommand,
        sourceText:
          typeof stepCommand.sourceText === 'string'
            ? stepCommand.sourceText
            : steps[index],
      })
    }

    return {
      ok: true,
      rawCommand: {
        action: 'batch',
        sourceText: input.sourceText,
        commands,
        correction: {
          interpretedIntent: `按顺序执行 ${commands.length} 个绘图步骤`,
          confidence: 'high',
        },
      },
    }
  }

  try {
    const policy = getPlannerPolicy(parsedBody.data)
    const baseMessages = [
      {
        role: 'system',
        content:
          'You correct noisy voice commands, distinguish whole-scene creation from incremental content additions, and return strict JSON commands for a drawing application. Return JSON only.',
      },
      {
        role: 'user',
        content: policy.requiresBatch
          ? buildBatchPlannerPrompt(parsedBody.data, policy)
          : buildPlannerPrompt(parsedBody.data),
      },
    ]
    let plannerResult = policy.requiresBatch
      ? await requestStepwiseBatchCommand(parsedBody.data, policy)
      : await requestPlannerCommand(baseMessages)

    if (!plannerResult.ok) {
      response.status(502).json({
        error: plannerResult.error,
        details: plannerResult.details,
      })
      return
    }

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
