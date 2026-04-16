#!/usr/bin/env node
// Injects test-data.json into a running Signal K server as delta updates.
// Usage: node inject-fixtures.js [ws-url] [fixture-path]

const WebSocket = require('ws')
const path = require('path')

const wsUrl =
  process.argv[2] || 'ws://localhost:3000/signalk/v1/stream?subscribe=none'
const fixturePath =
  process.argv[3] ||
  path.join(__dirname, '..', '..', 'fixtures', 'test-data.json')
const data = require(path.resolve(fixturePath))

// Group paths into delta values, skipping metadata and object paths that
// need special handling.
const skipKeys = ['_meta']
const objectPaths = [
  'navigation.position',
  'navigation.attitude',
  'navigation.course.nextPoint',
  'navigation.course.previousPoint'
]

function buildDelta(data) {
  const values = []

  for (const [skPath, val] of Object.entries(data)) {
    if (skipKeys.includes(skPath)) continue
    if (val === null || val === undefined) continue
    values.push({ path: skPath, value: val })
  }

  return {
    context: 'vessels.self',
    updates: [
      {
        source: {
          label: 'regression-test',
          type: 'test'
        },
        timestamp: data['navigation.datetime'] || new Date().toISOString(),
        values: values
      }
    ]
  }
}

const delta = buildDelta(data)

const ws = new WebSocket(wsUrl)

ws.on('open', () => {
  console.log('Connected to Signal K server')
  // Send delta 3 times with small delays to ensure all combined streams fire
  let sent = 0
  const interval = setInterval(() => {
    ws.send(JSON.stringify(delta))
    sent++
    console.log(`Sent delta ${sent}/3`)
    if (sent >= 3) {
      clearInterval(interval)
      // Wait for sentences to be generated before closing
      setTimeout(() => {
        console.log('Done injecting fixtures')
        ws.close()
        process.exit(0)
      }, 2000)
    }
  }, 500)
})

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message)
  process.exit(1)
})
