#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const venvPy = path.join(__dirname, '.venv', 'bin', 'python');
const py = fs.existsSync(venvPy) ? venvPy : 'python3';
const script = path.join(__dirname, 'generate-neural-audio.py');

const res = spawnSync(py, [script], { stdio: 'inherit' });
process.exit(res.status ?? 0);
