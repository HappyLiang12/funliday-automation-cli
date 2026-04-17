#!/usr/bin/env node
const { runMutateCli } = require('../src/cli/mutate');
runMutateCli(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exit(1);
});

