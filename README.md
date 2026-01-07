# Opencode Quota Display Plugin

Display your Antigravity (Windsurf/Codeium) quota directly in Opencode.

![Example](./docs/example.png)

## Features

- **Real-time Quota Tracking**: Shows remaining usage for Flash, Pro, and Claude/GPT-4 models.
- **Multiple Sources**: Fetches quota from local VSCode language server (if running) or Cloud Code API.
- **Auto-Discovery**: Automatically finds and connects to the local Windsurf language server.
- **Visual Alerts**: Highlights critically low quotas (below 10%) with a red indicator 🔴.
- **Background Monitoring**: Efficient background polling (default 30s) prevents rate-limiting.
- **Low Quota Notifications**: Sends toast alerts when quota drops below configurable thresholds (20%, 10%, 5%).
- **Non-Intrusive**: Appends a clean footer to assistant messages without blocking generation.

## Installation

```bash
opencode plugin add opencode-ag-quota
```

## Configuration

The plugin is zero-config by default, but you can customize it via `.opencode/ag-quota.json` (project) or `~/.config/opencode/ag-quota.json` (global).

### Example Configuration

```json
{
  "quotaSource": "auto",
  "format": "{category}: {percent}%",
  "alertThresholds": [0.2, 0.1, 0.05],
  "pollingInterval": 30000,
  "quotaMarker": "> AG Quota:",
  "alwaysAppend": true
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `quotaSource` | `"auto" \| "cloud" \| "local"` | `"auto"` | Where to fetch data. "auto" tries cloud first, falls back to local. |
| `format` | `string` | `"{category}: {percent}% ({resetIn})"` | Format string for the display. Supports placeholders like `{category}`, `{percent}`, `{resetIn}`. |
| `alertThresholds` | `number[]` | `[0.2, 0.1, 0.05]` | Percentages (0.0-1.0) to trigger warning toasts. |
| `pollingInterval` | `number` | `30000` | How often to fetch quota in ms. |
| `displayMode` | `"all" \| "current"` | `"all"` | Show all categories or only the current model's quota. |
| `alwaysAppend` | `boolean` | `true` | Append quota footer even if data is unavailable (shows "unknown" or "error"). |

## CLI Tool

This package also includes a standalone CLI tool `ag-quota` for checking usage from the terminal.

```bash
# Install globally or run via bun/npx
bun x ag-quota

# Output JSON for scripts
bun x ag-quota --json
```

## Acknowledgments

This project builds upon the excellent work of:

- **[opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth)** by [@NoeFabris](https://github.com/NoeFabris) - OAuth authentication and Cloud Code API integration for Opencode
- **[vscode-antigravity-cockpit](https://github.com/jlcodes99/vscode-antigravity-cockpit)** by [@jlcodes99](https://github.com/jlcodes99) - VSCode extension that inspired the cloud quota fetching approach
- **ag-usage** - Discovery logic for local language server

The cloud quota fetching implementation uses the same OAuth credentials and API endpoints as documented in these projects.

## License

MIT
