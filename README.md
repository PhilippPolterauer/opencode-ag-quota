# opencode-ag-quota

Opencode plugin that shows your **Antigravity quota** inside the Opencode TUI.

## TL;DR

- Installs as an Opencode plugin (`"opencode-ag-quota"`).
- **Antigravity-only for now** (quota is shown only when the model ID contains `antigravity`).
- Cloud mode uses `opencode auth login` credentials (auth/API approach based on [`opencode-antigravity-auth`](https://github.com/NoeFabris/opencode-antigravity-auth)).

![Example](./docs/example.png)

## What It Does

- Polls quota in the background (default `30s`).
- Appends a compact footer to assistant messages using `quotaMarker` (default `> AG Quota:`).
- Shows toasts when connecting/disconnecting and when quota drops below thresholds.

## Limitations

- Works only when the last-used `modelID` contains `antigravity`.

## Installation

Add the plugin to your Opencode config.

`./.opencode/opencode.json` (project) or `~/.config/opencode/opencode.json` (global).

```json
{
    "plugin": ["opencode-antigravity-auth", "opencode-ag-quota"]
}
```

## Configuration

Zero-config by default. Customize via:

- Project: `.opencode/ag-quota.json`
- Global: `~/.config/opencode/ag-quota.json`

### Example

```json
{
    "quotaSource": "auto",
    "displayMode": "all",
    "format": "{category}: {percent}% ({resetIn})",
    "separator": " | ",
    "pollingInterval": 30000,
    "alertThresholds": [0.5, 0.1, 0.05],
    "indicators": [
        { "threshold": 0.2, "symbol": "⚠️" },
        { "threshold": 0.05, "symbol": "🛑" }
    ],
    "quotaMarker": "> AG Quota:",
    "alwaysAppend": true
}
```

### Options

| Option            | Type                                      | Default                                                             | Description                                                                   | 
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `quotaSource`     | `"auto" \| "cloud" \| "local"`            | `"auto"`                                                            | `auto` tries cloud first, falls back to local.                                |
| `displayMode`     | `"all" \| "current"`                      | `"all"`                                                             | Show all categories or only the current model's quota.                        |
| `format`          | `string`                                  | `"{category}: {percent}% ({resetIn})"`                              | Placeholders: `{category}`, `{percent}`, `{resetIn}`, `{resetAt}`, `{model}`. |
| `separator`       | `string`                                  | `\|` | Separator when `displayMode="all"`.                         |
| `pollingInterval` | `number`                                  | `30000`                                                             | Poll interval in ms.                                                          |
| `alertThresholds` | `number[]`                                | `[0.5, 0.1, 0.05]`                                                  | Remaining fraction thresholds that trigger warning toasts.                    |
| `indicators`      | `{ threshold: number; symbol: string }[]` | `[{threshold: 0.2, symbol: "⚠️"}, {threshold: 0.05, symbol: "🛑"}]` | Symbols appended when below threshold.                                       |
| `quotaMarker`     | `string`                                  | `"> AG Quota:"`                                                     | Prefix for the quota footer.                                                  |
| `alwaysAppend`    | `boolean`                                 | `true`                                                              | Show an "Unavailable" hint when quota can't be read.                          |

## Disclaimer

This is an independent, third-party plugin for Opencode. It is not affiliated with, endorsed by, or maintained by the Opencode developers.

## CLI / Library (ag-quota)

This repo also contains `ag-quota` (TS library + CLI). See [`packages/ag-quota/README.md`](./packages/ag-quota/README.md).

## License

MIT
