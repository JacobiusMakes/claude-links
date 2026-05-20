#!/usr/bin/env node

/**
 * claude-links — Local HTTP server that makes file paths clickable in any terminal.
 *
 * Runs on localhost:9111. When Claude references a file, it outputs a
 * http://localhost:9111/open?path=/path/to/file URL. Cmd-click opens the file.
 *
 * Usage:
 *   claude-links              # Start server (background)
 *   claude-links --port 9111  # Custom port
 *   claude-links --stop       # Stop server
 */

import { createServer } from 'http';
import { execFileSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const args = process.argv.slice(2);
const PORT = parseInt(args.find((a, i) => args[i - 1] === '--port') || '9111');
const PID_FILE = join(homedir(), '.claude-links.pid');

if (args.includes('--stop')) {
  if (existsSync(PID_FILE)) {
    const pid = readFileSync(PID_FILE, 'utf8').trim();
    try { process.kill(parseInt(pid)); } catch {}
    unlinkSync(PID_FILE);
    console.log('claude-links stopped');
  } else {
    console.log('claude-links not running');
  }
  process.exit(0);
}

if (args.includes('--status')) {
  if (existsSync(PID_FILE)) {
    const pid = readFileSync(PID_FILE, 'utf8').trim();
    try {
      process.kill(parseInt(pid), 0);
      console.log(`claude-links running (PID ${pid}, port ${PORT})`);
    } catch {
      unlinkSync(PID_FILE);
      console.log('claude-links not running (stale PID cleaned)');
    }
  } else {
    console.log('claude-links not running');
  }
  process.exit(0);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/open') {
    const filePath = url.searchParams.get('path');
    if (!filePath) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing ?path= parameter');
      return;
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:system-ui;padding:40px"><h2>File not found</h2><code>${filePath}</code></body></html>`);
      return;
    }

    try {
      execFileSync('open', [filePath]);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:system-ui;padding:40px">
        <h2 style="color:#2d7d46">Opened</h2>
        <code>${filePath}</code>
        <script>window.close()</script>
      </body></html>`);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Failed to open: ${e.message}`);
    }
    return;
  }

  if (url.pathname === '/reveal') {
    const filePath = url.searchParams.get('path');
    if (!filePath || !existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
    try {
      execFileSync('open', ['-R', filePath]);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:system-ui;padding:40px">
        <h2 style="color:#2d7d46">Revealed in Finder</h2>
        <code>${filePath}</code>
        <script>window.close()</script>
      </body></html>`);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Failed: ${e.message}`);
    }
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', port: PORT }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('claude-links: use /open?path=... or /reveal?path=...');
});

server.listen(PORT, '127.0.0.1', () => {
  writeFileSync(PID_FILE, String(process.pid));
  console.log(`claude-links running on http://localhost:${PORT}`);
  console.log(`  Open file:   http://localhost:${PORT}/open?path=/path/to/file`);
  console.log(`  Reveal:      http://localhost:${PORT}/reveal?path=/path/to/file`);
  console.log(`  PID: ${process.pid}`);
});

process.on('SIGTERM', () => { try { unlinkSync(PID_FILE); } catch {} process.exit(0); });
process.on('SIGINT', () => { try { unlinkSync(PID_FILE); } catch {} process.exit(0); });
