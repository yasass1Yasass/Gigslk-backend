const express = require('express');
const router = express.Router();
const performerController = require('../controllers/performerController');
const auth = require('../middleware/authMiddleware'); 

// Route to get performer profile 
router.get('/profile', auth, performerController.getPerformerProfile);

// Route to update performer profile
router.put('/profile', auth, performerController.updatePerformerProfile);

// NEW: Route to get all performer profiles (public - for browsing)
router.get('/', performerController.getAllPerformerProfiles); // No auth middleware needed here

module.exports = router;
