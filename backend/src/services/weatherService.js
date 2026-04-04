const axios = require('axios');

const cityCoordinates = {
  mumbai: { latitude: 19.076, longitude: 72.8777 },
  delhi: { latitude: 28.6139, longitude: 77.209 },
  bangalore: { latitude: 12.9716, longitude: 77.5946 },
  bengaluru: { latitude: 12.9716, longitude: 77.5946 },
  hyderabad: { latitude: 17.385, longitude: 78.4867 },
  chennai: { latitude: 13.0827, longitude: 80.2707 },
  kolkata: { latitude: 22.5726, longitude: 88.3639 }
};

const fallbackProfiles = {
  mumbai: { temperature: 31, rain: 3.6, wind: 18, weatherCode: 61, aqi: 118, pm25: 36, pm10: 68 },
  delhi: { temperature: 34, rain: 0.4, wind: 14, weatherCode: 1, aqi: 182, pm25: 78, pm10: 132 },
  bangalore: { temperature: 27, rain: 1.1, wind: 12, weatherCode: 3, aqi: 74, pm25: 24, pm10: 44 },
  hyderabad: { temperature: 32, rain: 0.7, wind: 15, weatherCode: 2, aqi: 101, pm25: 33, pm10: 58 },
  chennai: { temperature: 33, rain: 1.8, wind: 20, weatherCode: 63, aqi: 96, pm25: 29, pm10: 54 },
  kolkata: { temperature: 31, rain: 2.2, wind: 16, weatherCode: 53, aqi: 128, pm25: 42, pm10: 76 }
};

const defaultCoords = { latitude: 19.076, longitude: 72.8777 };
const defaultFallback = fallbackProfiles.mumbai;
const geocodeCache = new Map();

