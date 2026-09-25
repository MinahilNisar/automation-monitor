import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
// Use Docker on PATH, or the installed Windows locations without changing global PATH.
const candidates = [process.env.DOCKER_BIN, 'E:/Docker/Docker/resources/bin/docker.exe', 'C:/Program Files/Docker/Docker/resources/bin/docker.exe', 'docker'].filter(Boolean);
const docker = candidates.find(p => spawnSync(p, ['--version'], { windowsHide: true }).status === 0);
if (!docker) throw new Error('Install/start Docker Desktop, or set DOCKER_BIN to docker.exe.');
const env = { ...process.env, PATH: dirname(docker) + (process.platform === 'win32' ? ';' : ':') + process.env.PATH };
const args = process.argv.slice(2);
let command = docker;
let commandArgs = ['compose', ...args];
if (spawnSync(docker, ['compose', 'version'], { env, windowsHide: true }).status !== 0) {
  const plugin = resolve(dirname(docker), '../cli-plugins/docker-compose.exe');
  if (!existsSync(plugin)) throw new Error('Docker Compose is missing. Install the Compose plugin.');
  command = plugin;
  commandArgs = args;
}
const result = spawnSync(command, commandArgs, { env, stdio: 'inherit', windowsHide: true });
process.exit(result.status ?? 1);
