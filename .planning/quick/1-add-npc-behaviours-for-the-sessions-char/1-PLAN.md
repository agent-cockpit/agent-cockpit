---
quick_task: 1
plan: "1"
type: execute
mode: quick
depends_on: []
files_modified:
  - packages/ui/src/game/NpcBehavior.ts
  - packages/ui/src/game/__tests__/NpcBehavior.test.ts
  - packages/ui/src/pages/OfficePage.tsx
  - packages/ui/src/pages/__tests__/OfficePage.test.tsx
autonomous: true
---

<objective>
Add live NPC behaviors for session characters in Office Mode: NPCs should move around the map while active, return toward the map center when they need user attention, and pause movement for the interacted NPC while its interaction popup is open.
</objective>

<context>
@.planning/STATE.md
@packages/ui/src/pages/OfficePage.tsx
@packages/ui/src/game/GameState.ts
@packages/ui/src/store/index.ts
@packages/ui/src/store/sessionsSlice.ts
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Implement deterministic NPC behavior engine (wander, attention-center, paused)</name>
  <files>packages/ui/src/game/NpcBehavior.ts, packages/ui/src/game/__tests__/NpcBehavior.test.ts</files>
  <action>Create a pure NPC behavior module that advances NPC positions per frame from session snapshot + current positions. Define behavior modes: `wander` (default roaming with deterministic waypoints), `attention` (move toward map center when `pendingApprovals > 0` or other attention-needed signals like `status === 'error'`), and `paused` (no movement while interacting). Use center anchoring with small spread offsets to avoid overlap when multiple NPCs need attention.</action>
  <verify><automated>pnpm --filter @cockpit/ui test --run NpcBehavior</automated></verify>
  <done>NPC movement logic is centralized, deterministic, and validated with unit tests for roam movement, center-return behavior, overlap spread, and paused freeze behavior.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire NPC behavior updates into OfficePage runtime and interaction lifecycle</name>
  <files>packages/ui/src/pages/OfficePage.tsx</files>
  <action>Integrate the new behavior step into the game loop so NPCs move each frame. Derive paused NPCs from popup interaction state (`sessionDetailOpen` + `selectedSessionId`) so an NPC stops while the user is interacting and resumes after close. Keep movement bounded to world/collision constraints and retain existing rendering + audio hooks.</action>
  <verify><automated>pnpm --filter @cockpit/ui test --run OfficePage</automated></verify>
  <done>NPCs visibly roam, attention-needed NPCs converge back toward center, and the currently interacted NPC remains stopped until interaction closes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add regression tests for attention routing and interaction pause behavior</name>
  <files>packages/ui/src/game/__tests__/NpcBehavior.test.ts, packages/ui/src/pages/__tests__/OfficePage.test.tsx</files>
  <action>Add focused tests that prove: (1) active NPCs move over time, (2) pending-approval/attention NPCs head to center, (3) interacted NPC movement is paused while popup is open and resumes after close. Keep tests deterministic by controlling time steps and avoiding randomness in assertions.</action>
  <verify><automated>pnpm --filter @cockpit/ui test --run NpcBehavior && pnpm --filter @cockpit/ui test --run OfficePage</automated></verify>
  <done>Automated coverage prevents regressions in NPC movement, center-attention routing, and interaction-based pause/resume behavior.</done>
</task>
</tasks>

<verification>
pnpm --filter @cockpit/ui test --run NpcBehavior && pnpm --filter @cockpit/ui test --run OfficePage && pnpm --filter @cockpit/ui typecheck
</verification>

<success_criteria>
1. Session NPCs are no longer static and continuously move using deterministic roaming behavior.
2. NPCs with pending approvals or other user-attention states move back toward the center area of the map.
3. Interacting with an NPC pauses only that NPC until the interaction popup is closed.
4. Behavior is covered by automated tests and passes UI package typecheck.
</success_criteria>

<output>
After completion, create `.planning/quick/1-add-npc-behaviours-for-the-sessions-char/1-SUMMARY.md`.
</output>
