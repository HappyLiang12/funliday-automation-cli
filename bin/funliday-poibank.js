#!/usr/bin/env node
const { runPoibankCli } = require('../src/cli/poibank');
const { printCliError, debugFromArgv } = require('../src/cli/shared');
runPoibankCli(process.argv.slice(2)).catch((error) => {
  printCliError(error, { debug: debugFromArgv(process.argv.slice(2)) });
  // process.exit() here aborts while undici fetch handles are still closing on
  // Windows (libuv UV_HANDLE_CLOSING assertion, corrupt exit code). Let the
  // event loop drain naturally with exitCode set instead.
  process.exitCode = 1;
});
