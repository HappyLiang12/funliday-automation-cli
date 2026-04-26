#!/usr/bin/env node
const { runAuthCli } = require('../src/cli/auth');
const { printCliError, debugFromArgv } = require('../src/cli/shared');
runAuthCli(process.argv.slice(2)).catch((error) => {
  printCliError(error, { debug: debugFromArgv(process.argv.slice(2)) });
  process.exit(1);
});
