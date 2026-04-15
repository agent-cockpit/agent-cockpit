---
phase: 14-office-map-view-full-navigation-paradigm-shift
plan: 05
subsystem: ui
tags: [office-map, camera-focus, user-character, human-verification]

# Dependency graph
requires:
  - 14-01 (Radix dependencies and test stubs)
  - 14-02 (Panel useParams → Zustand fallback)
  - 14-03 (InstancePopupHub and MapSidebar built)
  - 14-04 (Router switch to OfficePage as default)
provides:
  - User character rendered on office map canvas
  - Camera focus mechanism enabling MapSidebar to scroll canvas to agent sprites
  - Complete navigation paradigm shift end-to-end working
affects:
  - Full app UX (office map as landing view)
  - MapSidebar functionality (camera focus makes sidebar useful)
  - Phase 14 completion (final functional gap closed)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Module-level scroll singleton pattern for cross-component communication
    - Ref-based scrollIntoView for canvas camera movement
    - Static user character positioning at fixed grid coordinate

key-files:
  modified:
    - packages/ui/src/pages/OfficePage.tsx
    - packages/ui/src/components/layout/OpsLayout.tsx

key-decisions:
  - "Module-level scroll singleton (scrollToSession) is simpler than React context for OpsLayout→OfficePage callback"
  - "User character rendered as static div with purple circle + 'YOU' label at fixed position (col=2, row=5)"
  - "Sprite ref wrapper pattern enables scrollIntoView without breaking dnd-kit draggable"

patterns-established:
  - "Pattern: Module-level singleton for parent-to-child callback without prop drilling"
  - "Pattern: Ref wrapper for scroll target registration without breaking event handlers"

requirements-completed: [user-character, sidebar-focus, routing-default]

# Metrics
duration: 2min
completed: 2026-04-10
---

# Phase 14: Plan 05 Summary

**User character added to office map, camera focus wired from MapSidebar to agent sprites, complete navigation paradigm shift verified by human**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-10T16:47:13Z
- **Completed:** 2026-04-10T16:49:13Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added module-level `scrollToSession` singleton in OfficePage for MapSidebar to invoke
- Added `spriteRefs` useRef to track DOM elements for scrollIntoView targeting
- Wrapped each AgentSprite in ref div to enable scroll target registration without breaking dnd-kit
- Added static user character (purple circle + 'YOU' label) at fixed position on map
- Wired OpsLayout to pass real scrollToSession callback to MapSidebar
- Completed Phase 14 navigation paradigm shift with human verification checkpoint

## Task Commits

Each task was committed atomically:

1. **Task 1: Add user character to map + wire sidebar camera focus** - `99d1373` (feat)
2. **Task 2: Human verification checkpoint for complete navigation paradigm shift** - APPROVED (no commit)

## Verification Results

**Human verification passed all 8 checks:**

1. Default view is Office map ✓
2. User character (purple circle + "YOU" label) visible ✓
3. Agent characters render correctly on map ✓
4. Sprite click opens InstancePopupHub with 5 tabs ✓
5. Approvals tab regression check passed ✓
6. History popup opens from top bar ✓
7. Sidebar camera focus scrolls canvas to agent ✓
8. Zero console errors during testing ✓

User confirmed: "approved" - all manual testing checks passed successfully.

## Deviations from Plan

None - plan executed exactly as written.

## Technical Implementation

**OfficePage changes:**

- Module-level scroll singleton pattern:
  ```typescript
  let _scrollToSession: ((id: string) => void) | null = null
  export function scrollToSession(id: string) { _scrollToSession?.(id) }
  ```

- Sprite refs registered in useEffect:
  ```typescript
  useEffect(() => {
    _scrollToSession = (id: string) => {
      spriteRefs.current[id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      })
    }
    return () => { _scrollToSession = null }
  }, [])
  ```

- AgentSprite wrapper div with ref:
  ```tsx
  <div
    key={session.sessionId}
    ref={(el) => { spriteRefs.current[session.sessionId] = el }}
    style={{ position: 'absolute', left: pos.x, top: pos.y }}
  >
    <AgentSprite ... />
  </div>
  ```

- User character at fixed position (col=2, row=5):
  ```tsx
  <div style={{ position: 'absolute', left: 2 * 96, top: 5 * 96, ... }}>
    <div>👤</div>
    <span>YOU</span>
  </div>
  ```

**OpsLayout changes:**

- Imported scrollToSession from OfficePage
- Passed real callback to MapSidebar: `<MapSidebar onFocusSession={scrollToSession} />`

## Phase 14 Completion Status

Phase 14 is now COMPLETE. All 5 plans executed:

1. 14-01: Install Radix dependencies + test stubs
2. 14-02: Panel useParams → Zustand fallback
3. 14-03: Build InstancePopupHub and MapSidebar
4. 14-04: Router switch + sprite-click → popup
5. 14-05: User character + camera focus + verification

**Complete navigation paradigm shift achieved:**
- Office map IS the app (default landing view at `/`)
- Agent characters clickable → popup hub with all session details
- Sidebar minimal (name+status only) with camera focus
- History becomes global popup modal
- Approvals fully functional in popup hub
- Zero regressions from previous functionality

## Key Insights

- Module-level singleton pattern is simpler than React context for this parent-to-child callback use case
- Ref wrapper pattern enables scroll targeting without breaking dnd-kit draggable behavior
- User character at fixed position provides spatial context for the office map metaphor
- Camera focus makes the sidebar genuinely useful for navigating large agent collections

## Self-Check: PASSED

- [x] packages/ui/src/pages/OfficePage.tsx exists
- [x] packages/ui/src/components/layout/OpsLayout.tsx exists
- [x] 14-05-SUMMARY.md exists
- [x] Commit 99d1373 exists
