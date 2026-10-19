import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const config='wrangler.json';
const command=process.argv[2];
const wrangler=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
if(!['build','deploy','migrate','dry-run','dev'].includes(command))throw new Error('Use build, deploy, migrate, dry-run, or dev.');
if(command==='deploy'||command==='migrate'){
  const settings=JSON.parse(readFileSync(new URL('../wrangler.json',import.meta.url),'utf8'));
  const database=settings.d1_databases?.find(d=>d.binding==='DB');
  if(!database?.database_id||database.database_id==='00000000-0000-4000-8000-000000000000'){
    console.error('Create your D1 database, then replace database_id in wrangler.json. See docs/cloudflare-deployment.md.');
    process.exit(1);
  }
  if(command==='deploy'){
    let built;
    try{built=JSON.parse(readFileSync(new URL('../dist/server/wrangler.json',import.meta.url),'utf8'));}catch{throw new Error('Run npm run build:cloudflare before deploying.');}
    const binding=built.d1_databases?.find(d=>d.binding==='DB');
    if(binding?.database_id!==database.database_id||binding?.database_name!==database.database_name||built.name!==settings.name)throw new Error('Built configuration does not match your Cloudflare database. Run npm run build:cloudflare again.');
  }
}
const args=command==='build'||command==='dev'
  ? [fileURLToPath(new URL('./run-framework.mjs',import.meta.url)),command==='build'?'build':'dev',...process.argv.slice(3)]
  : command==='migrate'
    ? [wrangler,'d1','migrations','apply','DB','--remote','--config',config]
    : [wrangler,'deploy','--config','dist/server/wrangler.json',...(command==='dry-run'?['--dry-run','--outdir','outputs/cloudflare-dry-run']:[])];
const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,VENDOR_HOSTING_TARGET:'cloudflare',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false',WRANGLER_LOG_PATH:'.wrangler/logs'}});
if(result.error)throw result.error;
process.exit(result.status??1);
