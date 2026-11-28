import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const noAdvanceRef = args.includes('--no-advance-ref');
const unsupportedArgs = args.filter((arg) => arg !== '--no-advance-ref');

if (unsupportedArgs.length > 0) {
  throw new Error(`Unsupported arguments: ${unsupportedArgs.join(' ')}`);
}

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: 'inherit' });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${commandArgs.join(' ')} stopped by ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`${command} ${commandArgs.join(' ')} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

await run('docker', ['compose', 'up', '-d', 'db', '--wait']);

try {
  await run('yarn', ['prisma', 'db', 'sign', ...(noAdvanceRef ? ['--no-advance-ref'] : [])]);
} catch {
  await run('yarn', ['prisma:sync']);
}
