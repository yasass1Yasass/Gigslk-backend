// backend/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/authMiddleware'); 


router.get('/users', auth, adminController.getAllUsers);
router.post('/users', auth, adminController.addUser);
router.delete('/users/:id', auth, adminController.deleteUser);

module.exports = router;