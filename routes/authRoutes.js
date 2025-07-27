const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController'); 


console.log('authController (in routes):', authController);
console.log('authController.registerUser (in routes):', authController.registerUser);
console.log('authController.loginUser (in routes):', authController.loginUser); // Add this specific log


router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser); 

module.exports = router;