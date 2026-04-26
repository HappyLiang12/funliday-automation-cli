#!/usr/bin/env node
const { runTripCli } = require('../src/cli/trip');
const { runMutateCli } = require('../src/cli/mutate');
const { runApiCli } = require('../src/cli/api');
const { runPoibankCli } = require('../src/cli/poibank');
const { runAuthCli } = require('../src/cli/auth');
const { printCliError, debugFromArgv } = require('../src/cli/shared');

function printUsage(stream = process.stdout) {
  stream.write(`funliday-automation-cli\n\nUsage:\n  funliday auth <export/check> [...args]\n  funliday trip <get/create/update> [...args]\n  funliday mutate <run/validate> [...args]\n  funliday api <apiName> <bodyJson> [...args]\n  funliday poibank <keyword> [...args]\n\nGlobal flags:\n  --quiet, -q   suppress one-line success summary\n  --debug       print full stack traces on error\n\nUse a direct subcommand binary if preferred:\n  funliday-auth\n  funliday-trip\n  funliday-mutate\n  funliday-plan-validate\n  funliday-api\n  funliday-poibank\n`);
}

(async () => {
  const argv = process.argv.slice(2);
  const [command, ...rest] = argv;
  if (!command || ['help', '--help', '-h'].includes(command)) {
    printUsage();
    return;
  }
  if (command === 'auth') return runAuthCli(rest);
  if (command === 'trip') return runTripCli(rest);
  if (command === 'mutate') return runMutateCli(rest);
  if (command === 'api') return runApiCli(rest);
  if (command === 'poibank') return runPoibankCli(rest);
  process.stderr.write(`Unknown command: ${command}\n\n`);
  printUsage(process.stderr);
  process.exit(1);
})().catch((error) => {
  printCliError(error, { debug: debugFromArgv(process.argv.slice(2)) });
  process.exit(1);
});
