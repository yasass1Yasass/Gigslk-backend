require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const cors = require('cors'); // Import cors
const app = express();
const authRoutes = require('./routes/authRoutes');
const performerRoutes = require('./routes/performerRoutes'); // Import performer routes
const hostRoutes = require('./routes/hostRoutes'); // NEW: Import host routes
const pool = require('./config/db');
const path = require('path'); // Import path module
const adminRoutes = require('./routes/adminRoutes');

// Middleware
app.use(cors()); // Enable CORS for all origins (for development)
app.use(express.json()); // To parse JSON request bodies

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.use('/api/auth', authRoutes);
app.use('/api/performers', performerRoutes);
app.use('/api/hosts', hostRoutes); 
app.use('/api/admin', adminRoutes); 
app.get('/', (req, res) => {
    res.send('Gigs.lk Backend is running!');
});


const PORT = process.env.PORT || 5000;

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
