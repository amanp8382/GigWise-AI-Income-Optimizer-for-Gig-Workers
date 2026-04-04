const router = require('express').Router();
const { fetchWeather, fetchAQI } = require('../services/weatherService');

router.get('/', async (req, res) => {
  try {
    const city = req.query.city || 'mumbai';
    const location = {
      city,
      latitude: req.query.latitude,
      longitude: req.query.longitude
    };
    const weather = await fetchWeather(location);
    const aqi = await fetchAQI(location);
    res.json({
      city,
      resolvedLocation: weather?.resolvedLocation || aqi?.resolvedLocation || null,
      weather,
      aqi
    });
  } catch (err) {
    console.error('Weather error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
