const express = require('express');
const router = express.Router();
const hostController = require('../controllers/hostController');
const auth = require('../middleware/authMiddleware'); 


router.get('/profile', auth, hostController.getHostProfile);

router.put('/profile', auth, hostController.updateHostProfile);

module.exports = router;
