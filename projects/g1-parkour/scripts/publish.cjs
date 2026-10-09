const fs = require('node:fs');
const path = require('node:path');
const destination = path.resolve(__dirname, '../../../assets/interactive/g1-parkour');
fs.mkdirSync(destination, {recursive:true});
// Remove obsolete hashed output; keep this application's output isolated.
fs.rmSync(destination, {recursive:true,force:true});
fs.cpSync(path.resolve(__dirname,'../dist'),destination,{recursive:true});
console.log(`Published ${destination}`);
require('./manifest.cjs');
