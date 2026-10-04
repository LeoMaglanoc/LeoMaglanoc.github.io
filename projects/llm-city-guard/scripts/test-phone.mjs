import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const capture = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout;
};
const wait = (milliseconds) => {
  const result = spawnSync('sleep', [String(milliseconds / 1000)]);
  if (result.status !== 0) throw new Error('Unable to wait for device output.');
};

const devices = capture('adb', ['devices']).split('\n').filter((line) => /\tdevice$/.test(line));
if (devices.length !== 1) throw new Error(`Expected exactly one adb device, found ${devices.length}.`);
const serial = devices[0].split('\t')[0];
const model = process.env.GATEKEEPER_GGUF;
if (!model || !existsSync(model)) throw new Error('Set GATEKEEPER_GGUF to the verified local Q4 GGUF before running phone acceptance.');

run('npm', ['run', 'android:sync']);
run('npm', ['run', 'android:build']);
run('adb', ['-s', serial, 'install', '-r', 'android/app/build/outputs/apk/debug/app-debug.apk']);
const remote = '/sdcard/Android/data/com.leomaglanoc.gatekeeper/files/models/gemma-4-E2B-Q4_K_M.gguf';
run('adb', ['-s', serial, 'shell', 'mkdir', '-p', remote.substring(0, remote.lastIndexOf('/'))]);
run('adb', ['-s', serial, 'push', resolve(model), remote]);
run('adb', ['-s', serial, 'logcat', '-c']);
run('adb', ['-s', serial, 'shell', 'am', 'start', '-S', '-n', 'com.leomaglanoc.gatekeeper/.MainActivity', '-d', 'https://localhost/?deviceTest=1']);
let log = '';
for (let attempt = 0; attempt < 120; attempt += 1) {
  log = capture('adb', ['-s', serial, 'logcat', '-d', '-s', 'GatekeeperLlm:V', 'AndroidRuntime:E']);
  if (/device-test=passed sequential_turns=6 raw_json=valid/.test(log)) break;
  wait(5_000);
}
const generations = (log.match(/generation_ms=/g) ?? []).length;
if (!/backend=vulkan/i.test(log) || /cpu-only/i.test(log) || generations < 6 || !/device-test=passed sequential_turns=6 raw_json=valid/.test(log)) {
  throw new Error('Phone acceptance did not prove Vulkan, six generations, and six valid raw JSON turns.');
}
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/android-logcat.txt', log);
console.log(`Phone acceptance passed for ${serial}; logs saved to artifacts/android-logcat.txt.`);
