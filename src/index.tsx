#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import React from 'react';
import { render } from 'ink';
import App from './app.tsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVERS_FILE = path.join(__dirname, '..', 'servers.txt');

function loadServers(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: servers.txt not found at ${filePath}`);
    console.error('Please create a servers.txt file with one server address per line.');
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const servers = content
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0 && !line.startsWith('#'));

  if (servers.length === 0) {
    console.error('Error: No valid server addresses found in servers.txt');
    process.exit(1);
  }

  return servers;
}

const servers = loadServers(SERVERS_FILE);

render(<App servers={servers} />);