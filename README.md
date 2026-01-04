# OpenCode Godot LSP Bridge

A bridge script that enables **GDScript Language Server Protocol (LSP)** support in [OpenCode](https://github.com/anomalyco/opencode) for Godot Engine development.

## The Problem

OpenCode's LSP integration expects servers to communicate via **stdio** (standard input/output), but Godot's GDScript LSP server communicates via **TCP**. Additionally, the LSP server is built into the Godot Editor and requires the editor to be running.

## The Solution

This bridge script:
1. **Automatically launches Godot** in headless mode (no visible window) with LSP enabled
2. **Bridges stdio ↔ TCP** communication between OpenCode and Godot's LSP server
3. **Works cross-platform** (Windows, Linux, macOS)

## Requirements

- **Node.js** (v14 or higher)
- **Godot Engine 4.4.1+** (recommended for best headless support)
- **OpenCode** CLI

### Linux-specific (headless servers only)
If running on Linux without a display server (e.g., WSL, CI, headless server):
```bash
sudo apt install xvfb
```

## Installation

### 1. Download the Bridge Script

Clone this repository or download `godot-lsp-bridge.js`:

```bash
# Clone the repository
git clone https://github.com/MasuRii/opencode-godot-lsp.git

# Or download just the script
curl -O https://raw.githubusercontent.com/MasuRii/opencode-godot-lsp/main/godot-lsp-bridge.js
```

### 2. Place the Script

Put `godot-lsp-bridge.js` somewhere accessible. Common locations:

| OS | Recommended Path |
|----|------------------|
| Windows | `C:\Users\<USERNAME>\.config\opencode\scripts\godot-lsp-bridge.js` |
| Linux/macOS | `~/.config/opencode/scripts/godot-lsp-bridge.js` |

### 3. Configure OpenCode

Add the following to your `opencode.jsonc` configuration file:

#### Windows Example

```jsonc
{
  // ... other configuration ...

  "lsp": {
    "gdscript": {
      "command": ["node", "C:/Users/YOUR_USERNAME/.config/opencode/scripts/godot-lsp-bridge.js"],
      "extensions": [".gd", ".gdshader"]
    }
  }
}
```

#### Linux/macOS Example

```jsonc
{
  // ... other configuration ...

  "lsp": {
    "gdscript": {
      "command": ["node", "/home/YOUR_USERNAME/.config/opencode/scripts/godot-lsp-bridge.js"],
      "extensions": [".gd", ".gdshader"]
    }
  }
}
```

### 4. Set Environment Variables (Optional)

If Godot isn't in your PATH or you have multiple versions:

```bash
# Windows (PowerShell)
$env:GODOT_PATH = "C:\Path\To\Godot\godot.exe"

# Linux/macOS
export GODOT_PATH="/path/to/godot"
```

## Usage

Once configured, OpenCode will automatically:

1. Detect when you're working in a Godot project (looks for `project.godot`)
2. Launch Godot in headless mode with LSP enabled
3. Provide code intelligence features for `.gd` and `.gdshader` files

### Features Enabled

- **Autocomplete** - Intelligent code completion for GDScript
- **Go to Definition** - Jump to function/variable definitions
- **Hover Documentation** - View inline documentation
- **Diagnostics** - Real-time error and warning detection
- **Symbol Search** - Find symbols across your project

## Command Line Options

The bridge script accepts several options:

```bash
node godot-lsp-bridge.js [options]

Options:
  --port <port>      LSP server port (default: 6005)
  --host <host>      LSP server host (default: 127.0.0.1)
  --godot <path>     Path to Godot executable
  --project <path>   Path to Godot project directory
```

### Example with Options

```jsonc
{
  "lsp": {
    "gdscript": {
      "command": [
        "node", 
        "/path/to/godot-lsp-bridge.js",
        "--port", "6008",
        "--godot", "/custom/path/to/godot"
      ],
      "extensions": [".gd", ".gdshader"]
    }
  }
}
```

## How It Works

```
┌─────────────┐     stdio      ┌──────────────────┐     TCP      ┌─────────────────┐
│   OpenCode  │ ◄───────────► │  godot-lsp-bridge │ ◄──────────► │  Godot Editor   │
│   (Client)  │               │     (Bridge)      │   :6005      │  (LSP Server)   │
└─────────────┘               └──────────────────┘              └─────────────────┘
```

1. OpenCode spawns the bridge script via the configured command
2. The bridge checks if Godot LSP is already running on the specified port
3. If not, it launches Godot in headless mode with `--editor --headless --lsp-port`
4. The bridge connects to Godot's TCP LSP server
5. All LSP messages are proxied between OpenCode (stdio) and Godot (TCP)

## Troubleshooting

### LSP Not Connecting

1. **Check Godot version**: Requires Godot 4.x (4.4.1+ recommended)
   ```bash
   godot --version
   ```

2. **Verify project.godot exists**: The bridge searches for this file to locate your project

3. **Check the port**: Ensure port 6005 (or your configured port) isn't already in use
   ```bash
   # Windows
   netstat -an | findstr 6005
   
   # Linux/macOS
   lsof -i :6005
   ```

### "Could not find Godot executable"

Set the `GODOT_PATH` environment variable or use the `--godot` flag:

```bash
# In your shell profile (.bashrc, .zshrc, etc.)
export GODOT_PATH="/path/to/godot"
```

Or modify your OpenCode config:

```jsonc
{
  "lsp": {
    "gdscript": {
      "command": ["node", "/path/to/godot-lsp-bridge.js", "--godot", "/path/to/godot"],
      "extensions": [".gd", ".gdshader"]
    }
  }
}
```

### Linux: "No DISPLAY detected"

Install Xvfb for headless operation:

```bash
sudo apt install xvfb
```

The bridge will automatically use `xvfb-run` when no DISPLAY is available.

### Timeout Waiting for LSP

- Increase the timeout by modifying the script (look for `40` iterations × 500ms = 20 seconds)
- Check if Godot launches correctly by running manually:
  ```bash
  godot --editor --headless --lsp-port 6005 --path /your/project
  ```

## Configuration Reference

### Full opencode.jsonc Example

```jsonc
{
  // ═══════════════════════════════════════════════════════════════════════════
  // LSP SERVERS CONFIGURATION
  // Language Server Protocol integrations for enhanced code intelligence
  // ═══════════════════════════════════════════════════════════════════════════
  "lsp": {
    // GDScript LSP for Godot Engine development
    // Note: Requires Godot Editor (launched automatically in headless mode)
    // The bridge script converts stdio (OpenCode) to TCP (Godot's LSP)
    "gdscript": {
      "command": ["node", "C:/Users/YOUR_USERNAME/.config/opencode/scripts/godot-lsp-bridge.js"],
      "extensions": [".gd", ".gdshader"]
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GODOT_PATH` | Path to Godot executable | Searches common locations |
| `GODOT_PROJECT` | Path to Godot project | Current working directory |

## Known Limitations

1. **Requires Godot Editor**: The GDScript LSP server is built into the editor binary and cannot run standalone
2. **Single Project**: Each bridge instance connects to one project; for multiple projects, configure separate bridges
3. **Startup Time**: First connection may take 10-20 seconds as Godot initializes

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - See [LICENSE](LICENSE) for details.

## Acknowledgments

- [Godot Engine](https://godotengine.org/) - The amazing open-source game engine
- [OpenCode](https://github.com/opencode-ai/opencode) - AI-powered terminal coding assistant
- Godot community for documentation on headless LSP operation
