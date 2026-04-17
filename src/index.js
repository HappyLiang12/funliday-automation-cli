module.exports = {
  api: require('./api/client'),
  browserSession: require('./auth/browser-session'),
  envAuth: require('./auth/env-auth'),
  paths: require('./io/paths'),
  plan: {
    selector: require('./plan/selector'),
    validator: require('./plan/validator'),
    mutationRunner: require('./plan/mutation-runner'),
  },
  observability: require('./observability/execution-review'),
  errors: require('./errors'),
};

