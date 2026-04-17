const os = require('os');
const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_PORT = process.env.EXPO_PUBLIC_API_PORT || '4000';

const getPreferredLanIp = () => {
  const interfaces = os.networkInterfaces();
  const preferredNames = ['Wi-Fi', 'Wireless LAN adapter Wi-Fi', 'wlan0', 'en0'];

  for (const preferredName of preferredNames) {
    const candidates = interfaces[preferredName] || [];
    const found = candidates.find((item) => item.family === 'IPv4' && !item.internal);
    if (found) return found.address;
  }

  for (const items of Object.values(interfaces)) {
    const found = (items || []).find((item) => item.family === 'IPv4' && !item.internal);
    if (found) return found.address;
  }

  return null;
};

const args = process.argv.slice(2);
const lanIp = getPreferredLanIp();
const env = { ...process.env };
const wantsWeb = args.includes('--web');
const wantsDevClient = args.includes('--dev-client');
const wantsExpoGo = args.includes('--go');
const wantsNativePlatform = args.includes('--android') || args.includes('--ios');
const hasMaxWorkersArg = args.includes('--max-workers');

if (!env.EXPO_PUBLIC_API_URL && lanIp) {
  env.EXPO_PUBLIC_API_URL = `http://${lanIp}:${DEFAULT_PORT}`;
}

if (!env.EXPO_NO_DOCTOR) {
  env.EXPO_NO_DOCTOR = '1';
}

if (!env.EXPO_OFFLINE) {
  env.EXPO_OFFLINE = '1';
}

if (!env.BROWSER) {
  env.BROWSER = 'none';
}

if (env.EXPO_PUBLIC_API_URL) {
  console.log(`GigWise frontend API: ${env.EXPO_PUBLIC_API_URL}`);
} else {
  console.log('GigWise frontend API: could not detect LAN IP automatically');
}

if (!wantsWeb && wantsNativePlatform && !wantsDevClient) {
  args.push('--dev-client');
}

if (!wantsWeb && !wantsNativePlatform && !wantsDevClient && !wantsExpoGo) {
  args.push('--go');
}

if (!hasMaxWorkersArg) {
  args.push('--max-workers', '1');
}

const expoCli = path.join(__dirname, '..', 'node_modules', 'expo', 'bin', 'cli');
const child = spawn(process.execPath, [expoCli, 'start', ...args], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
