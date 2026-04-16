#!/usr/bin/env node
// Validates captured NMEA 0183 output against the test fixture.
// Usage: node validate-nmea.js <nmea-file> [fixture-path]
//
// Checks:
//   1. Structural: valid NMEA sentence format ($...*HH)
//   2. Checksum: XOR checksum matches
//   3. Semantic: key values match the source Signal K fixture (within epsilon)
//   4. Coverage: all expected sentence types present

const fs = require('fs')
const path = require('path')

const nmeaFile = process.argv[2]
const fixturePath =
  process.argv[3] ||
  path.join(__dirname, '..', '..', 'fixtures', 'test-data.json')

if (!nmeaFile) {
  console.error('Usage: node validate-nmea.js <nmea-file> [fixture-path]')
  process.exit(1)
}

const fixture = require(path.resolve(fixturePath))
const lines = fs
  .readFileSync(nmeaFile, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.startsWith('$'))

// All sentence types the plugin can generate
const allSentenceTypes = [
  'APB',
  'DBK',
  'DBS',
  'DBT',
  'DPT',
  'GGA',
  'GLL',
  'HDG',
  'HDM',
  'HDT',
  'MMB',
  'MTA',
  'MTW',
  'MWD',
  'MWV',
  'ROT',
  'RMB',
  'RMC',
  'RSA',
  'VHW',
  'VLW',
  'VPW',
  'VTG',
  'VWR',
  'VWT',
  'XDR',
  'XTE',
  'ZDA',
  'PNKEP',
  'PSILCD1',
  'PSILTBS'
]

const results = {
  total: lines.length,
  valid: 0,
  checksumFail: 0,
  parseFail: 0,
  semanticChecks: [],
  sentencesSeen: new Set(),
  failures: []
}

function computeChecksum(sentence) {
  let cs = 0
  for (let i = 1; i < sentence.length; i++) {
    cs ^= sentence.charCodeAt(i)
  }
  return cs.toString(16).toUpperCase().padStart(2, '0')
}

function parseSentence(line) {
  const starIdx = line.indexOf('*')
  if (starIdx < 0) return null
  const body = line.substring(0, starIdx)
  const checksum = line.substring(starIdx + 1).trim()
  const fields = body.split(',')
  const talkerSentence = fields[0].substring(1) // strip $
  // Extract sentence type: GP/II/IN prefix (2 chars) + sentence ID,
  // or proprietary P prefix
  let sentenceType
  if (talkerSentence.startsWith('P')) {
    sentenceType = talkerSentence // PNKEP, PSILCD1, PSILTBS
  } else {
    sentenceType = talkerSentence.substring(2) // strip talker (GP, II, IN)
  }
  return { body, checksum, fields, sentenceType, talkerSentence }
}

// Conversion helpers matching what the plugin does
function radsToDeg(r) {
  return (r * 180) / Math.PI
}
function toPositiveRadians(d) {
  let result = d % (2 * Math.PI)
  if (result < 0) result += 2 * Math.PI
  return result
}
function radsToPositiveDeg(r) {
  return radsToDeg(toPositiveRadians(r))
}
function msToKnots(v) {
  return (v * 3600) / 1852.0
}
function mToNm(v) {
  return v * 0.000539957
}

function approxEqual(actual, expected, epsilon, label) {
  const a = parseFloat(actual)
  const e = parseFloat(expected)
  if (isNaN(a) || isNaN(e))
    return { pass: false, label, actual, expected, reason: 'NaN' }
  const diff = Math.abs(a - e)
  if (diff > epsilon)
    return { pass: false, label, actual: a, expected: e, diff, epsilon }
  return { pass: true, label }
}

