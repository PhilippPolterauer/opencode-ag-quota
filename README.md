# Opencode Antigravity Quota

An Opencode TUI plugin and CLI tool to display remaining Antigravity model quotas.

![Quota Display Example](docs/example.png)

## Features

- **Cloud API Support**: Fetches quota directly from Google Cloud Code API (recommended).
- **Local Server Support**: Falls back to local language server if cloud unavailable.
- **TUI Integration**: Displays remaining quota information inside the Opencode TUI.
- **CLI Tool**: Quick terminal check for all model categories (Flash, Pro, Claude/GPT).
- **JSON Output**: Machine-readable quota data for scripting.

## Prerequisites

### Cloud Mode (Recommended)

Uses the [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) plugin for authentication:

```bash
# 1. Add the auth plugin to your opencode.json
# 2. Run:
opencode auth login
```

This is the **recommended** approach as it:
- Works without running Windsurf/Antigravity IDE
- More reliable than local server discovery
- Supports multi-account rotation

### Local Mode (Fallback)

If cloud credentials are unavailable, the plugin falls back to local server mode which requires:

1. Run an IDE with Antigravity open and authenticated.

> If Opencode is running in WSL, the Antigravity server must also be running inside WSL.

## Installation (Opencode)

Add the plugin to your Opencode config (`opencode.json`):

```json
{
  "plugin": ["opencode-ag-quota"]
}
```

For cloud quota support, also add the auth plugin:

```json
{
  "plugin": [
    "opencode-antigravity-auth@1.2.7",
    "opencode-ag-quota"
  ]
}
```

## Configuration

Create `.opencode/ag-quota.json` (project-local) or `~/.config/opencode/ag-quota.json` (global).

```json
{
  "quotaSource": "auto",
  "format": "{category}: {percent}% ({resetIn})",
  "separator": " | ",
  "displayMode": "all",
  "alwaysAppend": true
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `quotaSource` | `"cloud"` \| `"local"` \| `"auto"` | `"auto"` | Where to fetch quota data from |
| `format` | string | `"{category}: {percent}% ({resetIn})"` | Format string applied per category |
| `separator` | string | `" \| "` | Separator between categories when `displayMode` is `all` |
| `displayMode` | `"all"` \| `"current"` | `"all"` | Show all quotas, or only the current model's quota |
| `alwaysAppend` | boolean | `true` | Append an "Unavailable" line when quota can't be read |

### Quota Sources

- `cloud` - Fetch from Google Cloud Code API (requires `opencode auth login`)
- `local` - Fetch from local Windsurf/Antigravity language server process
- `auto` - Try cloud first, fallback to local (default, recommended)

### Format Placeholders

- `{category}` - Category name (Flash, Pro, Claude/GPT)
- `{percent}` - Quota percentage (e.g., "85.5")
- `{resetIn}` - Relative time until reset (e.g., "2h 30m")
- `{resetAt}` - Absolute reset time (e.g., "10:30 PM")
- `{model}` - Current model ID

## CLI Usage

The library package also provides a CLI:

```bash
npx ag-quota
```

```
Antigravity Quotas (Source: Cloud API, 10:34:53 PM):
------------------------------------------------------------
Claude/GPT          :  83.3% remaining (Resets in: 3h 58m)
Flash               : 100.0% remaining (Resets in: 3h 34m)
Pro                 :  95.0% remaining (Resets in: 55m)
```

### CLI Options

```bash
ag-quota --help
```

```
Usage: ag-quota [options]

Options:
  --source=<cloud|local|auto>  Quota source (default: auto)
  -s=<cloud|local|auto>        Alias for --source
  --json                       Output result as JSON
  -h, --help                   Show this help message
```

### Examples

```bash
ag-quota                     # Auto-detect source
ag-quota --source=cloud      # Force cloud source
ag-quota --source=local      # Force local source
ag-quota --json              # Output as JSON
```

### JSON Output

```bash
ag-quota --json
```

```json
{
  "source": "cloud",
  "timestamp": 1767735298099,
  "categories": [
    {
      "name": "Claude/GPT",
      "remainingFraction": 0.833,
      "remainingPercentage": 83.3,
      "resetTime": "2026-01-07T13:20:23.000Z",
      "resetsIn": "3h 58m"
    },
    {
      "name": "Flash",
      "remainingFraction": 1.0,
      "remainingPercentage": 100.0,
      "resetTime": "2026-01-07T13:32:12.000Z",
      "resetsIn": "4h 10m"
    },
    {
      "name": "Pro",
      "remainingFraction": 0.95,
      "remainingPercentage": 95.0,
      "resetTime": "2026-01-07T13:13:23.000Z",
      "resetsIn": "3h 51m"
    }
  ]
}
```

## Acknowledgments

This project builds upon the excellent work of:

- **[opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth)** by [@NoeFabris](https://github.com/NoeFabris) - OAuth authentication and Cloud Code API integration for Opencode
- **[vscode-antigravity-cockpit](https://github.com/jlcodes99/vscode-antigravity-cockpit)** by [@jlcodes99](https://github.com/jlcodes99) - VSCode extension that inspired the cloud quota fetching approach
- **ag-usage** - Discovery logic for local language server

The cloud quota fetching implementation uses the same OAuth credentials and API endpoints as documented in these projects.

## License

MIT

## Development

### Setup

Install dependencies:

```bash
bun install
```

### Commands

| Command | Description |
|---------|-------------|
| `bun run build` | Compiles TypeScript to JavaScript (`dist/`). |
| `bun run test` | Runs all tests using Vitest. |
| `bun run typecheck` | Runs `tsc --noEmit` to verify types. |

### Project Structure

```
packages/
├── ag-quota/              # Core library and CLI
│   ├── src/
│   │   ├── index.ts       # Main exports, unified quota fetching
│   │   ├── cloud.ts       # Cloud Code API client
│   │   ├── config.ts      # Configuration handling
│   │   └── cli.ts         # CLI tool
│   └── package.json
└── opencode-ag-quota/     # Opencode TUI plugin
    ├── src/
    │   └── plugin.ts      # Plugin implementation
    └── package.json
```
