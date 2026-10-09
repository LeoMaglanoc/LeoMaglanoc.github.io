const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
for (const base of ['public', '../../assets/interactive/g1-parkour']) {
  const directory = path.resolve(root,base);
  if (!fs.existsSync(directory)) continue;
  const manifest = JSON.parse(fs.readFileSync(path.join(directory,'php-release/manifest.json')));
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(directory,'php-release',file.path));
    assert.equal(bytes.length,file.size);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);
  }
  const terrain = JSON.parse(fs.readFileSync(path.join(directory,'scenes/php-release/terrain-manifest.json')));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,'scenes/php-release/terrain.obj'))).digest('hex'),terrain.sha256);
  for (const file of JSON.parse(fs.readFileSync(path.join(directory,'scenes/files.json')))) assert.ok(fs.existsSync(path.join(directory,'scenes',file)),file);
}
console.log('Released model hashes, terrain hash and scene asset completeness passed');
