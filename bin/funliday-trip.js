#!/usr/bin/env node
const { runTripCli } = require('../src/cli/trip');
runTripCli(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exit(1);
});

