#!/usr/bin/env node
/**
 * Godot LSP Bridge for OpenCode
 * 
 * Bridges stdio (what OpenCode expects) to TCP (what Godot provides).
 * Automatically launches Godot in true headless mode if not running.
 * 
 * Usage: node godot-lsp-bridge.js [--port <port>] [--host <host>] [--godot <path>] [--project <path>]
 * 
 * Environment Variables:
 *   GODOT_PATH - Path to Godot executable
 *   GODOT_PROJECT - Path to Godot project directory
 * 
 * Requirements:
 *   - Godot 4.4.1+ recommended for best headless support
 *   - The LSP server is built into the Godot Editor (--editor flag required)
 *   - On Linux without display: use Xvfb (xvfb-run godot ...)
 */

const net = require('net');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Detect platform
const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';
const isMac = os.platform() === 'darwin';

// Parse command line arguments
const args = process.argv.slice(2);
let port = 6005; // Default for Godot Tools VS Code extension
let host = '127.0.0.1';
let godotPath = process.env.GODOT_PATH || 'godot';
let projectPath = process.env.GODOT_PROJECT || process.cwd();

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
        port = parseInt(args[i + 1], 10);
        i++;
    } else if (args[i] === '--host' && args[i + 1]) {
        host = args[i + 1];
        i++;
    } else if (args[i] === '--godot' && args[i + 1]) {
        godotPath = args[i + 1];
        i++;
    } else if (args[i] === '--project' && args[i + 1]) {
        projectPath = args[i + 1];
        i++;
    }
}

// Known Godot paths on Windows
const godotPaths = [
    godotPath,
    'C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\WinGet\\Links\\godot.exe',
    'C:\\Program Files\\Godot\\godot.exe',
    'C:\\Program Files (x86)\\Godot\\godot.exe',
];

function findGodot() {
    for (const p of godotPaths) {
        try {
            if (fs.existsSync(p)) {
                return p;
            }
        } catch (e) {
            // Ignore
        }
    }
    // Try to find in PATH
    try {
        const result = execSync('where godot', { encoding: 'utf8', timeout: 5000 });
        const lines = result.trim().split('\n');
        if (lines.length > 0 && lines[0]) {
            return lines[0].trim();
        }
    } catch (e) {
        // Not in PATH
    }
    return null;
}

function findProjectFile(dir) {
    // Look for project.godot file
    let current = dir;
    for (let i = 0; i < 10; i++) { // Max 10 levels up
        const projectFile = path.join(current, 'project.godot');
        if (fs.existsSync(projectFile)) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return null;
}

function isPortOpen(port, host, timeout = 1000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);
        
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        
        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });
        
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        
        socket.connect(port, host);
    });
}