const PM25_BREAKPOINTS = [
  { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
  { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
  { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
  { cLow: 350.5, cHigh: 500.4, iLow: 401, iHigh: 500 }
];

const PM10_BREAKPOINTS = [
  { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
  { cLow: 55, cHigh: 154, iLow: 51, iHigh: 100 },
  { cLow: 155, cHigh: 254, iLow: 101, iHigh: 150 },
  { cLow: 255, cHigh: 354, iLow: 151, iHigh: 200 },
  { cLow: 355, cHigh: 424, iLow: 201, iHigh: 300 },
  { cLow: 425, cHigh: 504, iLow: 301, iHigh: 400 },
  { cLow: 505, cHigh: 604, iLow: 401, iHigh: 500 }
];

const toNumberOrNull = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveLocationInput = (input = 'mumbai') => {
  if (typeof input === 'string') {
    const city = String(input || 'mumbai').trim();
    const key = city.toLowerCase();
    return {
      city,
      key,
      coords: cityCoordinates[key] || null
    };
  }

  const city = String(input.city || 'mumbai').trim();
  const key = city.toLowerCase();
  const latitude = toNumberOrNull(input.latitude);
  const longitude = toNumberOrNull(input.longitude);
  const hasCoords = latitude != null && longitude != null;

  return {
    city,
    key,
    coords: hasCoords
      ? { latitude, longitude }
      : cityCoordinates[key] || null
  };
};

const getFallbackProfile = (city = 'mumbai') =>
  fallbackProfiles[city.toLowerCase()] || defaultFallback;

async function geocodeCity(city) {
  const key = String(city || '').trim().toLowerCase();
  if (!key) return null;
  if (cityCoordinates[key]) return cityCoordinates[key];
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  try {
    const geocodeUrl =
      process.env.OPEN_METEO_GEOCODE_URL || 'https://geocoding-api.open-meteo.com/v1/search';
    const { data } = await axios.get(geocodeUrl, {
      params: {
        name: city,
        count: 1,
        language: 'en',
        countryCode: 'IN',
        format: 'json'
      }
    });

    const match = data?.results?.[0];
    const coords =
      match && Number.isFinite(match.latitude) && Number.isFinite(match.longitude)
        ? { latitude: match.latitude, longitude: match.longitude }
        : null;

    if (coords) {
      geocodeCache.set(key, coords);
    }

    return coords;
  } catch (_err) {
    return null;
  }
}

async function resolveCoords(input) {
  const { city, coords } = resolveLocationInput(input);
  if (coords) {
    return { city, coords };
  }

  const geocodedCoords = await geocodeCity(city);
  if (geocodedCoords) {
    return { city, coords: geocodedCoords };
  }

  return { city, coords: defaultCoords };
}

function interpolateAqi(value, breakpoints) {
  if (!Number.isFinite(value) || value < 0) return 0;

  const match = breakpoints.find((range) => value >= range.cLow && value <= range.cHigh);
  if (!match) {
    return value > breakpoints.at(-1).cHigh ? 500 : 0;
  }

  const { cLow, cHigh, iLow, iHigh } = match;
  return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (value - cLow) + iLow);
}

function calculateUsAqiFromParticles(pm25, pm10) {
  const pm25Value = Number.isFinite(pm25) ? Math.floor(pm25 * 10) / 10 : NaN;
  const pm10Value = Number.isFinite(pm10) ? Math.floor(pm10) : NaN;

  const pm25Aqi = interpolateAqi(pm25Value, PM25_BREAKPOINTS);
  const pm10Aqi = interpolateAqi(pm10Value, PM10_BREAKPOINTS);

  return Math.max(pm25Aqi, pm10Aqi, 0);
}

async function fetchWeather(input = 'mumbai') {
  try {
    const { city, coords } = await resolveCoords(input);
    const baseUrl = process.env.OPEN_METEO_URL || 'https://api.open-meteo.com/v1/forecast';
    const url = `${baseUrl}?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,rain,weather_code,wind_speed_10m,is_day&hourly=rain,temperature_2m,weather_code&forecast_days=1&timezone=auto`;
    const { data } = await axios.get(url);
    return {
      ...data,
      resolvedLocation: {
        city,
        latitude: coords.latitude,
        longitude: coords.longitude
      },
      source: 'live_api'
    };
  } catch (err) {
    const { city, coords } = await resolveCoords(input);
    const fallback = getFallbackProfile(city);
    console.error('Weather fetch failed, returning deterministic fallback', err.message);
    return {
      current: {
        time: new Date().toISOString(),
        temperature_2m: fallback.temperature,
        rain: fallback.rain,
        weather_code: fallback.weatherCode,
        wind_speed_10m: fallback.wind,
        is_day: 1
      },
      hourly: {
        rain: [fallback.rain],
        temperature_2m: [fallback.temperature],
        weather_code: [fallback.weatherCode]
      },
      resolvedLocation: {
        city,
        latitude: coords.latitude,
        longitude: coords.longitude
      },
      source: 'deterministic_fallback'
    };
  }
}

async function fetchAQI(input = 'mumbai') {
  try {
    const { city, coords } = await resolveCoords(input);
    const url =
      process.env.AQI_API_URL || 'https://air-quality-api.open-meteo.com/v1/air-quality';
    const { data } = await axios.get(url, {
      params: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        current: 'pm2_5,pm10',
        timezone: 'auto'
      }
    });

    const pm25 = Number(data?.current?.pm2_5);
    const pm10 = Number(data?.current?.pm10);
    const computedUsAqi = calculateUsAqiFromParticles(pm25, pm10);

    return {
      city,
      value: computedUsAqi,
      current: {
        ...(data?.current || {}),
        us_aqi: computedUsAqi
      },
      resolvedLocation: {
        latitude: coords.latitude,
        longitude: coords.longitude
      },
      source: 'live_api_computed'
    };
  } catch (err) {
    const { city, coords } = await resolveCoords(input);
    const fallback = getFallbackProfile(city);
    console.error('AQI fetch failed, returning deterministic fallback', err.message);
    return {
      city,
      value: fallback.aqi,
      current: {
        us_aqi: fallback.aqi,
        pm2_5: fallback.pm25,
        pm10: fallback.pm10
      },
      resolvedLocation: {
        latitude: coords.latitude,
        longitude: coords.longitude
      },
      source: 'deterministic_fallback'
    };
  }
}

module.exports = { fetchWeather, fetchAQI };
