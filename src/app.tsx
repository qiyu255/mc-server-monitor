import React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Resolve real address FIRST (for logging only, NOT counted in latency)
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

  try {
    // START timing here — exclude our DNS resolution time
    const pingStart = Date.now();

    const pingOptions: PingOptions = { timeout: PING_TIMEOUT };
    if (port !== 25565) {
      pingOptions.port = port;
    }

    const data = await pingJava(host, pingOptions);
    const latency = Date.now() - pingStart;

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
    logger.error('Server status check failed', {
      originalHost: original,
      realHost,
      realPort,
      resolvedIp,
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
      latency: 0,
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
    if (seg.isNewline || seg.text === '\n') {
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
  const checkingRef = useRef(false);   // ← 新增：真正的互斥锁
  const { exit } = useApp();

  const checkAll = useCallback(async () => {
    if (checkingRef.current) return;     // ← 用 ref 判断，不触发重渲染
    checkingRef.current = true;
    setIsChecking(true);                  // ← 仅用于 UI 显示

    const promises = servers.map((addr: string) => pingServer(addr));
    const newResults = await Promise.all(promises);

    setResults(newResults);
    setLastCheck(new Date());
    checkingRef.current = false;
    setIsChecking(false);
  }, [servers]);                          // ← 只依赖 servers，稳定不变

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
    return () => { process.off('SIGINT', handleSigint); }
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