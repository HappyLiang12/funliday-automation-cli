#!/usr/bin/env node
const { runApiCli } = require('../src/cli/api');
const { printCliError, debugFromArgv } = require('../src/cli/shared');
runApiCli(process.argv.slice(2)).catch((error) => {
  printCliError(error, { debug: debugFromArgv(process.argv.slice(2)) });
  process.exit(1);
});
