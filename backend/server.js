const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const cron = require('node-cron');
const path = require('path');
const { spawn } = require('child_process');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buffer) => {
      if (req.originalUrl === '/billing/webhook') {
        req.rawBody = Buffer.from(buffer);
      }
    }
  })
);

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/gigwise';
const ML_API_URL = String(process.env.ML_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const FASTAPI_WORKDIR = path.join(__dirname, 'ml_python');
const FASTAPI_HOST = '127.0.0.1';
const FASTAPI_PORT = '8000';
const FASTAPI_PYTHON_BIN = process.env.FASTAPI_PYTHON_BIN || 'python';

// Mongo connection
mongoose
  .connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error', err.message);
    if (MONGO_URI.startsWith('mongodb+srv://')) {
      console.log(
        'Atlas checks: verify Network Access allows your public IP, the database user credentials are correct, and your ISP/firewall is not blocking outbound connections to Atlas.'
      );
    }
    console.log('GigWise API will continue with in-memory dev storage until MongoDB is available.');
  });

const { listActivePoliciesWithUsers } = require('./src/store/dataStore');

// Services
const { fetchWeather, fetchAQI } = require('./src/services/weatherService');

// Routes
app.use('/register', require('./src/routes/register')); // POST
app.use('/policy', require('./src/routes/policy')); // POST
app.use('/weather', require('./src/routes/weather')); // GET
app.use('/trigger', require('./src/routes/trigger')); // POST
app.use('/claim', require('./src/routes/claim')); // POST
app.use('/payout', require('./src/routes/payout')); // POST
app.use('/dashboard', require('./src/routes/dashboard')); // GET
app.use('/wallet', require('./src/routes/wallet')); // POST
app.use('/predict-premium', require('./src/routes/predictPremium')); // POST
app.use('/billing', require('./src/routes/billing')); // POST

// Health
app.get('/', (_req, res) => res.json({ status: 'ok', app: 'GigWise API' }));

// Hourly trigger cron job
cron.schedule('0 * * * *', async () => {
  console.log('Running hourly trigger check...');
  try {
    const activePolicies = await listActivePoliciesWithUsers();
    for (const policy of activePolicies) {
      const user = policy.userId;
      const weather = await fetchWeather(user.city);
      const aqi = await fetchAQI(user.city);
      const triggerType = evaluateTriggers(weather, aqi);
      if (triggerType) {
        console.log(`Eligible ${triggerType} event detected for ${user.name} in ${user.city}`);
      }
    }
  } catch (err) {
    console.error('Cron trigger error', err.message);
  }
});

const evaluateTriggers = (weather, aqi) => {
  if (!weather || !weather.hourly) return null;
  const rain = weather.hourly.rain?.[0] || 0;
  const temp = weather.hourly.temperature_2m?.[0] || 0;
  const aqiValue = aqi?.value || 0;
  if (rain > 50) return 'RAIN';
  if (temp > 45) return 'HEAT';
  if (aqiValue > 300) return 'POLLUTION';
  return null;
};

async function assertFastApiHealthy() {
  const response = await fetch(`${ML_API_URL}/health`, {
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    throw new Error(`FastAPI health check failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.status !== 'ok') {
    throw new Error(`FastAPI health check returned unexpected payload: ${JSON.stringify(payload)}`);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchLocalMlService() {
  const child = spawn(
    FASTAPI_PYTHON_BIN,
    ['-m', 'uvicorn', 'main:app', '--host', FASTAPI_HOST, '--port', FASTAPI_PORT],
    {
      cwd: FASTAPI_WORKDIR,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }
  );

  child.unref();
}

async function ensureMlServiceAvailable() {
  try {
    await assertFastApiHealthy();
    return true;
  } catch (_error) {
    console.warn('ML service unavailable, attempting local startup');
  }

  try {
    launchLocalMlService();
  } catch (error) {
    console.warn(`ML service startup failed, fallback will be used: ${error.message}`);
    return false;
  }

  let lastHealthError = null;

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    await wait(1000);

    try {
      await assertFastApiHealthy();
      console.log('ML service is available');
      return true;
    } catch (error) {
      lastHealthError = error;
      // Give the local FastAPI process time to boot before falling back.
    }
  }

  console.warn(
    `ML service unavailable, fallback will be used${lastHealthError ? `: ${lastHealthError.message}` : ''}`
  );
  return false;
}

async function startServer() {
  const mlAvailable = await ensureMlServiceAvailable();

  const server = app.listen(PORT, HOST, () =>
    console.log(
      `GigWise API running on http://${HOST}:${PORT}${mlAvailable ? '' : ' with heuristic ML fallback'}`
    )
  );

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${PORT} is already in use. Stop the other GigWise API instance or set a different PORT value before starting the backend again.`
      );
      return;
    }

    console.error('Server startup error', err.message);
  });

  return server;
}

startServer().catch((error) => {
  console.error(`Node backend startup failed: ${error.message}`);
  process.exit(1);
});

module.exports = app;
