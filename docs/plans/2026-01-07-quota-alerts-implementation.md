# Quota Alerts & Polling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement background quota polling, configurable low-quota alerts, and refined UI for the Opencode Quota plugin.

**Architecture:** Switch from message-driven fetching to a background polling loop. Centralize state in the plugin closure. Use a simplified config-driven alert system.

**Tech Stack:** TypeScript, Node.js, Vitest

## Configuration Updates (`ag-quota`)

### Task 1: Update Configuration Schema

**Files:**
- Modify: `packages/ag-quota/src/config.ts`
- Test: `test/unit/ag-quota/config.test.ts`

**Step 1: Write failing test for new config options**

Add to `test/unit/ag-quota/config.test.ts`:

```typescript
it("accepts alertThresholds config option", () => {
    const config = loadConfig(undefined);
    expect(config.alertThresholds).toEqual([0.2, 0.1, 0.05]); // Check default
});

it("accepts pollingInterval config option", () => {
    const config = loadConfig(undefined);
    expect(config.pollingInterval).toEqual(30000); // Check default
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL (property does not exist)

**Step 3: Update `QuotaConfig` interface and defaults**

Modify `packages/ag-quota/src/config.ts`:

```typescript
export interface QuotaConfig {
    // ... existing ...
    /**
     * Array of percentage thresholds (0.0 - 1.0) to trigger low quota alerts.
     * @default [0.2, 0.1, 0.05]
     */
    alertThresholds?: number[];

    /**
     * Interval in milliseconds to fetch quota data in the background.
     * @default 30000 (30 seconds)
     */
    pollingInterval?: number;
}

const DEFAULT_CONFIG: Required<QuotaConfig> = {
    // ... existing ...
    alertThresholds: [0.2, 0.1, 0.05],
    pollingInterval: 30000,
    // Update marker default too
    quotaMarker: "> AG Quota:",
};
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/ag-quota/src/config.ts test/unit/ag-quota/config.test.ts
git commit -m "feat(config): add alert thresholds and polling interval"
```

## Plugin Implementation (`opencode-ag-quota`)

### Task 2: Refactor State & Helper Functions

**Files:**
- Modify: `packages/opencode-ag-quota/src/plugin.ts`

**Step 1: Define Plugin State Interface**

Inside `QuotaPlugin` in `packages/opencode-ag-quota/src/plugin.ts`, define the state structure (conceptually, or just init variables):

```typescript
    // State
    let quotaState = {
        data: null as UnifiedQuotaResult | null,
        lastAlertLevel: 1.0, // Start high, lower as we alert
        isConnected: false,
        currentSource: null as "cloud" | "local" | null,
        retryCount: 0
    };
