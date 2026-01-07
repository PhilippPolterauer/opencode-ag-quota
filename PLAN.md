# Implementation Plan: Hide Quota from AI Agent

## Objective
Modify the `opencode-ag-quota` plugin so that quota information remains visible to the user in the message history but is stripped out before being sent to the AI LLM.

## Architecture
The Opencode Plugin API provides an `experimental.chat.messages.transform` hook that is called just before the conversation history is sent to the model. We will use this hook to post-process messages.

## Steps

### 1. Update Plugin Logic
Add the `experimental.chat.messages.transform` hook to `packages/opencode-ag-quota/src/plugin.ts`.
- Iterate through all messages in the conversation.
- For each `text` part, use a regular expression to remove the quota line (e.g., `\n\n> AG Quota: .*`).
- This ensures the LLM never sees the "AG Quota" marker or the usage data.

### 2. Update Tests
Add a new unit test in `test/unit/plugin/output.test.ts` to verify the transformation:
- Create a mock message with a quota line.
- Call the `transform` hook.
- Assert that the output message no longer contains the quota line.

### 3. Verification
- Run `npm run test:unit` to verify the new transformation logic.
- Run `npm run test:integration` to ensure the quota still displays correctly in the UI.

## Benefits
- **Cleaner Context:** Prevents the AI from being distracted by metadata.
- **Privacy:** Keeps usage statistics local to the user's interface.
- **Idiomatic:** Uses the platform's intended transformation pipeline.
