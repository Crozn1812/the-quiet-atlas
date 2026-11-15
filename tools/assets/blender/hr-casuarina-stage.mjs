// Reuse the established read-only staging workflow for inherited Windows ACLs.
// No dependency installation or permission changes; source hashes prove parity.
process.env.HR_PROPS_RESULTS = 'tools/styleframes/.vite/test-results/hr-casuarina';
await import('../../../tests/review/hr-props2-stage.mjs');
