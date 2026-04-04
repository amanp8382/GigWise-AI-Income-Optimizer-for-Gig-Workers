const router = require('express').Router();
const { createUser, findUserByNameCity } = require('../store/dataStore');

router.post('/', async (req, res) => {
  try {
    const { name, city } = req.body;
    if (!name || !city) {
      return res.status(400).json({ error: 'Name and city are required' });
    }

    let user = await findUserByNameCity(name, city);
    if (!user) {
      user = await createUser({ name, city, earnings: 0 });
    }

    return res.json(user);
  } catch (err) {
    console.error('Register error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
