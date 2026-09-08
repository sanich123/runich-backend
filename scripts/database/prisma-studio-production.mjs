import { spawn, spawnSync } from 'node:child_process';
import { connect } from 'node:net';

const SSH_ALIAS = 'runich-timeweb';
const REMOTE_PROJECT_DIRECTORY = '/opt/runich-backend/project';
const DEFAULT_TUNNEL_PORT = 15432;

const tunnelPort = Number(process.env.RUNICH_STUDIO_DATABASE_PORT ?? DEFAULT_TUNNEL_PORT);

const isTcpPortReachable = (host, port) =>
  new Promise((resolve) => {
    const socket = connect({ host, port });

    const finish = (isReachable) => {
      socket.destroy();
      resolve(isReachable);
    };

    socket.setTimeout(1_000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });

const readProductionDatabaseUrl = () => {
  const result = spawnSync(
    'ssh',
    [SSH_ALIAS, `cd ${REMOTE_PROJECT_DIRECTORY} && docker compose exec -T nestjs_app printenv DATABASE_URL`],
    {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit'],
    },
  );

  if (result.error || result.status !== 0 || !result.stdout?.trim()) {
    throw new Error('Не удалось получить DATABASE_URL production-контейнера');
  }

  try {
    const url = new URL(result.stdout.trim());

    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error('Unsupported database protocol');
    }

    url.hostname = '127.0.0.1';
    url.port = String(tunnelPort);
    url.searchParams.delete('schema');

    return url.href;
  } catch {
    throw new Error('Production DATABASE_URL имеет некорректный формат');
  }
};

const runStudio = (databaseUrl) =>
  new Promise((resolve, reject) => {
    const studio = spawn('yarn', ['db:studio'], {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: 'inherit',
    });

    studio.once('error', reject);
    studio.once('exit', (code, signal) => {
      resolve(signal ? 1 : (code ?? 1));
    });
  });

const main = async () => {
  if (!Number.isInteger(tunnelPort) || tunnelPort < 1 || tunnelPort > 65_535) {
    throw new Error('RUNICH_STUDIO_DATABASE_PORT должен содержать корректный TCP-порт');
  }

  if (!(await isTcpPortReachable('127.0.0.1', tunnelPort))) {
    throw new Error(`SSH-туннель не найден. Запустите: ssh -N -L ${tunnelPort}:127.0.0.1:5432 ${SSH_ALIAS}`);
  }

  const databaseUrl = readProductionDatabaseUrl();
  process.exitCode = await runStudio(databaseUrl);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Не удалось запустить Prisma Studio';
  console.error(message);
  process.exitCode = 1;
});