// Semantic validators per sentence type
const validators = {
  RMC(fields) {
    const checks = []
    // field 7 = SOG in knots
    const expectedSog = msToKnots(fixture['navigation.speedOverGround'])
    checks.push(approxEqual(fields[7], expectedSog.toFixed(1), 0.2, 'RMC SOG'))
    return checks
  },
  GGA(fields) {
    const checks = []
    // field 7 = satellites
    checks.push(
      approxEqual(
        fields[7],
        fixture['navigation.gnss.satellites'],
        0,
        'GGA satellites'
      )
    )
    // field 8 = HDOP
    checks.push(
      approxEqual(
        fields[8],
        fixture['navigation.gnss.horizontalDilution'],
        0.1,
        'GGA HDOP'
      )
    )
    return checks
  },
  HDM(fields) {
    // HDM is emitted by both HDM (direct) and HDMC (computed from true - variation).
    // The computed value differs by ~2 deg, so use a wider epsilon.
    const expected = radsToPositiveDeg(fixture['navigation.headingMagnetic'])
    return [approxEqual(fields[1], expected.toFixed(1), 2.0, 'HDM heading')]
  },
  HDT(fields) {
    // HDT is emitted by both HDT (direct) and HDTC (computed from magnetic + variation).
    const expected = radsToPositiveDeg(fixture['navigation.headingTrue'])
    return [approxEqual(fields[1], expected.toFixed(1), 2.0, 'HDT heading')]
  },
  DBT(fields) {
    const depthM = fixture['environment.depth.belowTransducer']
    return [approxEqual(fields[3], depthM.toFixed(2), 0.01, 'DBT depth m')]
  },
  DBS(fields) {
    const depthM = fixture['environment.depth.belowSurface']
    return [approxEqual(fields[3], depthM.toFixed(2), 0.01, 'DBS depth m')]
  },
  DBK(fields) {
    const depthM = fixture['environment.depth.belowKeel']
    return [approxEqual(fields[3], depthM.toFixed(2), 0.01, 'DBK depth m')]
  },
  MTA(fields) {
    const expected = fixture['environment.outside.temperature'] - 273.15
    return [approxEqual(fields[1], expected.toFixed(2), 0.01, 'MTA temp C')]
  },
  MTW(fields) {
    const expected = fixture['environment.water.temperature'] - 273.15
    return [approxEqual(fields[1], expected.toFixed(1), 0.1, 'MTW temp C')]
  },
  RSA(fields) {
    const expected = radsToDeg(fixture['steering.rudderAngle'])
    return [approxEqual(fields[1], expected.toFixed(2), 0.01, 'RSA angle')]
  },
  VTG(fields) {
    const cogT = radsToPositiveDeg(fixture['navigation.courseOverGroundTrue'])
    const cogM = radsToPositiveDeg(
      fixture['navigation.courseOverGroundMagnetic']
    )
    return [
      approxEqual(fields[1], cogT.toFixed(2), 0.1, 'VTG COG true'),
      approxEqual(fields[3], cogM.toFixed(2), 0.1, 'VTG COG mag')
    ]
  },
  ZDA(fields) {
    return [
      approxEqual(fields[2], '16', 0, 'ZDA day'),
      approxEqual(fields[3], '04', 0, 'ZDA month'),
      approxEqual(fields[4], '2026', 0, 'ZDA year')
    ]
  }
}

// Validate each line
for (const line of lines) {
  const parsed = parseSentence(line)
  if (!parsed) {
    results.parseFail++
    results.failures.push({ line, reason: 'no * checksum delimiter' })
    continue
  }

  // Checksum validation
  const computed = computeChecksum(parsed.body)
  if (computed !== parsed.checksum.toUpperCase()) {
    results.checksumFail++
    results.failures.push({
      line,
      reason: `checksum mismatch: expected ${computed}, got ${parsed.checksum}`
    })
    continue
  }

  results.valid++

  // Track sentence type
  // For proprietary, use first part; for standard, use sentence ID
  let typeKey = parsed.sentenceType
  // Normalize: PNKEP01 -> PNKEP, etc.
  for (const known of allSentenceTypes) {
    if (typeKey.startsWith(known)) {
      results.sentencesSeen.add(known)
      typeKey = known
      break
    }
  }

  // Semantic validation
  if (validators[typeKey]) {
    const checks = validators[typeKey](parsed.fields)
    for (const c of checks) {
      results.semanticChecks.push(c)
    }
  }
}

// Output report
console.log('\n=== NMEA Regression Test Results ===\n')
console.log(`Total sentences:    ${results.total}`)
console.log(`Valid (checksum OK): ${results.valid}`)
console.log(`Checksum failures:   ${results.checksumFail}`)
console.log(`Parse failures:      ${results.parseFail}`)

console.log('\n--- Coverage ---')
const seen = [...results.sentencesSeen].sort()
const missing = allSentenceTypes
  .filter((t) => !results.sentencesSeen.has(t))
  .sort()
console.log(`Sentence types seen (${seen.length}): ${seen.join(', ')}`)
if (missing.length > 0) {
  console.log(`Missing types (${missing.length}): ${missing.join(', ')}`)
}

console.log('\n--- Semantic Checks ---')
const passed = results.semanticChecks.filter((c) => c.pass)
const failed = results.semanticChecks.filter((c) => !c.pass)
console.log(`Passed: ${passed.length}/${results.semanticChecks.length}`)
if (failed.length > 0) {
  console.log('Failures:')
  for (const f of failed) {
    console.log(
      `  ${f.label}: actual=${f.actual}, expected=${f.expected}, diff=${f.diff}, epsilon=${f.epsilon}`
    )
  }
}

if (results.failures.length > 0) {
  console.log('\n--- Structural Failures ---')
  for (const f of results.failures.slice(0, 10)) {
    console.log(`  ${f.reason}: ${f.line.substring(0, 80)}`)
  }
}

console.log('\n--- Sample Output (first 15 lines) ---')
for (const line of lines.slice(0, 15)) {
  console.log(`  ${line}`)
}

// Exit code: 0 if all checks pass, 1 if any failures
const exitCode =
  results.checksumFail + results.parseFail + failed.length > 0 ? 1 : 0
process.exit(exitCode)
