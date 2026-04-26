#!/usr/bin/env node
const { runPoibankCli } = require('../src/cli/poibank');
const { printCliError, debugFromArgv } = require('../src/cli/shared');
runPoibankCli(process.argv.slice(2)).catch((error) => {
  printCliError(error, { debug: debugFromArgv(process.argv.slice(2)) });
  process.exit(1);
});
