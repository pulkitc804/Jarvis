import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function codexBinary() {
  return process.env.JARVIS_CODEX_BIN || path.join(os.homedir(), '.npm-global/bin/codex');
}

// Only a bounded, explicit snapshot is passed over stdin. Credentials remain
// managed by Codex; neither auth files nor the server's environment are copied.
export async function askCodex(prompt: string, signal?: AbortSignal): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'jarvis-ask-'));
  try {
    return await new Promise<string>((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
      for (const key of ['HOME', 'PATH', 'USER', 'TMPDIR', 'SystemRoot']) {
        if (process.env[key]) env[key] = process.env[key];
      }
      const child = spawn(codexBinary(), [
        'exec', '--ignore-user-config', '--ignore-rules', '--ephemeral',
        '--skip-git-repo-check', '--sandbox', 'read-only',
        '-c', 'features.shell_tool=false', '--json', '-',
      ], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
      let buffer = '', answer = '', bytes = 0, failure = '';
      const stop = () => child.kill('SIGTERM');
      const timer = setTimeout(stop, 120_000);
      signal?.addEventListener('abort', stop, { once: true });
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 2_000_000) { failure = 'Agent output exceeded the limit.'; stop(); return; }
        buffer += chunk.toString();
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (event.type === 'item.completed' && event.item?.type === 'agent_message') answer += event.item.text + '\n';
            if (event.type === 'turn.failed') failure = 'Codex could not complete this question. Check your subscription limit or run codex login.';
          } catch { /* ignore non-JSON diagnostics */ }
        }
      });
      child.stderr.on('data', () => { /* never return CLI diagnostics or local paths */ });
      child.stdin.on('error', () => {});
      child.on('error', () => reject(new Error('Codex CLI unavailable. Set JARVIS_CODEX_BIN or install Codex CLI.')));
      child.on('close', code => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', stop);
        if (code === 0 && answer.trim()) resolve(answer.trim());
        else reject(new Error(failure || 'Codex did not finish. Run codex login and check your usage allowance.'));
      });
      child.stdin.end(prompt);
    });
  } finally { await rm(cwd, { recursive: true, force: true }); }
}
