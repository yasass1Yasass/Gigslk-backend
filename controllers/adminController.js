// backend/controllers/adminController.js
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); 

// Helper to check if user is admin (optional, can be done in middleware too)
const isAdmin = (req) => {
    return req.user && req.user.role === 'admin';
};

// Get all users
exports.getAllUsers = async (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [users] = await connection.execute('SELECT id, username, email, role FROM users'); // Fetch all users
        
        const formattedUsers = users.map(user => ({
            ...user,
            status: 'Active', // Placeholder, fetch from DB if available
            avatar: `https://placehold.co/40x40/553c9a/ffffff?text=${user.username.charAt(0).toUpperCase()}` // Placeholder avatar
        }));
        res.status(200).json({ users: formattedUsers, message: 'Users fetched successfully.' });
    } catch (error) {
        console.error('Error fetching all users:', error);
        res.status(500).json({ message: 'Internal server error.' });
    } finally {
        if (connection) connection.release();
    }
};

// Add a new user (admin only)
exports.addUser = async (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }

    const { username, email, password, role } = req.body;

    if (!username || !email || !password || !role) {
        return res.status(400).json({ message: 'Please provide username, email, password, and role.' });
    }
    if (!['host', 'performer', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role specified.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [existingUser] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const [userResult] = await connection.execute(
            'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, role]
        );
        const userId = userResult.insertId;

        // Initialize profile in respective tables if not admin
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

        await connection.commit();
        res.status(201).json({ message: 'User added successfully!', userId: userId });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error adding user:', error);
        res.status(500).json({ message: 'Server error adding user.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
};

// Delete a user (admin only)
exports.deleteUser = async (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }

    const { id } = req.params; // User ID to delete

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // First, get the role of the user to be deleted to also delete from performer/host tables
        const [userToDelete] = await connection.execute('SELECT role FROM users WHERE id = ?', [id]);
        if (userToDelete.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'User not found.' });
        }
        const userRole = userToDelete[0].role;

        // Delete from role-specific table first
        if (userRole === 'performer') {
            await connection.execute('DELETE FROM performers WHERE user_id = ?', [id]);
        } else if (userRole === 'host') {
            await connection.execute('DELETE FROM hosts WHERE user_id = ?', [id]);
        }

        // Then delete from the users table
        await connection.execute('DELETE FROM users WHERE id = ?', [id]);

        await connection.commit();
        res.status(200).json({ message: 'User deleted successfully.' });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Server error deleting user.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
};

