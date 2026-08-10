import { spawn } from 'node:child_process';

export interface GitExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface GitBufferResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

export interface GitOptions {
  cwd?: string;
  input?: string;
  env?: NodeJS.ProcessEnv;
}

function spawnGit(args: string[], opts: GitOptions) {
  return spawn('git', args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    windowsHide: true,
  });
}

export function runGit(args: string[], opts: GitOptions = {}): Promise<GitExecResult> {
  return new Promise((resolve) => {
    const child = spawnGit(args, opts);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => stdout.push(d));
    child.stderr.on('data', (d: Buffer) => stderr.push(d));
    child.on('error', (err) => {
      resolve({ code: -1, stdout: '', stderr: String(err) });
    });
    child.on('close', (code) => {
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    if (opts.input !== undefined) {
      child.stdin.end(opts.input);
    } else {
      child.stdin.end();
    }
  });
}

export function runGitBuffer(args: string[], opts: GitOptions = {}): Promise<GitBufferResult> {
  return new Promise((resolve) => {
    const child = spawnGit(args, opts);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => stdout.push(d));
    child.stderr.on('data', (d: Buffer) => stderr.push(d));
    child.on('error', (err) => {
      resolve({ code: -1, stdout: Buffer.alloc(0), stderr: String(err) });
    });
    child.on('close', (code) => {
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    if (opts.input !== undefined) {
      child.stdin.end(opts.input);
    } else {
      child.stdin.end();
    }
  });
}

export class GitError extends Error {
  constructor(public readonly result: GitExecResult) {
    super(result.stderr || `git exited with code ${result.code}`);
    this.name = 'GitError';
  }
}

export async function runGitOk(args: string[], opts?: GitOptions): Promise<string> {
  const r = await runGit(args, opts);
  if (r.code !== 0) throw new GitError(r);
  return r.stdout;
}