```

**Step 2: Update `updateQuotaMessage` for Blockquote Format**

Modify `updateQuotaMessage` in `packages/opencode-ag-quota/src/plugin.ts`:

```typescript
    const updateQuotaMessage = (
        currentText: string,
        newContent: string,
    ): string => {
        // Format: > AG Quota: ...
        const fullMessage = `\n\n${marker} ${newContent}`;
        
        if (currentText.includes(marker)) {
            // Regex to find existing marker line
            // Matches: \n\n> AG Quota: ... (until end of line or message)
            const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\n\\n${escapedMarker}.*$`, 's'); // Simple replace at end
            
            // If we want to be safer and only replace the line:
            // return currentText.replace(regex, fullMessage);
            
            // Actually, let's keep it simple and just append if not found, 
            // or replace the specific block if found. 
            // Since we use a blockquote, it might span multiple lines if we are not careful,
            // but our content is single line.
            
            return currentText.replace(new RegExp(`\\n\\n${escapedMarker}.*`), fullMessage);
        }
        return currentText + fullMessage;
    };
```

**Step 3: Commit**

```bash
git add packages/opencode-ag-quota/src/plugin.ts
git commit -m "refactor(plugin): update state structure and message formatter"
```

### Task 3: Implement Polling & Alerts

**Files:**
- Modify: `packages/opencode-ag-quota/src/plugin.ts`

**Step 1: Implement `checkAlerts` function**

Add to `QuotaPlugin`:

```typescript
    const checkAlerts = (data: UnifiedQuotaResult) => {
        // Find lowest category
        let lowestParams = { fraction: 1.0, category: "" };
        
        for (const cat of data.categories) {
            if (cat.remainingFraction < lowestParams.fraction) {
                lowestParams = { fraction: cat.remainingFraction, category: cat.category };
            }
        }

        // Check against thresholds (descending)
        const sortedThresholds = [...config.alertThresholds].sort((a, b) => b - a);
        
        for (const threshold of sortedThresholds) {
            // If current is below threshold AND we haven't alerted for this level (or lower) yet
            if (lowestParams.fraction <= threshold && quotaState.lastAlertLevel > threshold) {
                // Alert!
                 client.tui.showToast({
                    body: {
                        title: "Low Quota Alert",
                        message: `${lowestParams.category} is at ${(lowestParams.fraction * 100).toFixed(0)}%`,
                        variant: lowestParams.fraction < 0.1 ? "error" : "warning",
                    },
                });
                
                // Update state so we don't alert again for this threshold
                quotaState.lastAlertLevel = threshold;
                break; // Only one alert per drop
            }
        }
        
        // Reset alert level if quota goes back up (e.g. daily reset)
        // If lowest fraction is significantly higher than last alert, reset.
        // Simple logic: if lowest > lastAlertLevel, reset to lowest (or 1.0)
         if (lowestParams.fraction > quotaState.lastAlertLevel) {
            quotaState.lastAlertLevel = lowestParams.fraction;
        }
    };
```

**Step 2: Implement `startPolling`**

Replace `startConnectionChecker` with `startPolling`:

```typescript
    const startPolling = () => {
        const poll = async () => {
             try {
                // Connection/Auth logic (similar to tryConnect)
                let cloudAuth;
                if (config.quotaSource !== "local") {
                    try { cloudAuth = await getCloudCredentials(); } catch {}
                }

                const result = await fetchQuota(config.quotaSource, shellRunner, cloudAuth);
                
                // Update State
                quotaState.data = result;
                quotaState.currentSource = result.source;
                
                if (!quotaState.isConnected) {
                    quotaState.isConnected = true;
                    // Initial Connect Toast
                     client.tui.showToast({
                        body: {
                            title: "Quota Connected",
                            message: `Connected via ${result.source === 'cloud' ? 'Cloud' : 'Local'}`,
                            variant: "success",
                        },
                    });
                }
                
                // Checks
                checkAlerts(result);
                quotaState.retryCount = 0;

            } catch (error) {
                if (quotaState.isConnected) {
                    quotaState.isConnected = false;
                     client.tui.showToast({
                        body: { title: "Quota Disconnected", message: "Connection lost", variant: "warning" },
                    });
                }
                quotaState.retryCount++;
            }
            
            // Schedule next
            setTimeout(poll, config.pollingInterval);
        };
        
        poll();
    };
```

**Step 3: Update Hook to use cached data**

Modify `experimental.text.complete` hook:

```typescript
        "experimental.text.complete": async (input, output) => {
            // ... strict preamble checks ...

            // Use Cached Data!
            if (!quotaState.isConnected || !quotaState.data) {
                // ... show unavailable/error if config.alwaysAppend ...
                return;
            }

            const data = quotaState.data;
            
            // Format Logic (Flash: 90% | ...)
            // Logic to append 🔴 if < 0.1
            
            const parts: string[] = [];
            for (const cat of data.categories) {
                 let text = `${cat.category}: ${(cat.remainingFraction * 100).toFixed(0)}%`;
                 if (cat.remainingFraction < 0.1) text += " 🔴";
                 parts.push(text);
            }
            
            output.text = updateQuotaMessage(output.text, parts.join(config.separator));
        }
```

**Step 4: Commit**

```bash
git add packages/opencode-ag-quota/src/plugin.ts
git commit -m "feat(plugin): implement polling, alerts, and cached display"
```

## Verification

### Task 4: Integration Test Update

**Files:**
- Modify: `test/integration/run-tests.ts` (or relevant test files)

**Step 1: Verify Behavior**

Since we can't easily mock `setInterval` in a compiled integration test without dependency injection, we rely on the unit tests for config and manual verification for the runtime behavior. However, we can update `test/unit/plugin/output.test.ts` to mock the state.

**Step 2: Run all tests**

```bash
npm test
```

**Step 3: Build & Manual Verify**

```bash
npm run build
# Then run the debug script or install in opencode to verify
```
