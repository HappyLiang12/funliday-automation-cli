const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const ARTIFACTS_DIR = process.env.FUNLIDAY_OUTPUT_DIR
  ? path.resolve(process.env.FUNLIDAY_OUTPUT_DIR)
  : path.join(ROOT_DIR, 'artifacts');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function resolveRootPath(...segments) {
  return path.join(ROOT_DIR, ...segments);
}

function resolveArtifactPath(...segments) {
  const artifactPath = path.join(ARTIFACTS_DIR, ...segments);
  ensureDir(path.dirname(artifactPath));
  return artifactPath;
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return filePath;
}

module.exports = {
  ROOT_DIR,
  ARTIFACTS_DIR,
  ensureDir,
  resolveRootPath,
  resolveArtifactPath,
  writeJson,
};

