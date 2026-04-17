#!/usr/bin/env node
const { runTripCli } = require('../src/cli/trip');
const { runMutateCli } = require('../src/cli/mutate');
const { runApiCli } = require('../src/cli/api');
const { runPoibankCli } = require('../src/cli/poibank');

function printUsage() {
  console.log(`funliday-automation-cli\n\nUsage:\n  funliday trip <get/create/update> [...args]\n  funliday mutate <run/validate> [...args]\n  funliday api <apiName> <bodyJson> [...args]\n  funliday poibank <keyword> [...args]\n\nUse a direct subcommand binary if preferred:\n  funliday-trip\n  funliday-mutate\n  funliday-plan-validate\n  funliday-api\n  funliday-poibank`);
}

(async () => {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || ['help', '--help', '-h'].includes(command)) {
    printUsage();
    return;
  }
  if (command === 'trip') return runTripCli(rest);
  if (command === 'mutate') return runMutateCli(rest);
  if (command === 'api') return runApiCli(rest);
  if (command === 'poibank') return runPoibankCli(rest);
  throw new Error(`Unknown command: ${command}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});


