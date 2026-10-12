export const dashboard = {
  state: {
    idle: 'Idle',
    running: 'Running',
    finished: 'Finished',
    failed: 'Failed',
    cancelled: 'Cancelled'
  },
  pipeline: {
    stock: 'Stock pipeline',
    crypto: 'Crypto pipeline'
  },
  stat: {
    elapsed: 'Elapsed',
    toolCalls: 'Tool calls',
    reports: 'Reports',
    current: 'Current'
  },
  stop: 'Stop',
  column: {
    pipeline: 'Agent pipeline',
    stream: 'Event stream',
    results: 'Results'
  },
  log: {
    system: 'System',
    error: 'Error',
    started: 'Started {{ticker}} · {{date}}',
    finished: 'Analysis finished · $t(domain:rating.{{rating}})',
    finishedNoRating: 'Analysis finished · no rating'
  },
  stream: {
    all: 'All',
    tool: 'Tools',
    msg: 'Messages',
    sys: 'System',
    count_one: '{{count}} entry',
    count_other: '{{count}} entries'
  },
  reports: {
    followLatest: 'Follow latest',
    emptyTitle: 'Nothing generated yet',
    emptyDescription: 'This section fills in once its agent finishes.'
  }
}
