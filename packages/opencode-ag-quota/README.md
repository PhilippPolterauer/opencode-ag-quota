# opencode-ag-quota

Opencode plugin to display Antigravity/Windsurf quota usage in the Opencode TUI.

## Installation

Add the plugin to your Opencode config (`opencode.json`):

```json
{
  "plugin": ["opencode-ag-quota"]
}
```

## Quota Display Configuration

Create `.opencode/ag-quota.json` (project-local) or `~/.config/opencode/ag-quota.json` (global).

```json
{
  "format": "{category}: {percent}% ({resetIn})",
  "separator": " | ",
  "displayMode": "all",
  "alwaysAppend": true
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `format` | string | `"{category}: {percent}% ({resetIn})"` | Format string applied per category |
| `separator` | string | `" \| "` | Separator between categories when `displayMode` is `all` |
| `displayMode` | `"all"` \| `"current"` | `"all"` | Show all quotas, or only the current model’s quota |
| `alwaysAppend` | boolean | `true` | Append an "Unavailable" line when quota can’t be read |

### Format Placeholders

- `{category}` - Category name (Flash, Pro, Claude/GPT)
- `{percent}` - Quota percentage (e.g., "85.5")
- `{resetIn}` - Relative time until reset (e.g., "2h 30m")
- `{resetAt}` - Absolute reset time (e.g., "10:30 PM")
- `{model}` - Current model ID

### Example Formats

- Minimal: `"{category}: {percent}%"`
- With relative time: `"{category}: {percent}% ({resetIn})"`
- With absolute time: `"{category}: {percent}% (resets at {resetAt})"`
- Both: `"{category}: {percent}% ({resetIn} / {resetAt})"`

## Requirements

- Opencode
- Windsurf/Codeium Language Server running and authenticated (this plugin reads from the local server)

## License

MIT
