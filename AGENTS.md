# Opencode Quota Display - Agent Guidelines

Development standards for the `opencode-quota-display` plugin. Follow them exactly.

## 1. Project Overview
**Goal:** Show model quota in Opencode’s status bar center.
**Architecture:** TypeScript plugin.
**State:** Scaffold.

## 2. Environment & Commands

### Prerequisites
- Node.js (latest LTS)
- npm or pnpm

### Core Commands
| Action | Command | Description |
|--------|---------|-------------|
| **Build** | `npm run build` | Build `dist/` from TypeScript. |
| **Dev** | `npm run dev` | Watch mode. |
| **Lint** | `npm run lint` | ESLint + Prettier checks. |
| **Fix** | `npm run lint:fix` | Auto-fix lint/format. |
| **Test** | `npm test` | Run Vitest. |
| **Test File** | `npx vitest <path/to/file>` | Run one test file. |
| **Type Check** | `npm run typecheck` | `tsc --noEmit`. |

*Note: Run `npm install` first.*

## 2.1. OpenCode Tool Discipline
- **Read before edit/write:** Always run the `read` tool before editing or writing a file. Treat the response as canonical—review every line so you know exactly what you will change.
- **Pay attention to formatting:** Tool output includes line numbers and trimmed text; copy/paste only the actual content and preserve whitespace exactly.
- **Re-read when uncertain:** If a change affects multiple sections or an edit fails, re-read the file to ensure you have the latest contents.
- **Prefer `edit` over `write`:** Modify existing files with `edit` whenever possible; only use `write` when creating a new file or fully replacing contents.
- **Verify after changes:** Re-read modified files after `edit`/`write` and confirm the intended changes applied.

## 3. Code Style & Conventions

### General Principles
- **Functional over Class-based:** Prefer pure functions and hooks over class components where possible.
- **Immutability:** Treat data as immutable. Use spread operators or utility libraries rather than mutating state directly.
- **Early Returns:** Use guard clauses to reduce nesting depth.
- **DRY (Don't Repeat Yourself):** Extract common logic into shared utilities (`src/utils/`).

### Naming Conventions
- **Files/Folders:** `kebab-case` (e.g., `quota-service.ts`, `status-bar/`).
- **Variables/Functions:** `camelCase` (e.g., `fetchQuotaUsage`, `remainingTokens`).
- **Types/Interfaces:** `PascalCase` (e.g., `QuotaResponse`, `IStatusConfig`).
- **Constants:** `UPPER_SNAKE_CASE` for global constants (e.g., `MAX_RETRY_ATTEMPTS`).

### TypeScript Rules
- **Strict Mode:** `strict: true` is enabled in `tsconfig.json`. No `any`. Use `unknown` if necessary and narrow types.
- **Explicit Returns:** Define return types for all exported functions.
- **Interfaces vs Types:** Use `interface` for public APIs and object shapes; use `type` for unions/intersections.

### Imports
- **Order:**
  1. External dependencies (e.g., `react`, `axios`).
  2. Internal absolute aliases (if configured) or relative paths.
  3. Styles / Assets.
- **Pathing:** Use relative imports for nearby files (`./helper`) and absolute/aliased imports for root modules if configured (e.g., `@/components/`).

## 4. Error Handling
- **Typed Errors:** Create custom error classes for expected failures (e.g., `QuotaAPIError`).
- **Boundaries:** All async operations (API calls) must be wrapped in `try/catch` blocks.
- **User Feedback:** Fail gracefully. If quota data fails to load, display a subtle "Unavailable" state in the status bar rather than crashing the TUI.

## 5. Testing Guidelines
- **Framework:** Vitest (compatible with Jest API).
- **Unit Tests:** Write tests for all utility functions and logic-heavy components.
- **Co-location:** Test files should be named `*.test.ts` and placed next to the source file (e.g., `src/api.ts` -> `src/api.test.ts`).
- **Coverage:** Aim for high test coverage on data parsing and quota calculation logic.

## 6. Git & Commits
- **Conventional Commits:** follows the format `<type>(<scope>): <description>`.
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
  - Example: `feat(ui): add progress bar to status widget`
- **Atomic Commits:** Keep commits focused on a single logical change.

## 7. Documentation
- **JSDoc:** Add JSDoc comments for all exported interfaces and complex functions.
- **Inline Comments:** Explain *why* complex logic exists, not *what* the code is doing.

## 8. OpenCode Read/Write Tool Usage
- **Read Before Edit/Write:** Always call the Read tool on a file before any Edit or Write.
- **Carefully Inspect Reads:** Verify the Read output and use exact text (including whitespace) in edits.
- **Document the Details:** In case of multi-line reads, note the line numbers mentally so you can reference them in edits—it prevents mismatches.
- **No Assumptions:** Do not assume file contents; re-read if any doubt exists.
- **Confirm Success:** Re-read the file after edits to confirm changes applied as intended.
- **Respect the Tools:** OpenCode's Read and Write tools represent the single source of truth during editing; always base modification decisions on their outputs and avoid guessing their behavior, especially when tool errors indicate the file changed since the last read.

---
*Verified by Opencode on 2026-01-06*






