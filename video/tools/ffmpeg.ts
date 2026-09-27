/**
 * The ffmpeg/ffprobe that ship with Remotion's compositor, so the reel needs no
 * separate ffmpeg install.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

function binDir(): string {
  const pkg = `@remotion/compositor-${process.platform}-${process.arch}${process.platform === 'win32' ? '-msvc' : ''}`;
  return path.dirname(require.resolve(`${pkg}/package.json`));
}

const exe = (name: string) => path.join(binDir(), process.platform === 'win32' ? `${name}.exe` : name);

export function ffmpeg(args: string[]): void {
  execFileSync(exe('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

export function durationSeconds(file: string): number {
  const out = execFileSync(exe('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(out.toString().trim());
}
