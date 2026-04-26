#!/usr/bin/env node
const { runMutateCli } = require('../src/cli/mutate');
const { printCliError, debugFromArgv } = require('../src/cli/shared');
runMutateCli(process.argv.slice(2)).catch((error) => {
  printCliError(error, { debug: debugFromArgv(process.argv.slice(2)) });
  process.exit(1);
});
