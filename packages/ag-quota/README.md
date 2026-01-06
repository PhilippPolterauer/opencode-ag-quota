# ag-quota

Antigravity quota fetching library and CLI for checking your Windsurf/Codeium quota usage.

## Installation

```bash
npm install -g ag-quota
```

## CLI Usage

```bash
# Display quotas in terminal
ag-quota

# Output as JSON
ag-quota --json
```

### Example Output

```
Antigravity Quotas (Retrieved at: 10:34:53 PM):
------------------------------------------------------------
Claude/GPT/OSS      :  14.7% remaining (Resets in: 3h 58m)
Gemini Flash        :  81.8% remaining (Resets in: 3h 34m)
Gemini Pro          :  45.3% remaining (Resets in: 55m)
```

### JSON Output

```bash
ag-quota --json
```

```json
{
  "timestamp": 1767735298099,
  "categories": [
    {
      "name": "Claude/GPT/OSS",
      "remainingFraction": 0.14666666,
      "remainingPercentage": 14.7,
      "resetTime": "2026-01-07T01:33:34Z",
      "resetsIn": "3h 58m"
    },
    {
      "name": "Gemini Pro",
      "remainingFraction": 0.453125,
      "remainingPercentage": 45.3,
      "resetTime": "2026-01-06T22:30:14Z",
      "resetsIn": "55m"
    },
    {
      "name": "Gemini Flash",
      "remainingFraction": 0.8175,
      "remainingPercentage": 81.8,
      "resetTime": "2026-01-07T01:09:14Z",
      "resetsIn": "3h 34m"
    }
  ]
}
```

## Library Usage

```typescript
import { fetchAntigravityStatus, formatRelativeTime, formatAbsoluteTime } from 'ag-quota';

const shellRunner = async (cmd: string) => {
  const { execSync } = await import('node:child_process');
  return execSync(cmd).toString();
};

const { userStatus, timestamp } = await fetchAntigravityStatus(shellRunner);

const configs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];
for (const model of configs) {
  const quota = model.quotaInfo?.remainingFraction ?? 0;
  const resetTime = model.quotaInfo?.resetTime;
  const relativeTime = resetTime ? formatRelativeTime(new Date(resetTime)) : null;
  const absoluteTime = resetTime ? formatAbsoluteTime(new Date(resetTime)) : null;
  console.log(`${model.label}: ${(quota * 100).toFixed(1)}% (resets in ${relativeTime} at ${absoluteTime})`);
}
```

## Configuration

Create a config file at `.opencode/ag-quota.json` or `~/.config/opencode/ag-quota.json`:

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
| `format` | string | `"{category}: {percent}% ({resetIn})"` | Format string with placeholders |
| `separator` | string | `" \| "` | Separator between categories |
| `displayMode` | `"all"` \| `"current"` | `"all"` | Show all quotas or only current model |
| `alwaysAppend` | boolean | `true` | Always show quota info even when unavailable |

### Format Placeholders

- `{category}` - Category name (Flash, Pro, Claude/GPT)
- `{percent}` - Quota percentage (e.g., "85.5")
- `{resetIn}` - Relative time until reset (e.g., "2h 30m")
- `{resetAt}` - Absolute reset time (e.g., "10:30 PM")
- `{model}` - Current model ID

## Requirements

- Node.js >= 18
- Windsurf/Codeium Language Server running (for quota data)

## License

ISC
