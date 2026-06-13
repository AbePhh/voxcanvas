# AI Scene Graph Planner Roadmap

## 1. Goal

This document records the planned implementation path for complex voice command parsing and composite drawing output in VoxCanvas.

The target capability is:

```text
User complex scene command
-> AI outputs editable basic-shape scene graph
-> local validator checks safety and bounds
-> local executor draws the full scene as one undoable operation
```

The important product principle is that AI must not generate a bitmap image and the local code must not grow into a large object template library. AI should decompose a scene into supported primitive shapes, while local code focuses on validation, coordinate adaptation, rendering, history, and later editing.

## 2. Core Approach

Use a new `scene` command instead of hard-coded local templates.

AI returns a structured scene graph:

```json
{
  "action": "scene",
  "title": "house, tree, and sun",
  "sourceText": "画一间房子，旁边有一棵树，右上角有太阳",
  "elements": [
    {
      "id": "house-wall",
      "groupId": "house-1",
      "groupLabel": "房子",
      "partLabel": "墙体",
      "shape": "rect",
      "color": "orange",
      "bbox": { "x": 410, "y": 330, "width": 220, "height": 160 },
      "zIndex": 10
    },
    {
      "id": "house-roof",
      "groupId": "house-1",
      "groupLabel": "房子",
      "partLabel": "屋顶",
      "shape": "triangle",
      "color": "red",
      "bbox": { "x": 370, "y": 230, "width": 300, "height": 130 },
      "zIndex": 11
    }
  ]
}
```

The `bbox` values use normalized scene coordinates, not actual SVG pixels.

Recommended scene space:

```ts
const sceneSpace = {
  width: 1000,
  height: Math.round(1000 * canvas.height / canvas.width),
  origin: 'top-left',
  unit: 'normalized',
}
```

For a `960 x 560` canvas, AI receives a `1000 x 583` scene space. Local code maps normalized bboxes to real SVG coordinates.

## 3. Why Not Local Templates

Local templates such as `house`, `tree`, and `sun` work for demos, but they do not scale. Users may ask for a castle, bridge, birthday cake, classroom, robot, garden, stage, or many other objects. A local template library would keep expanding and add large amounts of narrow code.

The planned architecture avoids that:

```text
AI handles scene decomposition and approximate layout.
Local code handles safety, coordinate mapping, and drawing primitives.
```

This keeps the system general and better aligned with the competition requirement for complex command decomposition.

## 4. What To Send To AI

The planner request should include enough information for AI to choose reasonable primitive shapes and coordinates:

```json
{
  "sourceText": "画一间房子，旁边有一棵树，右上角有太阳",
  "localCommand": { "action": "unknown", "reason": "missing-shape" },
  "sceneSpace": {
    "width": 1000,
    "height": 583,
    "origin": "top-left",
    "unit": "normalized"
  },
  "canvas": {
    "width": 960,
    "height": 560,
    "selectedId": "shape-id",
    "objects": []
  },
  "allowedShapes": ["circle", "rect", "triangle", "line", "text"],
  "allowedColors": ["red", "orange", "yellow", "green", "blue", "purple", "black", "white", "gray"],
  "maxElements": 24
}
```

Prompt constraints:

- Return JSON only.
- Return either one existing standard command or one `scene` command.
- For complex scene requests, prefer `scene`.
- Use only supported primitive shapes.
- Use only supported colors.
- Use normalized bboxes inside `sceneSpace`.
- Use `groupId`, `groupLabel`, and `partLabel` to preserve semantic grouping.
- Use `zIndex` for layering.
- Do not output SVG strings, CSS, images, paths, external assets, or unsupported geometry.
- Do not exceed `maxElements`.
- If the scene is too ambiguous or unsafe, return `unknown`.

## 5. Position And Layout Safety

AI may output bad coordinates. Local code must never trust coordinates blindly.

Validation rules:

