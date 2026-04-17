#!/usr/bin/env node
const { runApiCli } = require('../src/cli/api');
runApiCli(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exit(1);
});

