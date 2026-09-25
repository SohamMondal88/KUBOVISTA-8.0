import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildFirebase(outdir = new URL('../dist/', import.meta.url)) {
  const destination = outdir instanceof URL ? fileURLToPath(outdir) : outdir;
  await build({ absWorkingDir: root, entryPoints: { 'firebase-client': 'client/firebase.js' }, outdir: destination, bundle: true, splitting: true, format: 'esm', platform: 'browser', target: ['es2020'], minify: true, chunkNames: 'firebase-chunk-[hash]' });
  await build({ absWorkingDir: root, entryPoints: ['client/firebase-messaging-sw.js'], outfile: destination + '/firebase-messaging-sw.js', bundle: true, format: 'iife', platform: 'browser', target: ['es2020'], minify: true });
}