- `action` must be `scene`.
- `elements` must be an array.
- element count must be between `1` and `24`.
- `id`, `groupId`, `groupLabel`, and `partLabel` must be short safe strings.
- `shape` must be one of `circle`, `rect`, `triangle`, `line`, `text`.
- `color` must be in the supported color whitelist.
- `bbox.x`, `bbox.y`, `bbox.width`, and `bbox.height` must be finite numbers.
- `bbox.width` and `bbox.height` must be above a minimum size, such as `12` scene units.
- text content must be length-limited.
- `zIndex` must be finite; missing `zIndex` can fall back to array order.
- reject elements that are wildly out of range.

Recommended repair strategy:

```text
If the overall scene is only slightly outside sceneSpace:
  fit all elements into a safe margin while preserving relative layout.
If coordinates are nonsensical, non-finite, or extremely out of range:
  reject the whole scene.
```

This prevents both tiny accidental overflow and catastrophic AI hallucination.

## 6. PR Plan

The feature should be split into three closely connected PRs. Each PR has one clear purpose, but each prepares the next layer.

## PR #16: Scene Graph Protocol, Validation, And Execution

### Purpose

Build the local foundation for scene graph commands without relying on real AI output yet.

### Scope

- Add `action: "scene"` command type.
- Add `SceneCommand`, `SceneElement`, and normalized `SceneBBox` types.
- Extend `ShapeObject` with optional semantic metadata:
  - `groupId`
  - `groupLabel`
  - `partLabel`
  - `zIndex`
- Add scene validation in `commandValidator`.
- Add normalized bbox to canvas-coordinate conversion.
- Add `applySceneCommand`.
- Render scene elements as normal SVG shapes.
- Treat one scene command as one history operation, so `undo` removes the whole generated scene.

### Local Execution Details

Execution flow:

```text
validate scene
-> sort elements by zIndex
-> map normalized bbox to canvas coordinates
-> create ShapeObject for each element
-> append all shapes
-> push one history snapshot
-> clear future
```

For primitive mapping:

- `rect`: use mapped bbox directly.
- `circle`: use bbox as the circle bounding box.
- `triangle`: use bbox as triangle bounds.
- `line`: use bbox from top-left to bottom-right unless later extended.
- `text`: use bbox and text content with a default font size derived from bbox height.

### Tests

- Valid scene creates multiple shapes.
- Scene is one undoable history operation.
- zIndex ordering is stable.
- Invalid shape is rejected.
- Invalid color is rejected.
- Non-finite bbox is rejected.
- Too many elements are rejected.
- Slightly out-of-bounds scene can be fitted or rejected according to chosen policy.

### PR Boundary

Do not modify AI prompt heavily in this PR. It may include validator support for `scene`, but the main goal is local protocol and execution.

## PR #17: AI Scene Graph Planner

### Purpose

Teach the AI planner to output scene graph commands for complex scene requests.

### Scope

- Add `sceneSpace` to `CommandPlannerInput`.
- Send `sceneSpace`, canvas size, object context, allowed shapes, allowed colors, and max element count to the backend.
- Update server prompt with `scene` schema.
- Update planner normalization policy to route complex multi-object scene requests to AI.
- Validate AI `scene` output with local validator.
- If valid, execute through `applySceneCommand`.
- If invalid, show planner invalid feedback and do not execute.

### Complex Scene Detection

The policy should route to AI when the transcript suggests multiple objects or a scene:

- contains scene nouns such as `场景`, `房子`, `树`, `太阳`, `云`, `桥`, `河`, `蛋糕`, `气球`
- contains multiple object separators such as `和`, `旁边`, `还有`, `天上`, `下面`, `附近`
- local parser returns `unknown` for a long natural-language drawing request

Do not overfit this list. It is only a routing hint; AI still returns structured JSON and the validator remains the safety boundary.

### Prompt Requirements

The prompt should emphasize:

