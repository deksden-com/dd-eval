import { open } from 'node:fs/promises';
import { constants, openSync, fstatSync, readFileSync, closeSync } from 'node:fs';

function assertFile(isFile, file) {
  if (!isFile) throw Object.assign(new Error(`Input must be a regular file: ${file}`), { code: 'input_file_not_regular' });
}

// Check and read through one descriptor; never wait for a FIFO writer.
export async function readRegularFile(file) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try { assertFile((await handle.stat()).isFile(), file); return await handle.readFile(); }
  finally { await handle.close(); }
}

export function readRegularFileSync(file) {
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try { assertFile(fstatSync(descriptor).isFile(), file); return readFileSync(descriptor); }
  finally { closeSync(descriptor); }
}
