const assert = require('assert')

const stubApp = { debug: () => {}, error: () => {}, emit: () => {} }
const load = name => require(`../sentences/${name}.js`)(stubApp)

function expectedChecksum (body) {
  let c = 0
  for (let i = 0; i < body.length; i++) c ^= body.charCodeAt(i)
  return '*' + c.toString(16).toUpperCase().padStart(2, '0')
}
function assertValidSentence (sentence) {
  const m = /^\$([^*]+)\*([0-9A-F]{2})$/.exec(sentence)
  assert.ok(m, `not a well-formed NMEA sentence: ${sentence}`)
  assert.equal('*' + m[2], expectedChecksum(m[1]), `bad checksum in ${sentence}`)
}

describe('sentence encoders', function () {
  describe('DBT - Depth Below Transducer', function () {
    it('encodes at 10 m', function () {
      const enc = load('DBT')
      assert.equal(enc.sentence, 'DBT')
      assert.equal(enc.keys[0], 'environment.depth.belowTransducer')
      const s = enc.f(10)
      assert.ok(s.startsWith('$IIDBT,32.8,f,10.00,M,5.5,F*'))
      assertValidSentence(s)
    })
    it('encodes at 31.38 m: feet=103.0, meters=31.38, fathoms=17.2', function () {
      const s = load('DBT').f(31.38)
      assert.ok(s.startsWith('$IIDBT,103.0,f,31.38,M,17.2,F*'))
      assertValidSentence(s)
    })
    it('encodes 0', function () {
      const s = load('DBT').f(0)
      assert.ok(s.startsWith('$IIDBT,0.0,f,0.00,M,0.0,F*'))
      assertValidSentence(s)
    })
  })

  describe('DBK - Depth Below Keel', function () {
    it('encodes at 31.38 m', function () {
      const enc = load('DBK')
      assert.equal(enc.sentence, 'DBK')
      const s = enc.f(31.38)
      assert.ok(s.startsWith('$IIDBK,103.0,f,31.38,M,17.2,F*'))
      assertValidSentence(s)
    })
  })

  describe('DBS - Depth Below Surface', function () {
    it('encodes at 31.38 m', function () {
      const enc = load('DBS')
      assert.equal(enc.sentence, 'DBS')
      const s = enc.f(31.38)
      assert.ok(s.startsWith('$IIDBS,103.0,f,31.38,M,17.2,F*'))
      assertValidSentence(s)
    })
  })

  describe('DPT (transducer to keel)', function () {
    it('forces the offset to negative regardless of input sign', function () {
      const s = load('DPT').f(10.5, 0.75)
      assert.ok(s.startsWith('$IIDPT,10.50,-0.750*'))
      assertValidSentence(s)
    })
    it('keeps the offset negative when input is already negative', function () {
      const s = load('DPT').f(10.5, -0.75)
      assert.ok(s.startsWith('$IIDPT,10.50,-0.750*'))
    })
  })

  describe('DPT-surface (surface to transducer)', function () {
    it('preserves a positive offset', function () {
      const s = load('DPT-surface').f(9.21, 1.1)
      assert.ok(s.startsWith('$IIDPT,9.21,1.100*'))
      assertValidSentence(s)
    })
    it('preserves a negative offset', function () {
      const s = load('DPT-surface').f(5, -0.2)
      assert.ok(s.startsWith('$IIDPT,5.00,-0.200*'))
    })
  })

  describe('HDG - heading magnetic + variation', function () {
    const enc = load('HDG')
    it('emits E for variation when heading is positive', function () {
      const s = enc.f(Math.PI, 0.1)
      assert.ok(s.startsWith('$IIHDG,180.00,5.73,E,,*'))
      assertValidSentence(s)
    })
    it('emits W and abs(variation) when heading is negative', function () {
      const s = enc.f(-Math.PI / 2, 0.1)
      assert.ok(s.startsWith('$IIHDG,-90.00,5.73,W,,*'))
      assertValidSentence(s)
    })
    it('omits variation fields when magneticVariation is empty', function () {
      const s = enc.f(Math.PI, '')
      assert.ok(s.startsWith('$IIHDG,180.00,,,,*'))
      assertValidSentence(s)
    })
    it('emits E when heading is exactly 0', function () {
      const s = enc.f(0, 0.1)
      assert.ok(s.includes(',E,,*'), `got: ${s}`)
    })
  })

  describe('HDM - heading magnetic', function () {
    it('emits heading in degrees to 1 decimal', function () {
      const enc = load('HDM')
      assert.equal(enc.sentence, 'HDM')
      const s = enc.f(Math.PI)
      assert.ok(s.startsWith('$IIHDM,180.0,M*'))
      assertValidSentence(s)
    })
  })

  describe('HDT - heading true', function () {
    it('emits heading in degrees to 1 decimal', function () {
      const enc = load('HDT')
      assert.equal(enc.sentence, 'HDT')
      const s = enc.f(Math.PI)
      assert.ok(s.startsWith('$IIHDT,180.0,T*'))
      assertValidSentence(s)
    })
  })

  describe('HDMC - magnetic heading computed from true + variation', function () {
    it('sums true heading and magnetic variation', function () {
      const enc = load('HDMC')
      assert.equal(enc.sentence, 'HDM')
      const s = enc.f(Math.PI / 2, 0.1)
      assert.ok(s.startsWith('$IIHDM,95.7,M*'))
      assertValidSentence(s)
    })
  })

  describe('HDTC - true heading computed from magnetic + variation', function () {
    const enc = load('HDTC')
    it('sums magnetic and variation', function () {
      const s = enc.f(Math.PI / 2, 0.1)
      assert.ok(s.startsWith('$IIHDT,95.7,T*'))
      assertValidSentence(s)
    })
    it('wraps when sum exceeds 2*PI', function () {
      const s = enc.f(2 * Math.PI - 0.1, 0.3)
      assert.ok(s.startsWith('$IIHDT,11.5,T*'))
    })
    it('wraps when sum is negative', function () {
      const s = enc.f(0.1, -0.3)
      assert.ok(s.startsWith('$IIHDT,348.5,T*'))
    })
    it('leaves heading at 0 when sum is exactly 0', function () {
      const s = enc.f(0, 0)
      assert.ok(s.startsWith('$IIHDT,0.0,T*'), `got: ${s}`)
    })
    it('leaves heading at 360 when sum is exactly 2*PI', function () {
      const s = enc.f(Math.PI, Math.PI)
      assert.ok(s.startsWith('$IIHDT,360.0,T*'), `got: ${s}`)
    })
  })

  describe('MWD - wind direction true/magnetic + speed', function () {
    it('encodes directions and speeds', function () {
      const enc = load('MWD')
      assert.equal(enc.sentence, 'MWD')
      const s = enc.f(Math.PI, 0, 5)
      assert.ok(s.startsWith('$IIMWD,180.00,T,180.00,M,9.72,N,5.00,M*'))
      assertValidSentence(s)
    })
    it('applies magnetic variation', function () {
      const s = load('MWD').f(Math.PI / 2, 0.1, 3)
      assert.ok(s.startsWith('$IIMWD,90.00,T,84.27,M,'))
    })
  })

  describe('VWR - apparent wind angle + speed', function () {
    const enc = load('VWR')
    it('emits R for starboard (positive angle)', function () {
      const s = enc.f(1, 0.5)
      assert.ok(s.startsWith('$IIVWR,28.65,R,1.94,N,1.00,M,3.60,K*'))
      assertValidSentence(s)
    })
    it('emits L and abs(angle) for port (negative angle)', function () {
      const s = enc.f(1, -0.5)
      assert.ok(s.startsWith('$IIVWR,28.65,L,1.94,N,1.00,M,3.60,K*'))
    })
    it('emits R when angle is exactly 0', function () {
      const s = enc.f(5, 0)
      assert.ok(s.startsWith('$IIVWR,0.00,R,'), `got: ${s}`)
    })
  })

  describe('VWT - true wind angle + speed', function () {
    it('encodes angle in degrees and speeds in three units', function () {
      const enc = load('VWT')
      assert.equal(enc.sentence, 'VWT')
      const s = enc.f(Math.PI / 2, 2)
      assert.ok(s.startsWith('$IIVWT,90.00,a,3.89,N,2.00,M,7.20,K*'))
      assertValidSentence(s)
    })
  })

  describe('VTG - track made good and ground speed', function () {
    it('encodes COG true, COG magnetic, speed in knots and km/h', function () {
      const enc = load('VTG')
      const s = enc.f(Math.PI, Math.PI, 5)
      assert.ok(s.startsWith('$IIVTG,180.00,T,180.00,M,9.72,N,18.00,K,A*'))
      assertValidSentence(s)
    })
  })

  describe('VHW - speed and heading through water', function () {
    const enc = load('VHW')
    it('encodes heading true + magnetic and speed', function () {
      const s = enc.f(Math.PI, 0, 2)
      assert.ok(s.startsWith('$IIVHW,180.0,T,180.0,M,3.89,N,7.20,K*'))
      assertValidSentence(s)
    })
    it('wraps magnetic heading above 2*PI', function () {
      const s = enc.f(2 * Math.PI - 0.1, 0.3, 1)
      assert.ok(s.startsWith('$IIVHW,354.3,T,11.5,M,'))
    })
    it('wraps magnetic heading below 0', function () {
      const s = enc.f(0.1, -0.3, 1)
      assert.ok(s.startsWith('$IIVHW,5.7,T,348.5,M,'))
    })
    it('leaves magnetic heading at 0 when sum is exactly 0', function () {
      const s = enc.f(0, 0, 0)
      assert.ok(s.startsWith('$IIVHW,0.0,T,0.0,M,'), `got: ${s}`)
    })
    it('leaves magnetic heading at 360 when sum is exactly 2*PI', function () {
      const s = enc.f(0, 2 * Math.PI, 1)
      assert.ok(s.startsWith('$IIVHW,0.0,T,360.0,M,'), `got: ${s}`)
    })
  })

  describe('VPW - speed parallel to wind', function () {
    it('encodes VMG in knots and m/s', function () {
      const enc = load('VPW')
      assert.equal(enc.sentence, 'VPW')
      const s = enc.f(5)
      assert.ok(s.startsWith('$IIVPW,9.72,N,5.00,M*'))
      assertValidSentence(s)
    })
  })

  describe('VLW - total and trip log', function () {
    it('encodes log and trip distances in nautical miles', function () {
      const enc = load('VLW')
      assert.equal(enc.sentence, 'VLW')
      const s = enc.f(1852, 80000)
      assert.ok(s.startsWith('$IIVLW,1.00,N,43.20,N*'))
      assertValidSentence(s)
    })
    it('encodes zero distances', function () {
      const s = load('VLW').f(0, 0)
      assert.ok(s.startsWith('$IIVLW,0.00,N,0.00,N*'))
      assertValidSentence(s)
    })
  })

  describe('ROT - rate of turn', function () {
    it('converts rad/s to deg/min', function () {
      const enc = load('ROT')
      assert.equal(enc.sentence, 'ROT')
      const s = enc.f(1)
      assert.ok(s.startsWith('$IIROT,3437.75,A*'))
      assertValidSentence(s)
    })
    it('handles a negative rate', function () {
      const s = load('ROT').f(-0.01)
      assert.ok(s.startsWith('$IIROT,-34.38,A*'))
    })
  })

  describe('RSA - rudder sensor angle', function () {
    it('converts rudder angle from rad to deg', function () {
      const enc = load('RSA')
      assert.equal(enc.sentence, 'RSA')
      const s = enc.f(Math.PI / 4)
      assert.ok(s.startsWith('$IIRSA,45.00,A,,*'))
      assertValidSentence(s)
    })
  })

  describe('ZDA - UTC time and date', function () {
    it('encodes a UTC ISO datetime', function () {
      const s = load('ZDA').f('2015-12-05T17:28:14Z')
      assert.ok(s.startsWith('$IIZDA,172814.020,05,12,2015,,*'))
      assertValidSentence(s)
    })
    it('pads single-digit hours, minutes, seconds, day and month', function () {
      const s = load('ZDA').f('2020-03-07T01:02:03Z')
      assert.ok(s.startsWith('$IIZDA,010203.020,07,03,2020,,*'), `got: ${s}`)
    })
  })

  describe('MTW - water temperature (K → C)', function () {
    it('converts K to C with 1 decimal', function () {
      const enc = load('MTW')
      assert.equal(enc.sentence, 'MTW')
      const s = enc.f(293.15)
      assert.ok(s.startsWith('$IIMTW,20.0,C*'))
      assertValidSentence(s)
    })
    it('handles a temperature equal to 0 K', function () {
      const s = load('MTW').f(273.15)
      assert.ok(s.startsWith('$IIMTW,0.0,C*'))
    })
  })

  describe('MTA - air temperature (K → C)', function () {
    it('converts K to C with 2 decimals', function () {
      const s = load('MTA').f(308.0)
      assert.ok(s.startsWith('$IIMTA,34.85,C*'))
      assertValidSentence(s)
    })
  })

  describe('MMB - barometric pressure', function () {
    it('encodes pressure in inHg and bar', function () {
      const enc = load('MMB')
      assert.equal(enc.sentence, 'MMB')
      const s = enc.f(100000)
      assert.ok(s.startsWith('$IIMMB,29.5300,I,1.0000,B*'))
      assertValidSentence(s)
    })
  })

  describe('XDR (Barometer)', function () {
    it('emits $IIXDR,P,<bar>,B,Barometer', function () {
      const s = load('XDRBaro').f(102481)
      assert.ok(s.startsWith('$IIXDR,P,1.0248,B,Barometer*'))
      assertValidSentence(s)
    })
  })

  describe('XDR (TempAir)', function () {
    it('emits $IIXDR,C,<celsius>,C,TempAir', function () {
      const s = load('XDRTemp').f(307.95)
      assert.ok(s.startsWith('$IIXDR,C,34.80,C,TempAir*'))
      assertValidSentence(s)
    })
  })

  describe('XDR (PTCH/ROLL)', function () {
    it('emits pitch and roll in degrees', function () {
      const s = load('XDRNA').f({ pitch: -0.012, roll: 0.016 })
      assert.ok(s.startsWith('$IIXDR,A,-0.7,D,PTCH,A,0.9,D,ROLL*'))
      assertValidSentence(s)
    })
  })

  describe('XTE - cross-track error (rhumb line)', function () {
    const enc = load('XTE')
    it('emits L when xte is positive', function () {
      const s = enc.f(100)
      assert.ok(s.startsWith('$IIXTE,A,A,0.054,L,N*'))
      assertValidSentence(s)
    })
    it('emits R when xte is negative (signed magnitude in field)', function () {
      const s = enc.f(-100)
      assert.ok(s.startsWith('$IIXTE,A,A,-0.054,R,N*'))
    })
    it('emits L when xte is exactly 0', function () {
      const s = enc.f(0)
      assert.ok(s.includes(',0.000,L,'), `got: ${s}`)
    })
  })

  describe('XTE-GC - cross-track error (great circle)', function () {
    const enc = load('XTE-GC')
    it('emits L when xte is positive', function () {
      const s = enc.f(100)
      assert.ok(s.startsWith('$IIXTE,A,A,0.054,L,N*'))
      assertValidSentence(s)
    })
    it('emits R when xte is negative', function () {
      const s = enc.f(-100)
      assert.ok(s.startsWith('$IIXTE,A,A,-0.054,R,N*'))
    })
    it('emits L when xte is exactly 0', function () {
      const s = enc.f(0)
      assert.ok(s.includes(',0.000,L,'), `got: ${s}`)
    })
  })

  describe('APB - autopilot info', function () {
    const enc = load('APB')
    it('encodes xte (L for positive), bearings and headings', function () {
      const s = enc.f(100, Math.PI / 2, Math.PI / 4, Math.PI / 3)
      assert.ok(s.startsWith('$IIAPB,A,A,0.054,L,N,V,V,90,T,00,45,T,60,M*'))
      assertValidSentence(s)
    })
    it('emits R when xte is negative', function () {
      const s = enc.f(-100, 0, 0, 0)
      assert.ok(s.startsWith('$IIAPB,A,A,0.054,R,N,V,V,'))
    })
    it('emits R when xte is exactly 0', function () {
      const s = enc.f(0, 0, 0, 0)
      assert.ok(s.includes(',R,N,'))
    })
  })

  describe('RMB - heading and distance to waypoint', function () {
    const enc = load('RMB')
    it('encodes xte, waypoint lat/lon, distance and bearing', function () {
      const s = enc.f(0.2, 37.39109795066667, -122.03782631066667, 5.3, Math.PI / 4)
      assert.ok(s.startsWith('$IIRMB,0.20,L,3723.4659,N,12202.2696,W,5.30,45.00,V,*'))
      assertValidSentence(s)
    })
    it('emits R when xte is negative', function () {
      const s = enc.f(-0.2, 0, 0, 1, 0)
      assert.ok(s.startsWith('$IIRMB,-0.20,R,'))
    })
    it('emits L when xte is exactly 0', function () {
      const s = enc.f(0, 37.39109795066667, -122.03782631066667, 1, 0)
      assert.ok(s.startsWith('$IIRMB,0.00,L,'), `got: ${s}`)
    })
  })

  describe('GLL - geographical position + time', function () {
    const enc = load('GLL')
    // GLL currently uses local time (getHours), unlike the other time-encoding
    // sentences that use UTC. We only assert structure so the test is stable
    // across runners' timezones.
    it('encodes position and a 6-digit time', function () {
      assert.equal(enc.sentence, 'GLL')
      const s = enc.f('2015-12-05T17:28:14Z', { longitude: -122.03782631066667, latitude: 37.39109795066667 })
      assert.ok(/^\$GPGLL,3723\.4659,N,12202\.2696,W,\d{6}\.020,A\*[0-9A-F]{2}$/.test(s))
      assertValidSentence(s)
    })
    it('returns undefined when position is null', function () {
      assert.strictEqual(enc.f('2015-12-05T17:28:14Z', null), undefined)
    })
    it('pads time to 6 digits', function () {
      const s = enc.f('2020-01-01T00:00:00Z', { longitude: 0, latitude: 0 })
      assert.ok(/,\d{6}\.020,A\*/.exec(s), `expected 6-digit time in: ${s}`)
    })
  })

  describe('PNKEP01 - target polar speed', function () {
    it('encodes target speed in knots and km/h', function () {
      const s = load('PNKEP01').f(5)
      assert.ok(s.startsWith('$PNKEP,01,9.72,N,18.00,K*'))
      assertValidSentence(s)
    })
  })

  describe('PNKEP02 - COG on other tack', function () {
    it('encodes angle in degrees', function () {
      const s = load('PNKEP02').f(Math.PI)
      assert.ok(s.startsWith('$PNKEP,02,180.00*'))
      assertValidSentence(s)
    })
  })

  describe('PNKEP03 - polar/VMG/optimum angle', function () {
    it('encodes angle and ratios as percentages', function () {
      const s = load('PNKEP03').f(Math.PI / 4, 0.9, 0.85)
      assert.ok(s.startsWith('$PNKEP,03,45.00,90.00,85.00*'))
      assertValidSentence(s)
    })
  })

  describe('PNKEP99 - debug', function () {
    it('emits debug sentence with raw conversions', function () {
      const s = load('PNKEP99').f(0, 0, 0, 0, 0, 0, 0)
      assert.ok(s.startsWith('$PNKEP,99,0,0,0,0,0,0,0*'))
      assertValidSentence(s)
    })
  })

  describe('PSILCD1 - polar speed + target wind angle', function () {
    it('encodes in knots and degrees', function () {
      const s = load('PSILCD1').f(5, Math.PI / 4)
      assert.ok(s.startsWith('$PSILCD1,9.72,45.00*'))
      assertValidSentence(s)
    })
  })

  describe('PSILTBS - target boat speed', function () {
    it('encodes in knots', function () {
      const s = load('PSILTBS').f(5)
      assert.ok(s.startsWith('$PSILTBS,9.72,N*'))
      assertValidSentence(s)
    })
  })

  describe('GGA - method-quality switch and edge cases', function () {
    const enc = load('GGA')
    const time = '2015-12-05T17:28:14Z'
    const pos = { longitude: -122.03782631066667, latitude: 37.39109795066667 }

    const qualityMapping = [
      ['no GPS', '0'],
      ['GNSS Fix', '1'],
      ['DGNSS fix', '2'],
      ['Precise GNSS', '3'],
      ['RTK fixed integer', '4'],
      ['RTK float', '5'],
      ['Estimated (DR) mode', '6'],
      ['Manual input', '7'],
      ['Simulator mode', '8']
    ]
    qualityMapping.forEach(([label, expected]) => {
      it(`maps '${label}' to quality code ${expected}`, function () {
        const s = enc.f(time, pos, label, 7, 1.0, 10.5, -25.0, 1.5, 'R1')
        assert.ok(s.includes(`,W,${expected},7,`), `got: ${s}`)
        assertValidSentence(s)
      })
    })

    it('treats an unknown quality label as 0', function () {
      const s = enc.f(time, pos, 'unknown-label', 0, 0, 0, 0, null, null)
      assert.ok(s.includes(',W,0,0,'), `got: ${s}`)
    })

    it('returns undefined when position is missing', function () {
      assert.strictEqual(enc.f(time, null, 0, 0, 0, 0, 0, null, null), undefined)
    })

    it('falls back to current time when datetime is an empty string', function () {
      const s = enc.f('', pos, 0, 0, 0, 0, 0, null, null)
      assert.ok(/^\$GPGGA,\d{6},/.test(s))
    })

    it('falls back to current time when datetime is whitespace', function () {
      const s = enc.f('   ', pos, 0, 0, 0, 0, 0, null, null)
      assert.ok(/^\$GPGGA,\d{6},/.test(s))
    })

    it('replaces null differentialAge and differentialReference with empty fields', function () {
      const s = enc.f(time, pos, 'no GPS', 0, 0, 0, 0, null, null)
      assert.ok(/,M,,\*/.test(s))
    })

    it('replaces 0 differentialAge and "" differentialReference with empty fields', function () {
      const s = enc.f(time, pos, 'DGNSS fix', 6, 1.2, 18.893, -25.669, 0, '')
      assert.ok(/,M,,\*/.test(s), `got: ${s}`)
    })

    it('replaces a `false` differentialReference rather than emitting "false"', function () {
      const s = enc.f(time, pos, 'DGNSS fix', 6, 1.2, 18.893, -25.669, null, false)
      assert.ok(!s.includes('false'), `output should not include the literal 'false': ${s}`)
    })

    it('preserves non-null differentialAge and differentialReference', function () {
      const s = enc.f(time, pos, 'DGNSS fix', 6, 1.2, 18.893, -25.669, 2.0, '0031')
      assert.equal(s, '$GPGGA,172814,3723.4659,N,12202.2696,W,2,6,1.2,18.9,M,-25.7,M,2,0031*41')
    })

    it('pads single-digit hour/minute/second with leading zeros', function () {
      const s = enc.f('2020-01-02T03:04:05Z', pos, 0, 0, 0, 0, 0, null, null)
      assert.ok(/^\$GPGGA,030405,/.test(s), `got: ${s}`)
    })
  })

  describe('RMC - datetime + variation branches', function () {
    const enc = load('RMC')
    const pos = { longitude: 5, latitude: 6 }

    it('emits empty date + time when datetime is an empty string', function () {
      const s = enc.f('', '1', '2', pos, '')
      assert.equal(s, '$GPRMC,,A,0600.0000,N,00500.0000,E,1.9,114.6,,,E*51')
    })

    it('emits date + time when datetime is ISO', function () {
      const s = enc.f('2020-03-15T04:05:06Z', '1', '2', pos, '')
      assert.ok(s.startsWith('$GPRMC,040506,A,0600.0000,N,00500.0000,E,1.9,114.6,150320,,E*'))
      assertValidSentence(s)
    })

    it('emits W and abs(variation) when variation is negative', function () {
      const s = enc.f('', '1', '2', pos, -Math.PI)
      assert.ok(s.endsWith('180.0,W*' + s.split('*')[1]))
    })

    it('preserves magnitude of a small negative variation', function () {
      const s = enc.f('', '1', '2', pos, -0.1)
      assert.ok(s.includes(',5.7,W*'), `got: ${s}`)
    })

    it('emits variation as-is when it is not a number', function () {
      const s = enc.f('', '1', '2', pos, 'XYZ')
      assert.ok(s.includes(',XYZ,E*'))
    })

    it('pads single-digit day and month', function () {
      const s = enc.f('2021-01-02T10:20:30Z', '1', '2', pos, '')
      assert.ok(s.includes(',102030,'), `time should be "102030": ${s}`)
      assert.ok(s.includes(',020121,'), `date should be "020121": ${s}`)
    })

    it('pads year to last two digits', function () {
      const s = enc.f('2005-06-10T10:20:30Z', '1', '2', pos, '')
      assert.ok(s.includes(',100605,'), `expected date "100605": ${s}`)
    })
  })

  describe('defaults arrays', function () {
    it('HDG uses [undefined, ""] so variation can be absent', function () {
      assert.deepStrictEqual(load('HDG').defaults, [undefined, ''])
    })
    it('RMC uses ["", undefined, undefined, undefined, ""]', function () {
      assert.deepStrictEqual(load('RMC').defaults, ['', undefined, undefined, undefined, ''])
    })
    it('GGA uses the full defaults array for its 9 inputs', function () {
      assert.deepStrictEqual(load('GGA').defaults, [
        null, null, 0, 0, 0, 0, 0, null, null
      ])
    })
  })

  describe('VWR legacy optionKey', function () {
    it("exposes optionKey 'VWR'", function () {
      assert.equal(load('VWR').optionKey, 'VWR')
    })
  })
})
