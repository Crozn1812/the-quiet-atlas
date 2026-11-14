// ADR 0019: latency/CPU numbers are reports. CLS and collection errors remain gates.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- LHCI loads its config synchronously as CommonJS.
const config = require('../../lighthouserc.cjs');
for (const audit of ['largest-contentful-paint', 'total-blocking-time']) {
  const [, options] = config.ci.assert.assertions[audit];
  config.ci.assert.assertions[audit] = ['warn', options];
}
module.exports = config;
