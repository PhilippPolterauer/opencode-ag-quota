# Opencode Quota - Agent Guidelines

This repository contains the `ag-quota` library/CLI and the `opencode-ag-quota` plugin.
Follow these guidelines strictly to ensure code quality and consistency.

## 1. Environment & Commands

### Structure
- **Root**: Workspace root.
- **packages/ag-quota**: Core logic and CLI tool.
- **packages/opencode-ag-quota**: Opencode plugin.

### Core Commands (Run from Root)
**IMPORTANT**: This project primarily uses `bun`. Please use `bun` for all package management and script execution.

| Action | Command | Description |
|--------|---------|-------------|
| **Install** | `bun install` | Install dependencies. |
| **Build** | `bun run build` | Build all packages (`ag-quota` and `opencode-ag-quota`). |
| **Type Check** | `bun run typecheck` | Run TypeScript compiler (`tsc --noEmit`) across packages. |
| **Test (All)** | `bun test` | Run all tests using Vitest (via bun). |
| **Test (Unit)** | `bun run test:unit` | Run only unit tests. |
| **Test (Integration)** | `bun run test:integration` | Run integration tests. |
| **Single Test File** | `bun test <path/to/file>` | Run a specific test file. |
| **Run CLI** | `bun run ag-quota` | Run the `ag-quota` CLI from source. |
| **Mock Server** | `bun run mock-server` | Run the mock Antigravity server for testing. |

## 2. Code Style & Conventions

### General
- **Language**: TypeScript (Strict Mode).
- **Runtime**: Bun / Node.js >= 18.
- **Formatting**: Adhere to existing formatting (4-space indentation seems prevalent in some files, but check `.editorconfig` or existing files). *Actually, `package.json` had 4 spaces, but `tsconfig.json` had 2. `src/index.ts` had 4. Follow the file you are editing.*
- **Semicolons**: Always use semicolons.

### Naming
- **Files**: `kebab-case.ts` (e.g., `quota-service.ts`).
- **Classes/Interfaces**: `PascalCase` (e.g., `UserStatusResponse`).
- **Variables/Functions**: `camelCase`.
- **Constants**: `UPPER_SNAKE_CASE`.

### TypeScript
- **No `any`**: Use `unknown` and narrow types.
- **Interfaces**: Use `interface` for object shapes/APIs.
- **Types**: Use `type` for unions/intersections.
- **Async**: Always use `async/await` over raw promises, except in low-level wrappers.
- **Imports**:
    - Use `node:` prefix for built-in modules (e.g., `import * as http from "node:http";`).
    - Group imports: External -> Internal -> Types.

### Error Handling
- Use `try/catch` for all external operations (API calls, file I/O, shell execution).
- Throw descriptive `Error` objects.
- In the plugin, fail gracefully (e.g., show "Unavailable" instead of crashing).

## 3. Testing Guidelines

- **Framework**: Vitest (via Bun).
- **Unit Tests**: Located in `test/unit/` or co-located (check `test/` directory structure).
- **Integration Tests**: Located in `test/integration/`.
- **Running Tests**:
    - Always run relevant tests after changes.
    - Use `bun test <file>` to run tests related to your changes.
- **Mocking**: Use Vitest's mocking capabilities or the provided `mock-server` for integration testing.

## 4. Agentic Workflow Rules

### Tool Discipline
1.  **Read First**: Always use `read` to inspect a file before editing. Never guess content.
2.  **Verify**: After `edit` or `write`, read the file again to confirm changes.
3.  **Atomic Edits**: Keep changes focused. If replacing a large chunk, ensure context matches exactly.
4.  **No Hallucinations**: Do not invent commands or dependencies. Check `package.json` first.

### File Operations
- **Paths**: Use absolute paths for all tool calls.
- **Creation**: Use `write` only for new files. Use `edit` for modifications.
- **Safety**: Do not delete files unless explicitly instructed.

## 5. Git Strategy
- **Commits**: Use Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`).
- **Scope**: Optional but helpful (e.g., `feat(cli): add json output`).
- **Message**: Concise description of *why* the change was made.

---
*Generated for Opencode Agents - 2026-01-08*
