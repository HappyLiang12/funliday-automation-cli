const { readFileSync } = require('fs');
const path = require('path');
const { runMutationPlan } = require('../plan/mutation-runner');
const { validateMutationPlan } = require('../plan/validator');
const { resolveArtifactPath, writeJson } = require('../io/paths');
const { DEFAULT_CDP_ENDPOINT } = require('../auth/browser-session');
const { parseCommonFlags, resolveAuthInput } = require('./shared');

function printMutateUsage() {
  console.log(`Funliday Mutation CLI\n\nUsage:\n  funliday-mutate run <plan.json> [--dry-run] [--endpoint <url>] [--output <file>] [--auth-file <file> | --env-auth]\n  funliday-mutate validate <plan.json> [--output <file>]`);
}

function parseMutateArgs(argv) {
  const subcommand = argv[0];
  if (!subcommand || ['help', '--help', '-h'].includes(subcommand)) return { subcommand: 'help' };
  const { options: common, rest } = parseCommonFlags(argv.slice(1));
  let planPath = '';
  let positionalOutputPath = '';
  let dryRun = false;
  let validateOnly = false;
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--dry-run') { dryRun = true; continue; }
    if (arg === '--validate-only') { validateOnly = true; continue; }
    if (!planPath) { planPath = arg; continue; }
    if (!positionalOutputPath) { positionalOutputPath = arg; continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!planPath && subcommand !== 'help') throw new Error('A mutation plan path is required.');
  return {
    subcommand,
    planPath: planPath ? path.resolve(planPath) : '',
    endpoint: common.endpoint || DEFAULT_CDP_ENDPOINT,
    outputPath: common.outputPath || positionalOutputPath,
    dryRun,
    validateOnly,
    authFile: common.authFile,
    useEnvAuth: common.useEnvAuth,
  };
}

async function runMutateCli(argv) {
  const parsed = parseMutateArgs(argv);
  if (parsed.subcommand === 'help') {
    printMutateUsage();
    return { ok: true, subcommand: 'help' };
  }

  const plan = JSON.parse(readFileSync(parsed.planPath, 'utf8'));
  plan.__planPath = parsed.planPath;
  const finalOutputPath = parsed.outputPath || resolveArtifactPath('mutations', `${path.basename(parsed.planPath, path.extname(parsed.planPath))}_output.json`);

  if (parsed.subcommand === 'validate' || parsed.validateOnly) {
    const validation = validateMutationPlan(plan);
    const payload = { planPath: parsed.planPath, ok: validation.ok, errors: validation.errors };
    writeJson(finalOutputPath, payload);
    if (!validation.ok) process.exitCode = 1;
    return payload;
  }

  if (parsed.subcommand !== 'run') throw new Error(`Unsupported mutate subcommand: ${parsed.subcommand}`);
  return runMutationPlan({
    plan,
    endpoint: parsed.endpoint,
    dryRun: parsed.dryRun,
    outputPath: finalOutputPath,
    auth: resolveAuthInput(parsed),
  });
}

module.exports = {
  parseMutateArgs,
  printMutateUsage,
  runMutateCli,
};


