const pool = require('../config/db'); // Import the database connection pool
const bcrypt = require('bcryptjs'); // For password hashing
const jwt = require('jsonwebtoken'); // For creating JWTs (for login)

// --- User Registration Controller ---
exports.registerUser = async (req, res) => {
    const { email, password, username, role } = req.body;

    // Basic validation: Check if email, password, and username are provided.
    if (!email || !password || !username) {
        return res.status(400).json({ message: 'Please enter all required fields: email, password, username, role' });
    }

    // Specific role validation: Check if the provided role is valid.
    if (!['host', 'performer'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role specified. Must be "host" or "performer".' });
    }

    let connection;
    try {
        connection = await pool.getConnection(); // Get a connection from the pool
        await connection.beginTransaction(); // Start a transaction

        // 1. Check if user already exists
        const [existingUsers] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            await connection.rollback(); // Rollback transaction if user exists
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        // 2. Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Insert into users table
        const [userResult] = await connection.execute(
            'INSERT INTO users (email, password, username, role) VALUES (?, ?, ?, ?)',
            [email, hashedPassword, username, role]
        );
        const userId = userResult.insertId; // Get the ID of the newly inserted user

        // 4. Insert into role-specific table (performers or hosts)
        if (role === 'performer') {
            await connection.execute(
                'INSERT INTO performers (user_id, stage_name, location) VALUES (?, ?, ?)',
                [userId, username, null] 
            );
        } else if (role === 'host') {
            await connection.execute(
                'INSERT INTO hosts (user_id, company_organization, location) VALUES (?, ?, ?)',
                [userId, username, null] 
            );
        }

        await connection.commit(); // Commit the transaction
        res.status(201).json({ message: 'User registered successfully!', userId: userId, role: role });

    } catch (error) {
        if (connection) {
            await connection.rollback(); // Rollback on error
        }
        console.error('Error in registerUser:', error);
        res.status(500).json({ message: 'Server error during registration.', error: error.message });
    } finally {
        if (connection) {
            connection.release(); // Always release the connection
        }
    }
};

// --- User Login Controller ---
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
        return res.status(400).json({ message: 'Please enter both email and password.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();

        // 1. Check if user exists
        const [users] = await connection.execute('SELECT id, email, password, role FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        const user = users[0];

        // 2. Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        // 3. Generate JWT
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET || 'supersecretjwtkey',
            { expiresIn: '1h' }
        );

        res.status(200).json({
            message: 'Login successful!',
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Error in loginUser:', error);
        res.status(500).json({ message: 'Server error during login.', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};
