const db = require('../config/db'); 
const jwt = require('jsonwebtoken'); 
const upload = require('../config/multerConfig'); // Import multer configuration

// Function to get a host's profile for a specific logged-in user
exports.getHostProfile = async (req, res) => {
    const userId = req.user.id; // User ID from authenticated token

    try {
        // Fetch user details from the users table (to get username for fallback)
        const [userRows] = await db.query('SELECT username, email, role FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const user = userRows[0];

        // Fetch host profile details from the hosts table
        const [hostRows] = await db.query('SELECT * FROM hosts WHERE user_id = ?', [userId]);

        if (hostRows.length === 0) {
            // If no host profile exists, return a default/empty profile
            return res.status(200).json({
                message: 'Host profile not found, returning default.',
                profile: {
                    user_id: userId,
                    company_organization: user.username, // Default from user's username
                    contact_person: '',
                    contact_number: '',
                    location: 'Not Set',
                    event_types_typically_hosted: [],
                    bio: '',
                    default_budget_range_min: 0,
                    default_budget_range_max: 0,
                    preferred_performer_types: [],
                    preferred_locations_for_gigs: [],
                    urgent_booking_enabled: false,
                    email_notifications_enabled: false,
                    sms_notifications_enabled: false,
                    profile_picture_url: 'https://placehold.co/150x150/553c9a/ffffff?text=Host',
                    gallery_images: [],
                    events_hosted: 0, // Default display value
                    average_rating: 0, 
                    total_reviews: 0,
                }
            });
        }

        const hostProfile = hostRows[0];

        // Parse JSON fields from DB (TEXT columns storing JSON arrays)
        hostProfile.event_types_typically_hosted = hostProfile.event_types_typically_hosted ? JSON.parse(hostProfile.event_types_typically_hosted) : [];
        hostProfile.preferred_performer_types = hostProfile.preferred_performer_types ? JSON.parse(hostProfile.preferred_performer_types) : [];
        hostProfile.preferred_locations_for_gigs = hostProfile.preferred_locations_for_gigs ? JSON.parse(hostProfile.preferred_locations_for_gigs) : [];
        hostProfile.gallery_images = hostProfile.gallery_images ? JSON.parse(hostProfile.gallery_images) : [];

        // Map database fields to frontend HostProfile interface names
        const formattedProfile = {
            id: hostProfile.id,
            user_id: hostProfile.user_id,
            company_organization: hostProfile.company_organization,
            contact_person: hostProfile.contact_person,
            contact_number: hostProfile.contact_number,
            location: hostProfile.location,
            event_types_typically_hosted: hostProfile.event_types_typically_hosted,
            bio: hostProfile.bio,
            default_budget_range_min: parseFloat(hostProfile.default_budget_range_min), // Convert DECIMAL to number
            default_budget_range_max: parseFloat(hostProfile.default_budget_range_max), 
            preferred_performer_types: hostProfile.preferred_performer_types,
            preferred_locations_for_gigs: hostProfile.preferred_locations_for_gigs,
            urgent_booking_enabled: hostProfile.urgent_booking_enabled === 1, // Convert TINYINT to boolean
            email_notifications_enabled: hostProfile.email_notifications_enabled === 1, // Convert TINYINT to boolean
            sms_notifications_enabled: hostProfile.sms_notifications_enabled === 1, // Convert TINYINT to boolean
            profile_picture_url: hostProfile.profile_picture_url,
            gallery_images: hostProfile.gallery_images,
            events_hosted: hostProfile.events_hosted, // Assuming these are in DB or calculated
            average_rating: hostProfile.average_rating, // Assuming these are in DB or calculated
            total_reviews: hostProfile.total_reviews, // Assuming these are in DB or calculated
        };

        res.status(200).json({ message: 'Host profile fetched successfully.', profile: formattedProfile });

    } catch (error) {
        console.error('Error fetching host profile:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};

// Function to update a host's profile
exports.updateHostProfile = async (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error('Multer upload error:', err);
            return res.status(400).json({ message: err.message || 'File upload failed.' });
        }

        const userId = req.user.id; // User ID from authenticated token
        const {
            company_organization,
            contact_person,
            contact_number,
            location,
            event_types_typically_hosted, // JSON string from frontend
            bio,
            default_budget_range_min,
            default_budget_range_max,
            preferred_performer_types, // JSON string from frontend
            preferred_locations_for_gigs, 
            urgent_booking_enabled, // '0' or '1' string from frontend
            email_notifications_enabled, 
            sms_notifications_enabled, // '0' or '1' string from frontend
            profile_picture_url, // Existing profile picture URL from frontend
            gallery_images: galleryImagesFromBody, // Existing gallery images from frontend (JSON string)
        } = req.body;

        // Get file paths from req.files (newly uploaded files)
        const profilePictureFile = req.files && req.files['profile_picture'] ? req.files['profile_picture'][0] : null;
        const galleryImageFiles = req.files && req.files['gallery_images'] ? req.files['gallery_images'] : [];

        // Construct URLs for newly uploaded files
        const newProfilePictureUrl = profilePictureFile ? `/uploads/${profilePictureFile.filename}` : null;
        const newGalleryImageUrls = galleryImageFiles.map(file => `/uploads/${file.filename}`);

        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            // Determine final profile picture URL
            let finalProfilePictureUrl = null;
            if (newProfilePictureUrl) {
                finalProfilePictureUrl = newProfilePictureUrl;
            } else if (profile_picture_url !== undefined && profile_picture_url !== null) {
                if (profile_picture_url === '') {
                    finalProfilePictureUrl = null;
                } else {
                    finalProfilePictureUrl = profile_picture_url.startsWith('http://localhost:5000/uploads/')
                        ? profile_picture_url.replace('http://localhost:5000', '')
                        : profile_picture_url;
                }
            }

            // Determine final gallery images URLs
            let finalGalleryImageUrls = galleryImagesFromBody ? JSON.parse(galleryImagesFromBody) : [];
            finalGalleryImageUrls = finalGalleryImageUrls.map(url =>
                url.startsWith('http://localhost:5000/uploads/')
                    ? url.replace('http://localhost:5000', '')
                    : url
            );
            finalGalleryImageUrls = [...finalGalleryImageUrls, ...newGalleryImageUrls];
            const galleryImagesJson = JSON.stringify(finalGalleryImageUrls);

            // Parse JSON strings for array fields from frontend
            const parsedEventTypes = event_types_typically_hosted ? JSON.parse(event_types_typically_hosted) : [];
            const parsedPreferredPerformerTypes = preferred_performer_types ? JSON.parse(preferred_performer_types) : [];
            const parsedPreferredLocations = preferred_locations_for_gigs ? JSON.parse(preferred_locations_for_gigs) : [];

            // Convert boolean strings ('0'/'1') to numbers (0/1) for TINYINT columns
            const urgentBookingEnabledInt = parseInt(urgent_booking_enabled, 10);
            const emailNotificationsEnabledInt = parseInt(email_notifications_enabled, 10);
            const smsNotificationsEnabledInt = parseInt(sms_notifications_enabled, 10);

            // Check if a host profile already exists for this user_id
            const [existingProfileCheck] = await connection.query('SELECT id FROM hosts WHERE user_id = ?', [userId]);

            if (existingProfileCheck.length > 0) {
                // Update existing profile
                await connection.query(
                    `UPDATE hosts SET
                    company_organization = ?,
                    contact_person = ?,
                    contact_number = ?,
                    location = ?,
                    event_types_typically_hosted = ?,
                    bio = ?,
                    default_budget_range_min = ?,
                    default_budget_range_max = ?,
                    preferred_performer_types = ?,
                    preferred_locations_for_gigs = ?,
                    urgent_booking_enabled = ?,
                    email_notifications_enabled = ?,
                    sms_notifications_enabled = ?,
                    profile_picture_url = ?,
                    gallery_images = ?
                    WHERE user_id = ?`,
                    [
                        company_organization,
                        contact_person,
                        contact_number,
                        location,
                        JSON.stringify(parsedEventTypes), // Store as JSON string
                        bio,
                        parseFloat(default_budget_range_min), // Ensure decimal is stored correctly
                        parseFloat(default_budget_range_max), 
                        JSON.stringify(parsedPreferredPerformerTypes), // Store as JSON string
                        JSON.stringify(parsedPreferredLocations), 
                        urgentBookingEnabledInt, // Store as 0 or 1
                        emailNotificationsEnabledInt, 
                        smsNotificationsEnabledInt,
                        finalProfilePictureUrl,
                        galleryImagesJson,
                        userId
                    ]
                );
                await connection.commit();
                res.status(200).json({ message: 'Host profile updated successfully.' });
            } else {
                // Insert new profile (should ideally happen during registration)
                await connection.query(
                    `INSERT INTO hosts (
                        user_id, company_organization, contact_person, contact_number, location,
                        event_types_typically_hosted, bio, default_budget_range_min, default_budget_range_max,
                        preferred_performer_types, preferred_locations_for_gigs, urgent_booking_enabled,
                        email_notifications_enabled, sms_notifications_enabled, profile_picture_url,
                        gallery_images, events_hosted, average_rating, total_reviews
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        userId,
                        company_organization,
                        contact_person,
                        contact_number,
                        location,
                        JSON.stringify(parsedEventTypes),
                        bio,
                        parseFloat(default_budget_range_min),
                        parseFloat(default_budget_range_max),
                        JSON.stringify(parsedPreferredPerformerTypes),
                        JSON.stringify(parsedPreferredLocations),
                        urgentBookingEnabledInt,
                        emailNotificationsEnabledInt,
                        smsNotificationsEnabledInt,
                        finalProfilePictureUrl,
                        galleryImagesJson,
                        0, // Default events_hosted
                        0, 
                        0, 
                    ]
                );
                await connection.commit();
                res.status(201).json({ message: 'Host profile created successfully.' });
            }

        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            console.error('Error updating/creating host profile:', error);
            res.status(500).json({ message: 'Internal server error.', error: error.message });
        } finally {
            if (connection) {
                connection.release();
            }
        }
    });
};
