# opencode-ag-quota

Opencode plugin that shows your **Antigravity quota** inside the Opencode TUI.

## TL;DR

- Installs as an Opencode plugin (`"opencode-ag-quota"`).
- **Antigravity-only for now** (quota is shown only when the model ID contains `antigravity`).
- Cloud mode uses `opencode auth login` credentials (auth/API approach based on [`opencode-antigravity-auth`](https://github.com/NoeFabris/opencode-antigravity-auth)).

## Installation

Add the plugin to your Opencode config (`opencode.json`):

```json
{
  "plugin": ["opencode-ag-quota"]
}
```

## Configuration

Zero-config by default. Customize via:

- Project: `.opencode/ag-quota.json`
- Global: `~/.config/opencode/ag-quota.json`

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
| `quotaSource` | `"auto" \| "cloud" \| "local"` | `"auto"` | `auto` tries cloud first, falls back to local. |
| `format` | `string` | `"{category}: {percent}% ({resetIn})"` | Placeholders: `{category}`, `{percent}`, `{resetIn}`, `{resetAt}`, `{model}`. |
| `separator` | `string` | `" | "` | Separator when `displayMode` is `all`. |
| `displayMode` | `"all" \| "current"` | `"all"` | Show all quotas or only the current model's quota. |
| `alwaysAppend` | `boolean` | `true` | Show an "Unavailable" hint when quota can't be read. |

## Disclaimer

This is an independent, third-party plugin for Opencode. It is not affiliated with, endorsed by, or maintained by the Opencode developers.

## License

MIT
