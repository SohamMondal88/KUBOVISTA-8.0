import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
const root = new URL('../',import.meta.url);
const output = new URL('dist/',root);
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for (const name of ['index.html','styles.css','app.js','data.js']) await copyFile(new URL(name,root),new URL(name,output));
await cp(new URL('assets/',root),new URL('assets/',output),{recursive:true});
console.log('Production site built in dist/');
