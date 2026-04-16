const assert = require('assert')
const {
  toSentence,
  radsToDeg,
  msToKnots,
  msToKM,
  toNmeaDegreesLatitude,
  toNmeaDegreesLongitude,
  fixAngle,
  radsToPositiveDeg,
  mToNm
} = require('../nmea.js')

describe('nmea', function () {
  describe('toSentence()', function () {
    it('joins parts with comma and appends the XOR checksum', function () {
      assert.equal(
        toSentence(['$IIHDT', '200.1', 'T']),
        '$IIHDT,200.1,T*21'
      )
    })

    it('checksum is two uppercase hex digits prefixed with *', function () {
      const result = toSentence(['$IIMWV', '180.00', 'R', '2.00', 'M', 'A'])
      assert.equal(result, '$IIMWV,180.00,R,2.00,M,A*35')
      assert.ok(/\*[0-9A-F]{2}$/.test(result))
    })

    it('checksum does not include the leading $', function () {
      assert.equal(
        toSentence(['$IIHDM', '206.7', 'M']),
        '$IIHDM,206.7,M*21'
      )
    })
  })

  describe('radsToDeg()', function () {
    it('converts 0 to 0', function () {
      assert.equal(radsToDeg(0), 0)
    })
    it('converts PI to 180', function () {
      assert.equal(radsToDeg(Math.PI), 180)
    })
    it('converts PI/2 to 90', function () {
      assert.equal(radsToDeg(Math.PI / 2), 90)
    })
    it('converts negative radians to negative degrees', function () {
      assert.equal(radsToDeg(-Math.PI), -180)
    })
    it('converts 2*PI to 360', function () {
      assert.equal(radsToDeg(2 * Math.PI), 360)
    })
  })

  describe('msToKnots()', function () {
    it('converts 0 to 0', function () {
      assert.equal(msToKnots(0), 0)
    })
    it('converts 1852/3600 m/s to 1 knot', function () {
      assert.equal(Math.round(msToKnots(1852 / 3600) * 1e6) / 1e6, 1)
    })
    it('converts 1 m/s to ~1.94384 knots', function () {
      assert.ok(Math.abs(msToKnots(1) - 1.9438444924) < 1e-6)
    })
    it('scales linearly with input', function () {
      assert.ok(Math.abs(msToKnots(10) - 10 * msToKnots(1)) < 1e-9)
    })
  })

  describe('msToKM()', function () {
    it('converts 0 to 0', function () {
      assert.equal(msToKM(0), 0)
    })
    it('converts 1 m/s to 3.6 km/h', function () {
      assert.ok(Math.abs(msToKM(1) - 3.6) < 1e-9)
    })
    it('converts 10 m/s to 36 km/h', function () {
      assert.ok(Math.abs(msToKM(10) - 36) < 1e-9)
    })
  })

  describe('mToNm()', function () {
    it('converts 0 to 0', function () {
      assert.equal(mToNm(0), 0)
    })
    it('converts 1852 m to ~1 nm', function () {
      assert.ok(Math.abs(mToNm(1852) - 1) < 1e-3)
    })
    it('converts 1 m to 0.000539957 nm', function () {
      assert.equal(mToNm(1), 0.000539957)
    })
  })

  describe('fixAngle()', function () {
    it('returns input unchanged when in (-PI, PI]', function () {
      assert.equal(fixAngle(0), 0)
      assert.equal(fixAngle(1), 1)
      assert.equal(fixAngle(-1), -1)
      assert.equal(fixAngle(Math.PI), Math.PI)
    })
    it('subtracts 2*PI when > PI', function () {
      const result = fixAngle(Math.PI + 0.5)
      assert.ok(Math.abs(result - (0.5 - Math.PI)) < 1e-9)
    })
    it('adds 2*PI when < -PI', function () {
      const result = fixAngle(-Math.PI - 0.5)
      assert.ok(Math.abs(result - (Math.PI - 0.5)) < 1e-9)
    })
    it('leaves -PI unchanged (lower bound is strict)', function () {
      assert.equal(fixAngle(-Math.PI), -Math.PI)
    })
    it('leaves PI unchanged (upper bound is strict)', function () {
      assert.equal(fixAngle(Math.PI), Math.PI)
    })
  })

  describe('radsToPositiveDeg()', function () {
    it('maps 0 to 0', function () {
      assert.equal(radsToPositiveDeg(0), 0)
    })
    it('maps PI to 180', function () {
      assert.equal(radsToPositiveDeg(Math.PI), 180)
    })
    it('maps -PI/2 to 270', function () {
      assert.equal(radsToPositiveDeg(-Math.PI / 2), 270)
    })
    it('maps -PI to 180', function () {
      assert.equal(radsToPositiveDeg(-Math.PI), 180)
    })
    it('keeps positives unchanged below 2*PI', function () {
      assert.ok(Math.abs(radsToPositiveDeg(Math.PI / 4) - 45) < 1e-9)
    })
  })

  describe('toNmeaDegreesLatitude()', function () {
    it('converts to degrees and decimal minutes (DDMM.MMMM)', function () {
      assert.equal(toNmeaDegreesLatitude(0), '0000.0000,N')
      assert.equal(toNmeaDegreesLatitude(0.016668333333333334), '0001.0001,N')
      assert.equal(toNmeaDegreesLatitude(-1.016668333333333334), '0101.0001,S')
      assert.equal(toNmeaDegreesLatitude(1.016668333333333334), '0101.0001,N')
      assert.throws(function () { toNmeaDegreesLatitude(-99.999) }, Error)
      assert.throws(function () { toNmeaDegreesLatitude(100) }, Error)
      assert.throws(function () { toNmeaDegreesLatitude('23.333') }, Error)
      assert.throws(function () { toNmeaDegreesLatitude(undefined) }, Error)
      assert.throws(function () { toNmeaDegreesLatitude('hello world') }, Error)
    })
    it('accepts the boundaries -90 and 90', function () {
      assert.equal(toNmeaDegreesLatitude(-90), '9000.0000,S')
      assert.equal(toNmeaDegreesLatitude(90), '9000.0000,N')
    })
    it('rejects values just past the boundaries', function () {
      assert.throws(() => toNmeaDegreesLatitude(-90.0001), Error)
      assert.throws(() => toNmeaDegreesLatitude(90.0001), Error)
    })
    it('rejects null', function () {
      assert.throws(() => toNmeaDegreesLatitude(null), Error)
    })
    it('error message names the function and echoes the value', function () {
      assert.throws(
        () => toNmeaDegreesLatitude(100),
        /invalid input to toNmeaDegreesLatitude: 100/
      )
    })
  })

  describe('toNmeaDegreesLongitude()', function () {
    it('converts to degrees and decimal minutes (DDDMM.MMMM)', function () {
      assert.equal(toNmeaDegreesLongitude(0), '00000.0000,E')
      assert.equal(toNmeaDegreesLongitude(0.016668333333333334), '00001.0001,E')
      assert.equal(toNmeaDegreesLongitude(-1.016668333333333334), '00101.0001,W')
      assert.equal(toNmeaDegreesLongitude(1.016668333333333334), '00101.0001,E')
      assert.equal(toNmeaDegreesLongitude(-99.9999983333333333), '09959.9999,W')
      assert.equal(toNmeaDegreesLongitude(-122.4208), '12225.2480,W')
      assert.throws(function () { toNmeaDegreesLongitude(-181) }, Error)
      assert.throws(function () { toNmeaDegreesLongitude(197) }, Error)
      assert.throws(function () { toNmeaDegreesLongitude('-122') }, Error)
      assert.throws(function () { toNmeaDegreesLongitude(undefined) }, Error)
      assert.throws(function () { toNmeaDegreesLongitude('hello world') }, Error)
    })
    it('accepts 180 but rejects -180', function () {
      assert.equal(toNmeaDegreesLongitude(180), '18000.0000,E')
      assert.throws(() => toNmeaDegreesLongitude(-180), Error)
    })
    it('rejects values just past the upper boundary', function () {
      assert.throws(() => toNmeaDegreesLongitude(180.0001), Error)
    })
    it('rejects null', function () {
      assert.throws(() => toNmeaDegreesLongitude(null), Error)
    })
    it('error message names the function and echoes the value', function () {
      assert.throws(
        () => toNmeaDegreesLongitude(-181),
        /invalid input to toNmeaDegreesLongitude: -181/
      )
    })
  })
})
