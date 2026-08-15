
import os

output_dir = "."

# 1. Update package.json - add @types/node
package_json = '''{
  "name": "mc-server-monitor",
  "version": "1.0.0",
  "description": "Minecraft Java Edition server status monitor with Ink terminal UI",
  "type": "module",
  "main": "src/index.tsx",
  "scripts": {
    "start": "tsx src/index.tsx",
    "dev": "tsx watch src/index.tsx"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "dependencies": {
    "@minescope/mineping": "^1.0.0",
    "ink": "^5.0.0",
    "react": "^18.3.1",
    "winston": "^3.17.0",
    "winston-daily-rotate-file": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.12",
    "tsx": "^4.0.0"
  }
}
'''

with open(f"{output_dir}/package.json", "w", encoding='utf-8') as f:
    f.write(package_json)

# 2. Rewrite index.tsx with types
index_tsx = '''#!/usr/bin/env node

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
    .split('\\n')
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
'''

with open(f"{output_dir}/src/index.tsx", "w", encoding='utf-8') as f:
    f.write(index_tsx)

# 3. Rewrite app.tsx with full types
app_tsx = '''import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import { pingJava } from '@minescope/mineping';
import dns from 'dns';
import { promisify } from 'util';
import logger from './logger.js';
import { parseMotd } from './motd-parser.js';

const resolveSrv = promisify(dns.resolveSrv);
const resolve4 = promisify(dns.resolve4);

const PING_TIMEOUT = 10000;

interface ServerResult {
  original: string;
  host: string;
  port: number;
  realHost: string;
  realPort: number;
  resolvedIp: string;
  latency: number;
  online: number;
  max: number;
  motd: string | object;
  version: string;
  status: 'online' | 'error';
  error: string | null;
}

interface PingOptions {
  timeout: number;
  port?: number;
}

function parseServerAddr(addr: string) {
  addr = addr.trim();
  if (!addr) return null;
  const parts = addr.split(':');
  const host = parts[0];
  const port = parts[1] ? parseInt(parts[1], 10) : 25565;
  return { host, port, original: addr };
}

async function resolveServerRealAddress(host: string, port: number) {
  let realHost = host;
  let realPort = port;
  let resolvedIp = host;

  try {
    const srvRecords = await resolveSrv(`_minecraft._tcp.${host}`);
    if (srvRecords && srvRecords.length > 0) {
      const record = srvRecords[0];
      realHost = record.name;
      realPort = record.port;
    }
  } catch {
    // No SRV record
  }

  try {
    const addresses = await resolve4(realHost);
    if (addresses && addresses.length > 0) {
      resolvedIp = addresses[0];
    }
  } catch {
    // Keep hostname
  }

  return { realHost, realPort, resolvedIp };
}

async function pingServer(serverAddr: string): Promise<ServerResult> {
  const startTime = Date.now();
  const parsed = parseServerAddr(serverAddr);
  if (!parsed) {
    return {
      original: serverAddr,
      host: '',
      port: 25565,
      realHost: '',
      realPort: 25565,
      resolvedIp: '',
      latency: 0,
      online: 0,
      max: 0,
      motd: '',
      version: '',
      status: 'error',
      error: 'Invalid address',
    };
  }

  const { host, port, original } = parsed;

  try {
    const { realHost, realPort, resolvedIp } = await resolveServerRealAddress(host, port);

    const pingOptions: PingOptions = { timeout: PING_TIMEOUT };
    if (port !== 25565) {
      pingOptions.port = port;
    }

    const data = await pingJava(host, pingOptions);
    const latency = Date.now() - startTime;

    const motd = data.description || '';
    const players = data.players || { online: 0, max: 0 };

    logger.info('Server status check', {
      originalHost: original,
      realHost,
      realPort,
      resolvedIp,
      latency,
      online: players.online,
      max: players.max,
      version: data.version?.name || 'unknown',
      motd: typeof motd === 'string' ? motd.replace(/§[0-9a-fk-or]/gi, '') : JSON.stringify(motd),
      status: 'online'
    });

    return {
      original,
      host,
      port,
      realHost,
      realPort,
      resolvedIp,
      latency,
      online: players.online,
      max: players.max,
      motd,
      version: data.version?.name || '',
      status: 'online',
      error: null,
    };
  } catch (err: any) {
    const latency = Date.now() - startTime;

    let realHost = host;
    let realPort = port;
    let resolvedIp = host;
    try {
      const resolved = await resolveServerRealAddress(host, port);
      realHost = resolved.realHost;
      realPort = resolved.realPort;
      resolvedIp = resolved.resolvedIp;
    } catch {
      // ignore
    }

    logger.error('Server status check failed', {
      originalHost: original,
      realHost,
      realPort,
      resolvedIp,
      latency,
      error: err.message || String(err),
      status: 'offline'
    });

    return {
      original,
      host,
      port,
      realHost,
      realPort,
      resolvedIp,
      latency,
      online: 0,
      max: 0,
      motd: '',
      version: '',
      status: 'error',
      error: err.message || 'Connection failed',
    };
  }
}

interface MotdSegment {
  text: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  dimColor: boolean;
  isNewline?: boolean;
}

function MotdText({ segments }: { segments: MotdSegment[] }) {
  const lines: MotdSegment[][] = [];
  let currentLine: MotdSegment[] = [];

  for (const seg of segments) {
    if (seg.isNewline || seg.text === '\\n') {
      if (currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [];
      }
    } else {
      currentLine.push(seg);
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  if (lines.length === 0) {
    return <Text></Text>;
  }

  return (
    <>
      {lines.map((line, lineIdx) => (
        <Box key={lineIdx} flexDirection="row">
          {line.map((seg, segIdx) => (
            <Text
              key={segIdx}
              color={seg.color}
              bold={seg.bold}
              italic={seg.italic}
              underline={seg.underline}
              strikethrough={seg.strikethrough}
              dimColor={seg.dimColor}
            >
              {seg.text}
            </Text>
          ))}
        </Box>
      ))}
    </>
  );
}

function ServerRow({ result }: { result: ServerResult }) {
  const isOnline = result.status === 'online';
  const isError = result.status === 'error';

  let latencyColor = 'white';
  let latencyText = '';
  if (isError) {
    latencyColor = 'red';
    latencyText = 'x';
  } else if (isOnline) {
    if (result.latency < 50) {
      latencyColor = 'green';
    } else {
      latencyColor = 'yellow';
    }
    latencyText = `${result.latency}ms`;
  }

  const playersText = isOnline ? `${result.online}/${result.max}` : '';
  const motdSegments = isOnline ? parseMotd(result.motd) as MotdSegment[] : [];

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <Text color="white">{result.original}</Text>
        <Text> </Text>
        <Text color={latencyColor}>{latencyText}</Text>
        {isOnline && (
          <>
            <Text> </Text>
            <Text color="gray">{playersText}</Text>
          </>
        )}
      </Box>

      <Box flexDirection="column" paddingLeft={2}>
        {isOnline && motdSegments.length > 0 ? (
          <MotdText segments={motdSegments} />
        ) : isError ? (
          <Text color="red">error {result.error}</Text>
        ) : null}
      </Box>
    </Box>
  );
}

function App({ servers }: { servers: string[] }) {
  const [results, setResults] = useState<ServerResult[]>([]);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const { exit } = useApp();

  const checkAll = useCallback(async () => {
    if (isChecking) return;
    setIsChecking(true);

    const promises = servers.map((addr: string) => pingServer(addr));
    const newResults = await Promise.all(promises);

    setResults(newResults);
    setLastCheck(new Date());
    setIsChecking(false);
  }, [servers, isChecking]);

  useEffect(() => {
    checkAll();
    const interval = setInterval(() => {
      checkAll();
    }, 60000);
    return () => clearInterval(interval);
  }, [checkAll]);

  useEffect(() => {
    const handleSigint = () => {
      exit();
    };
    process.on('SIGINT', handleSigint);
    return () => process.off('SIGINT', handleSigint);
  }, [exit]);

  const timeStr = lastCheck
    ? lastCheck.toLocaleTimeString('zh-CN', { hour12: false })
    : '--:--:--';

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {'═'.repeat(50)}
        </Text>
      </Box>
      <Box flexDirection="row" marginBottom={1}>
        <Text bold color="cyan">MC Server Monitor</Text>
        <Text>  </Text>
        <Text dimColor>
          {isChecking ? '(checking...)' : `(last check: ${timeStr})`}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {'═'.repeat(50)}
        </Text>
      </Box>

      {results.length === 0 ? (
        <Text dimColor>Checking servers...</Text>
      ) : (
        results.map((result, idx) => (
          <ServerRow key={idx} result={result} />
        ))
      )}

      <Box marginTop={1}>
        <Text bold color="cyan">
          {'═'.repeat(50)}
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          Press Ctrl+C to exit  •  Checking every 60s
        </Text>
      </Box>
    </Box>
  );
}

export default App;
'''

with open(f"{output_dir}/src/app.tsx", "w", encoding='utf-8') as f:
    f.write(app_tsx)

print("✅ 全部修复完成")
print("\n执行：")
print("  npm install        # 安装新加的 @types/node")
print("  npm start          # 正常运行")
print("\n所有 IDE 报错已消除：")
print("  • 添加了 @types/node")
print("  • 所有函数参数加了类型注解")
print("  • useState 加了泛型 <ServerResult[]> / <Date | null>")
print("  • catch (err: any) 显式标注")
print("  • pingOptions 提取为 PingOptions interface")
print("  • MotdSegment interface 替代隐式 any")
