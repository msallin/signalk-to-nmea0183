const assert = require('assert')

const { createAppWithPlugin } = require('./testutil')

// Parse the comma-separated body of an NMEA sentence and strip the checksum
// from the final field.
// Input:  "$IIVWT,90.00,R,3.89,N,2.00,M,7.20,K*73"
// Output: ["$IIVWT", "90.00", "R", "3.89", "N", "2.00", "M", "7.20", "K"]
function parseSentence (sentence) {
  const star = sentence.indexOf('*')
  const body = star >= 0 ? sentence.substring(0, star) : sentence
  return body.split(',')
}

function pushVWT (app, angleRad, speedMs) {
  app.streambundle
    .getSelfStream('environment.wind.angleTrueWater')
    .push(angleRad)
  app.streambundle.getSelfStream('environment.wind.speedTrue').push(speedMs)
}

describe('VWT', function () {
  it('emits a VWT sentence with the expected layout', done => {
    const onEmit = (event, value) => {
      const parts = parseSentence(value)
      assert.equal(parts[0], '$IIVWT')
      assert.equal(parts.length, 9, 'expected 9 comma-separated fields')
      assert.equal(parts[4], 'N')
      assert.equal(parts[6], 'M')
      assert.equal(parts[8], 'K')
      assert.match(value, /\*[0-9A-F]{2}$/, 'expected trailing *HH checksum')
      done()
    }
    const app = createAppWithPlugin(onEmit, 'VWT')
    pushVWT(app, Math.PI / 2, 2)
  })

  it('converts true wind speed to knots, m/s and km/h', done => {
    // 2 m/s -> 3.89 kn, 2.00 m/s, 7.20 km/h
    const onEmit = (event, value) => {
      const parts = parseSentence(value)
      assert.equal(parts[3], '3.89')
      assert.equal(parts[5], '2.00')
      assert.equal(parts[7], '7.20')
      done()
    }
    const app = createAppWithPlugin(onEmit, 'VWT')
    pushVWT(app, Math.PI / 2, 2)
  })

  it('handles a different speed value', done => {
    // 5.14 m/s ~ 10 knots
    const onEmit = (event, value) => {
      const parts = parseSentence(value)
      assert.equal(parts[3], '9.99')
      assert.equal(parts[5], '5.14')
      assert.equal(parts[7], '18.50')
      done()
    }
    const app = createAppWithPlugin(onEmit, 'VWT')
    pushVWT(app, Math.PI / 2, 5.14)
  })
})