- output primitive shapes, not templates
- approximate object composition using multiple primitives
- preserve group semantics with `groupId` and labels
- use normalized scene coordinates
- keep objects inside sceneSpace
- keep the scene visually balanced
- limit element count
- return `unknown` for unsupported or unsafe requests

### Tests

- `createPlannerInput` includes sceneSpace.
- AI scene output with valid elements is accepted.
- AI scene output with unsupported shape/color is rejected.
- over-limit scene is rejected.
- complex scene routing triggers AI planner.

### PR Boundary

Do not add visual plan UI yet. Keep this PR focused on planner output, validation, and execution.

## PR #18: Scene Plan Preview And Group-Aware Feedback

### Purpose

Make scene generation explainable in the UI and prepare for later group editing.

### Scope

- Update `CommandPreview` to summarize `scene`.
- Update `PlannerPreview` to show:
  - scene title
  - element count
  - grouped object labels
  - a compact step list
- Update target description to include group metadata, such as:
  - `房子的屋顶`
  - `树的树冠`
  - `太阳`
- Optionally show group labels in debugging output.

### Example UI Copy

```text
Scene Plan
房子、树和太阳
1. 创建房子墙体
2. 创建房子屋顶
3. 创建房子门
4. 创建树干
5. 创建树冠
6. 创建太阳
```

### Tests

- Scene preview displays title and element count.
- Target descriptions prefer group and part labels when available.
- Existing non-scene planner preview still works.

### PR Boundary

Do not change scene execution semantics here. This PR is for interpretability and demo quality.

## 7. Cross-PR Coupling

These PRs are connected but still separable:

```text
PR #16 creates the local scene command foundation.
PR #17 lets AI produce that command.
PR #18 makes the generated plan understandable and prepares group editing.
```

Important contracts:

- `SceneCommand` schema from PR #16 must be stable before PR #17.
- `sceneSpace` from PR #17 must use the same normalized coordinate assumptions as PR #16.
- group metadata from PR #16/17 powers PR #18 display and future group editing.
- all AI output must continue to go through local validation.

## 8. Edge Cases

### AI Outputs Bad Coordinates

Use finite-number checks, min-size checks, max-overflow checks, and optional fit-to-space.

### AI Outputs Too Many Elements

Reject the scene and show an invalid planner result. Do not partially execute in the first version.

### AI Outputs Unsupported Colors

Reject. Do not auto-map unknown colors until there is a dedicated color-normalization policy.

### AI Outputs Unsupported Shapes

Reject. Prompt should remind AI to approximate objects with allowed primitives.

### Scene Has One Bad Element

First version should reject the whole scene to keep behavior predictable. A later PR can support partial execution with clear skipped-step feedback.

### Elements Overlap

Overlap is allowed because scene composition often needs overlap, such as roofs on walls or clouds made from circles. The validator should reject only unsafe bounds, not normal overlap.

### User Wants Photo-Realistic Art

Return `unknown` or approximate with primitives only if the user clearly asks for a simple drawing. Do not call image generation or insert bitmap assets.

### Existing Canvas Already Has Objects

Scene generation appends to the canvas. It should not clear existing objects unless the user explicitly says so, and clearing should remain outside scene batch execution.

### Undo

One generated scene must be one undo step. This is important for safety and demo clarity.

## 9. Definition Of Done

The whole feature is complete when:

- user can say a complex scene command
- AI returns a primitive shape scene graph
- local validator accepts only safe scene output
- canvas draws multiple grouped shapes
- undo removes the whole scene
- UI shows what was planned
- existing simple commands still work
- `npm run test`, `npm run lint`, and `npm run build` pass

## 10. Demo Script

Recommended demo commands:

```text
画一间房子，旁边有一棵树，右上角有太阳
撤销
画一个生日派对，有蛋糕、气球和桌子
把画布右边加宽一点
导出 PNG
```

The key message for judges:

```text
VoxCanvas does not generate a flat image. It uses AI to produce an editable scene graph made of SVG primitives, then validates and renders it locally.
```
