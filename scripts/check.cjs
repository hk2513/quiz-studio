const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
let failed=false;
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>['.git','.openai','node_modules'].includes(d.name)?[]:d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]);}
const files=walk(root);
for(const file of files){
  if(/\.(js|cjs)$/.test(file))try{cp.execFileSync(process.execPath,['--check',file],{stdio:'pipe'});}catch(e){console.error(file,e.stderr.toString());failed=true;}
  if(/(?:\.env(?:\.|$)|\.htpasswd$|quiz-local-data\.js$|_qa\.html$|\.DS_Store$|\.pem$|\.key$)/.test(file)){console.error('Excluded input found:',file);failed=true;}
  if(/\.(js|cjs|html|json|css|md|ya?ml)$/.test(file)){
    const text=fs.readFileSync(file,'utf8');
    if(/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{40,}/.test(text)){console.error('Potential credential:',file);failed=true;}
  }
}
const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
for(const [,ref]of html.matchAll(/(?:src|href)="([^"#]+)"/g))if(!fs.existsSync(path.join(root,'web',ref))){console.error('Missing asset:',ref);failed=true;}
if(failed)process.exit(1);
console.log(`Checked ${files.length} files: syntax, assets, excluded files, credential patterns OK.`);
