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

if (!env.EXPO_PUBLIC_API_URL && lanIp) {
  env.EXPO_PUBLIC_API_URL = `http://${lanIp}:${DEFAULT_PORT}`;
}

if (env.EXPO_PUBLIC_API_URL) {
  console.log(`GigWise frontend API: ${env.EXPO_PUBLIC_API_URL}`);
} else {
  console.log('GigWise frontend API: could not detect LAN IP automatically');
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

