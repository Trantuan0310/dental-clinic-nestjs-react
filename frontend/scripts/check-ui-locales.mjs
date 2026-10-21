// Run from frontend. Validate resource parity, interpolation, and literal key uses.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
const modules=['uiCommon','uiClinical','uiEntry','uiOperations','uiScheduling','uiWorkforce'];
function flatten(value,prefix='',out={}) {
 for(const [key,item] of Object.entries(value)) {
  const path=prefix?`${prefix}.${key}`:key;
  if(item!==null&&typeof item==='object'&&!Array.isArray(item)) flatten(item,path,out);
  else if(Array.isArray(item)) item.forEach((v,i)=>{out[`${path}.${i}`]=v;});
  else out[path]=item;
 }
 return out;
}
const resources={};
const issues=[];
for(const name of modules) {
 const source=readFileSync(`src/locales/${name}.ts`,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {vi,en}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
 const a=flatten(vi),b=flatten(en);
 for(const key of Object.keys(a))if(!(key in b))issues.push(`${name}: missing en ${key}`);
 for(const key of Object.keys(b))if(!(key in a))issues.push(`${name}: missing vi ${key}`);
 for(const key of Object.keys(a)) {
  const params=s=>[...String(s).matchAll(/{{\s*([^}]+)\s*}}/g)].map(m=>m[1].trim()).sort();
  if(key in b && params(a[key]).join('|')!==params(b[key]).join('|'))issues.push(`${name}.${key}: interpolation mismatch`);
  if(key in b && !String(b[key]).trim())issues.push(`${name}.${key}: empty English translation`);
 }
 resources[name]={vi,en};
}
let checked=0;
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
for(const file of walk('src').filter(p=>/\.(ts|tsx)$/.test(p)&&!p.includes('/locales/'))) {
 const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function visit(node) {
  // Any string literal that is a whole key: t('ui…') calls and translatedLabels() maps alike.
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)) {
   const key=node.text;
   if(/^ui(Common|Clinical|Entry|Operations|Scheduling|Workforce)\.[A-Za-z0-9_.]+$/.test(key)) {
    const [module,...parts]=key.split('.');
    for(const locale of ['vi','en'])if(parts.reduce((o,p)=>o?.[p],resources[module][locale])===undefined)issues.push(`${file}: missing ${locale} ${key}`);
    checked++;
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
}
if(issues.length){console.error([...new Set(issues)].join('\n'));process.exitCode=1;}
else console.log(`PASS ${modules.length} locale pairs, interpolation parity, ${checked} literal key references`);
