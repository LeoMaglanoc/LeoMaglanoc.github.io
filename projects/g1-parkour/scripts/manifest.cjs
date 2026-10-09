const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),published=path.resolve(root,'../../assets/interactive/g1-parkour');
const files={};
function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
 const file=path.join(directory,entry.name); if(entry.isDirectory())walk(file);
 else if(entry.name!=='build-manifest.json'){const bytes=fs.readFileSync(file);files[path.relative(published,file)]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};}
}}
walk(published);
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json')));
const dependencies=Object.fromEntries(['mujoco-js','three','onnxruntime-web','vite','playwright'].map(name=>[name,lock.packages['node_modules/'+name].version]));
fs.writeFileSync(path.join(published,'build-manifest.json'),JSON.stringify({upstream:JSON.parse(fs.readFileSync(path.join(root,'upstream.json'))),dependencies,totalBytes:Object.values(files).reduce((n,f)=>n+f.bytes,0),files},null,2)+'\n');
console.log('Recorded published runtime/model/scene hashes');
