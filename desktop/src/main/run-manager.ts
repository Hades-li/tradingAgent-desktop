/**
 * One child process per analysis run: spawn, stream, cancel, clean up.
 *
 * Stdout is JSON Lines (see tradingagents/PROTOCOL.md) and is parsed line by
 * line — report sections routinely exceed tens of kilobytes, so a fixed-size
 * buffer would split them mid-object. Any line that is not a supported event is
 * demoted to a log line instead of taking the run down.
 */

import { type ChildProcessByStdio, spawn } from 'node:child_process'
import type { Readable } from 'node:stream'
import { createInterface } from 'node:readline'
import type { WebContents } from 'electron'
import { isSupportedEvent, type RunEvent, type RunRequest } from '@shared/protocol'

/** Grace period for SIGTERM to unwind `finally` blocks before SIGKILL. */
const KILL_GRACE_MS = 5000

export interface RunHandle {
  runId: string
  // stdin is closed: the request travels in argv, so nothing writes to it.
  child: ChildProcessByStdio<null, Readable, Readable>
}

export interface SpawnOptions {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
}

type Sink = (channel: string, payload: unknown) => void

export class RunManager {
  private runs = new Map<string, RunHandle>()

  constructor(private readonly sink: Sink) {}

  get activeRunIds(): string[] {
    return [...this.runs.keys()]
  }

  start(runId: string, request: RunRequest, options: SpawnOptions): void {
    const child = spawn(options.command, [...options.args, JSON.stringify(request)], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.runs.set(runId, { runId, child })

    const stdout = createInterface({ input: child.stdout, crlfDelay: Infinity })
    stdout.on('line', (line) => this.handleLine(runId, line))

    const stderr = createInterface({ input: child.stderr, crlfDelay: Infinity })
    stderr.on('line', (line) => this.sink('run:log', { runId, line }))

    child.on('error', (error) => {
      this.emit(runId, {
        v: 1,
        type: 'error',
        message: `无法启动分析引擎：${error.message}`,
        recoverable: false
      })
    })

    child.on('exit', (code, signal) => {
      this.runs.delete(runId)
      // A sidecar that dies immediately with no protocol output is the classic
      // macOS quarantine symptom ("nothing happens when I click start").
      this.sink('run:exit', { runId, code, signal })
    })
  }

  private handleLine(runId: string, line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      this.sink('run:log', { runId, line })
      return
    }
    if (!isSupportedEvent(parsed)) {
      this.sink('run:log', { runId, line })
      return
    }
    this.emit(runId, parsed)
  }

  private emit(runId: string, event: RunEvent): void {
    this.sink('run:event', { runId, event })
  }

  /** SIGTERM first so `end_checkpoint()` runs; SIGKILL only if it hangs. */
  cancel(runId: string): boolean {
    const handle = this.runs.get(runId)
    if (!handle) return false
    handle.child.kill('SIGTERM')
    setTimeout(() => {
      if (this.runs.has(runId)) handle.child.kill('SIGKILL')
    }, KILL_GRACE_MS).unref()
    return true
  }

  /** Called on app quit: an orphaned run keeps burning tokens after the window closes. */
  cancelAll(): void {
    for (const handle of this.runs.values()) handle.child.kill('SIGTERM')
  }
}

export function webContentsSink(getTarget: () => WebContents | null): Sink {
  return (channel, payload) => {
    const target = getTarget()
    if (target && !target.isDestroyed()) target.send(channel, payload)
  }
}
