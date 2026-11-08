# DevPulse Installation Guide

DevPulse can be installed directly from the Visual Studio Code Marketplace or manually using the pre-compiled VSIX release artifact.

---

## Method 1: VS Code Marketplace (Recommended)

1. Launch **Visual Studio Code** (v1.95.0 or later).
2. Open the Extensions sidebar (`Ctrl+Shift+X` on Windows/Linux or `Cmd+Shift+X` on macOS).
3. Search for **DevPulse**.
4. Select **DevPulse** by **Valtry** and click **Install**.
5. Once installation completes, click the DevPulse pulse wave icon in the Activity Bar or press `Ctrl+Shift+P` and execute `DevPulse: Open Dashboard`.

---

## Method 2: Manual VSIX Installation

If you are developing offline or testing a specific release, you can install the official packaged VSIX directly.

### Via Command Line
Download `devpulse-ai-1.0.0.vsix` from [GitHub Releases](https://github.com/Sabithulla-16/DevPulse/releases) and run:

```bash
code --install-extension devpulse-ai-1.0.0.vsix
```

### Via VS Code UI
1. Download `devpulse-ai-1.0.0.vsix` from the [Releases page](https://github.com/Sabithulla-16/DevPulse/releases).
2. In VS Code, navigate to the Extensions view (`Ctrl+Shift+X`).
3. Click the `...` (More Actions) menu in the top right of the Extensions panel.
4. Select **Install from VSIX...**.
5. Choose the downloaded `devpulse-ai-1.0.0.vsix` file.

---

## Verifying Integrity

Every official release includes a `SHA256SUMS.txt` cryptographic checksum file. Verify the package checksum before installing:

### Windows (PowerShell)
```powershell
Get-FileHash .\devpulse-ai-1.0.0.vsix -Algorithm SHA256
```

### macOS / Linux
```bash
sha256sum devpulse-ai-1.0.0.vsix
```

Compare the computed hash with the release checksum:
`0c2e03478459e4820b15570ce6ff2d6aaadacb557b944d6075d35f45c8c4bd33`

---

## System Requirements

- **VS Code**: Version `^1.95.0` or later.
- **Operating Systems**: Windows 10/11, macOS (Intel & Apple Silicon), and Linux (x86_64, ARM64).
- **Node.js**: Not required for extension execution (VS Code extension host bundles its own runtime). Required only if integrating with the DevPulse Express middleware in your applications.
- **Local AI (Optional)**: [Ollama](https://ollama.ai) v0.1.30 or higher running on `http://localhost:11434` for 100% private, zero-cost on-device LLM inference.
