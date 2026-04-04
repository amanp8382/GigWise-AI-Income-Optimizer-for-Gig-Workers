const router = require('express').Router();
const { fetchWeather, fetchAQI } = require('../services/weatherService');
const { createClaim, findUserById, saveUser } = require('../store/dataStore');

const evaluateTriggers = (weather, aqi) => {
  if (!weather || !weather.hourly) return null;
  const rain = weather.hourly.rain?.[0] || 0;
  const temp = weather.hourly.temperature_2m?.[0] || 0;
  const aqiValue = aqi?.value || 0;
  if (rain > 50) return { type: 'RAIN', value: rain };
  if (temp > 45) return { type: 'HEAT', value: temp };
  if (aqiValue > 300) return { type: 'POLLUTION', value: aqiValue };
  return null;
};

const createClaimAndPayout = async (user, triggerType, metricValue) => {
  const payout = 200 + Math.floor(Math.random() * 301); // 200-500
  const claim = await createClaim({
    userId: user._id,
    triggerType,
    payout,
    status: 'APPROVED',
    eventCity: user.city,
    reason: `${triggerType} = ${metricValue}. Condition met. Rs ${payout} credited.`
  });

  user.earnings = (user.earnings || 0) + payout;
  await saveUser(user);

  return { claim, payout };
};

router.post('/', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const weather = await fetchWeather(user.city);
    const aqi = await fetchAQI(user.city);
    const trigger = evaluateTriggers(weather, aqi);

    if (!trigger) return res.json({ triggered: false, message: 'No trigger met' });

    const { claim, payout } = await createClaimAndPayout(user, trigger.type, trigger.value);
    res.json({ triggered: true, triggerType: trigger.type, payout, claim });
  } catch (err) {
    console.error('Trigger error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
