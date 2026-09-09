/**
 * Exercises the stdout reader against a real child process, since the failure
 * modes that matter (partial lines, huge lines, garbage on stdout, a sidecar
 * that dies instantly) only show up with a live pipe.
 */

import { describe, expect, it } from 'vitest'
import type { RunRequest } from '@shared/protocol'
import { RunManager } from './run-manager'

const request: RunRequest = { ticker: 'NVDA', date: '2026-01-02', analysts: ['market'] }

function collect(script: string): Promise<{ channel: string; payload: any }[]> {
  return new Promise((resolve) => {
    const seen: { channel: string; payload: any }[] = []
    const manager = new RunManager((channel, payload) => {
      seen.push({ channel, payload })
      if (channel === 'run:exit') resolve(seen)
    })
    manager.start('r1', request, {
      command: process.execPath,
      args: ['-e', script],
      cwd: process.cwd(),
      env: { ...process.env } as Record<string, string>
    })
  })
}

describe('RunManager', () => {
  it('forwards supported events and demotes everything else to logs', async () => {
    const seen = await collect(`
      process.stdout.write(JSON.stringify({ v: 1, type: 'message', role: 'Agent', content: 'hi' }) + '\\n');
      process.stdout.write('not json at all\\n');
      process.stdout.write(JSON.stringify({ v: 99, type: 'message' }) + '\\n');
      process.stderr.write('a log line\\n');
    `)
    const events = seen.filter((item) => item.channel === 'run:event')
    expect(events).toHaveLength(1)
    expect(events[0].payload.event.content).toBe('hi')

    const logs = seen.filter((item) => item.channel === 'run:log').map((item) => item.payload.line)
    expect(logs).toContain('not json at all')
    expect(logs).toContain('a log line')
    // A future protocol version is logged, never rendered as if understood.
    expect(logs.some((line: string) => line.includes('"v":99'))).toBe(true)
  })

  it('keeps very long report sections intact', async () => {
    const seen = await collect(`
      const content = 'x'.repeat(200000);
      process.stdout.write(JSON.stringify({ v: 1, type: 'report_section', section: 'market_report', content }) + '\\n');
    `)
    const event = seen.find((item) => item.channel === 'run:event')?.payload.event
    expect(event.content).toHaveLength(200000)
  })

  it('reports a non-zero exit so the UI can explain a dead sidecar', async () => {
    const seen = await collect(`process.exit(3);`)
    const exit = seen.find((item) => item.channel === 'run:exit')
    expect(exit?.payload.code).toBe(3)
  })

  it('emits an error event when the binary cannot be spawned', async () => {
    const seen: { channel: string; payload: any }[] = []
    const manager = new RunManager((channel, payload) => seen.push({ channel, payload }))
    manager.start('r1', request, {
      command: '/definitely/not/a/binary',
      args: [],
      cwd: process.cwd(),
      env: {}
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    const error = seen.find((item) => item.channel === 'run:event')?.payload.event
    expect(error.type).toBe('error')
    expect(error.recoverable).toBe(false)
  })

  it('tracks active runs and stops them on quit', async () => {
    const manager = new RunManager(() => {})
    manager.start('r1', request, {
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 10000)'],
      cwd: process.cwd(),
      env: { ...process.env } as Record<string, string>
    })
    expect(manager.activeRunIds).toEqual(['r1'])
    expect(manager.cancel('r1')).toBe(true)
    expect(manager.cancel('missing')).toBe(false)
    manager.cancelAll()
  })
})
