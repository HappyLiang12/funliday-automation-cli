#!/usr/bin/env node
const { runPoibankCli } = require('../src/cli/poibank');
runPoibankCli(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exit(1);
});

