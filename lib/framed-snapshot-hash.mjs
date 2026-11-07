import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** dd-flow/framed-payload@1 over a copied snapshot tree. This is not a
 * substitute for the engine's Git-bundle or snapshot-admission checks. */
export function framedSnapshotTreeHash(root) {
  const hash=createHash('sha256'),rootStat=fs.lstatSync(root);
  if (!rootStat.isDirectory()) throw new Error('snapshot_payload_mismatch');
  hash.update(`${JSON.stringify(['root',rootStat.mode & 0o7777])}\n`);
  const visit=(directory,relative='')=>{
    for (const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
      const file=path.join(directory,entry.name),name=relative?`${relative}/${entry.name}`:entry.name;
      if (entry.isDirectory()) {
        const stat=fs.lstatSync(file);
        if (!stat.isDirectory()) throw new Error('snapshot_payload_mismatch');
        hash.update(`${JSON.stringify(['directory',name,stat.mode & 0o7777])}\n`);visit(file,name);
      } else if (entry.isSymbolicLink()) hash.update(`${JSON.stringify(['symlink',name,fs.readlinkSync(file,{encoding:'buffer'}).toString('base64')])}\n`);
      else if (entry.isFile()) {
        const fd=fs.openSync(file,fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
        try {
          const before=fs.fstatSync(fd,{bigint:true}),content=createHash('sha256'),buffer=Buffer.allocUnsafe(256*1024);
          if (!before.isFile()) throw new Error('snapshot_payload_mismatch');
          let count=0n;
          for (;;) {const length=fs.readSync(fd,buffer,0,buffer.length,null);if (!length) break;count+=BigInt(length);content.update(buffer.subarray(0,length));}
          const after=fs.fstatSync(fd,{bigint:true});
          if (count!==before.size || after.size!==before.size || after.mtimeNs!==before.mtimeNs || after.ctimeNs!==before.ctimeNs) throw new Error('snapshot_payload_mismatch');
          hash.update(`${JSON.stringify(['file',name,Number(before.mode & 0o7777n),content.digest('hex')])}\n`);
        } finally {fs.closeSync(fd);}
      } else throw new Error('snapshot_payload_mismatch');
    }
  };
  visit(root);return hash.digest('hex');
}