async function launchGodotEditor() {
    const godot = findGodot();
    if (!godot) {
        console.error('[godot-lsp-bridge] Could not find Godot executable.');
        console.error('[godot-lsp-bridge] Set GODOT_PATH environment variable or use --godot flag.');
        return false;
    }

    const project = findProjectFile(projectPath);
    if (!project) {
        console.error('[godot-lsp-bridge] Could not find project.godot file.');
        console.error('[godot-lsp-bridge] Run this from a Godot project directory or use --project flag.');
        return false;
    }

    console.error(`[godot-lsp-bridge] Launching Godot LSP in headless mode...`);
    console.error(`[godot-lsp-bridge] Godot: ${godot}`);
    console.error(`[godot-lsp-bridge] Project: ${project}`);
    console.error(`[godot-lsp-bridge] Port: ${port}`);

    // Build command-line arguments for Godot 4.4.1+
    // Key flags:
    //   --editor    : Required - LSP server only exists in editor mode
    //   --headless  : Enables headless mode (--display-driver headless --audio-driver Dummy)
    //   --lsp-port  : Specifies the LSP port
    //   --path      : Path to the project directory
    const godotArgs = [
        '--editor',
        '--headless',
        '--lsp-port', port.toString(),
        '--path', project
    ];

    console.error(`[godot-lsp-bridge] Command: ${godot} ${godotArgs.join(' ')}`);

    // Spawn options for background process
    const spawnOptions = {
        detached: true,
        stdio: 'ignore',
        windowsHide: true  // Backup for Windows - hides console window
    };

    let godotProcess;

    if (isLinux && !process.env.DISPLAY) {
        // On Linux without DISPLAY, try using xvfb-run if available
        try {
            execSync('which xvfb-run', { encoding: 'utf8', timeout: 2000 });
            console.error('[godot-lsp-bridge] No DISPLAY detected, using xvfb-run...');
            godotProcess = spawn('xvfb-run', ['-a', godot, ...godotArgs], spawnOptions);
        } catch (e) {
            // xvfb-run not available, try anyway (--headless should handle it)
            console.error('[godot-lsp-bridge] No DISPLAY and xvfb-run not found, trying headless anyway...');
            godotProcess = spawn(godot, godotArgs, spawnOptions);
        }
    } else {
        // Windows, macOS, or Linux with DISPLAY - use direct spawn with headless flags
        godotProcess = spawn(godot, godotArgs, spawnOptions);
    }

    godotProcess.unref();

    // Wait for LSP to become available (up to 20 seconds - headless editor may take time to initialize)
    console.error('[godot-lsp-bridge] Waiting for LSP server to start...');
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await isPortOpen(port, host)) {
            console.error(`[godot-lsp-bridge] Godot LSP ready on port ${port}`);
            return true;
        }
        // Progress indicator every 5 seconds
        if ((i + 1) % 10 === 0) {
            console.error(`[godot-lsp-bridge] Still waiting... (${(i + 1) / 2}s)`);
        }
    }

    console.error('[godot-lsp-bridge] Timeout waiting for Godot LSP to start.');
    console.error('[godot-lsp-bridge] Troubleshooting tips:');
    console.error('[godot-lsp-bridge]   1. Ensure Godot 4.4.1+ is installed for best headless support');
    console.error('[godot-lsp-bridge]   2. Check if project.godot exists in the project path');
    console.error('[godot-lsp-bridge]   3. On Linux without X: install xvfb (sudo apt install xvfb)');
    console.error('[godot-lsp-bridge]   4. Try running Godot Editor manually to verify it works');
    return false;
}

async function main() {
    // Check if LSP is already running
    let lspRunning = await isPortOpen(port, host);
    
    // Try alternate port if primary fails
    if (!lspRunning && port === 6005) {
        lspRunning = await isPortOpen(6008, host);
        if (lspRunning) port = 6008;
    } else if (!lspRunning && port === 6008) {
        lspRunning = await isPortOpen(6005, host);
        if (lspRunning) port = 6005;
    }

    // If not running, try to launch Godot Editor
    if (!lspRunning) {
        lspRunning = await launchGodotEditor();
        if (!lspRunning) {
            console.error('[godot-lsp-bridge] Failed to start Godot LSP.');
            console.error('[godot-lsp-bridge] Please start Godot Editor manually or ensure Godot is installed.');
            process.exit(1);
        }
    }

    // Connect to the LSP server
    const socket = new net.Socket();

    socket.on('connect', () => {
        console.error(`[godot-lsp-bridge] Connected to Godot LSP on ${host}:${port}`);
        // Pipe stdin to socket (OpenCode -> Godot)
        process.stdin.pipe(socket);
    });

    // Pipe socket to stdout (Godot -> OpenCode)
    socket.pipe(process.stdout);

    socket.on('error', (err) => {
        console.error(`[godot-lsp-bridge] Error: ${err.message}`);
        process.exit(1);
    });

    socket.on('close', () => {
        process.exit(0);
    });

    // Handle process termination gracefully
    process.on('SIGTERM', () => {
        socket.end();
        process.exit(0);
    });

    process.on('SIGINT', () => {
        socket.end();
        process.exit(0);
    });

    socket.connect(port, host);
}

main().catch((err) => {
    console.error(`[godot-lsp-bridge] Fatal error: ${err.message}`);
    process.exit(1);
});
