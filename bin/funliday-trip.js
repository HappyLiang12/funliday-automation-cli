#!/usr/bin/env node
const { runTripCli } = require('../src/cli/trip');
const { printCliError, debugFromArgv } = require('../src/cli/shared');
runTripCli(process.argv.slice(2)).catch((error) => {
  printCliError(error, { debug: debugFromArgv(process.argv.slice(2)) });
  process.exit(1);
});
