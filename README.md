# Opencode Antigravity Quota

An Opencode TUI plugin and CLI tool to display remaining Antigravity model quotas.

## 🚀 Features

- **TUI Integration**: Automatically appends remaining quota information and reset timers to the end of every assistant response in the Opencode TUI.
- **CLI Tool**: Quick terminal check for all model categories (Flash, Pro, Claude/GPT/OSS).
- **JSON Output**: Machine-readable quota data for scripting.

## ⚠️ Important Prerequisites

This plugin retrieves data directly from the **local Antigravity Language Server**. It does **NOT** handle authentication or start the server itself.

**For this plugin to work, you must satisfy ONE of the following:**

1.  **Run an IDE with Antigravity**: Have VS Code (or Zed, JetBrains, etc.) open with the **Antigravity Extension** installed and authenticated. The extension starts the language server automatically in the background.
2.  **Run the Server Manually**: If you are using a headless environment or a different editor, you must ensure the `language_server` process is running and authenticated on the same machine/container as Opencode.

*Note: If Opencode is running in WSL, the Antigravity server must also be running inside WSL (which is the default behavior for VS Code Remote - WSL).*

## 📥 Installation

1.  Clone this repository into your Opencode project or global config:
    ```bash
    git clone https://github.com/philipp/opencode-ag-quota.git
    ```
2.  Install dependencies and build:
    ```bash
    npm install
    npm run build
    ```
3.  Link to Opencode:
    Ensure the built files are accessible to Opencode (the project uses a linked package structure via `.opencode/plugin`).

## 🖥️ Usage

### In Opencode TUI
Just start `opencode` from the root of this repository. The plugin will load automatically.
-   When you chat with a supported model (e.g., `antigravity-google-pro`), the remaining quota and reset time will appear at the bottom of the response.
-   If the Antigravity server is not found, the plugin will fail silently and show nothing.

### CLI Command
To see a summary of all quotas in your terminal:
```bash
npm run show-quota
```

For JSON output:
```bash
npm run show-quota -- --json
```

## 📜 Credits

This project is heavily inspired by and based on the discovery logic from the **[ag-usage](https://github.com/crsmilitaru97/ag-usage)** project. We gratefully acknowledge their work in deciphering the Antigravity local API and discovery mechanism.

## 📄 License

MIT
