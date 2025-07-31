const db = require('../config/db');
const jwt = require('jsonwebtoken');
const upload = require('../config/multerConfig');

// Function to get a performer's profile (for a specific logged-in user)
exports.getPerformerProfile = async (req, res) => {
    const userId = req.user.id; // User ID from authenticated token

    try {
        // Fetch user details from the users table
        const [userRows] = await db.query('SELECT username, email, role FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const user = userRows[0];

        // Fetch performer profile details from the performers table
        const [performerRows] = await db.query('SELECT * FROM performers WHERE user_id = ?', [userId]);

        if (performerRows.length === 0) {
            // If no performer profile exists, return a default/empty profile
            return res.status(200).json({
                message: 'Performer profile not found, returning default.',
                profile: {
                    user_id: userId,
                    full_name: user.username, // Default from user's username
                    stage_name: user.username,
                    location: 'Not Set',
                    performance_type: 'Not Set',
                    bio: 'Tell us about your talent and experience!',
                    price: 'Rs. 0 - Rs. 0',
                    skills: [],
                    profile_picture_url: 'https://placehold.co/150x150/553c9a/ffffff?text=Profile',
                    contact_number: 'Not Set',
                    direct_booking: false,
                    travel_distance: 0,
                    availability_weekdays: false,
                    availability_weekends: false,
                    availability_morning: false,
                    availability_evening: false,
                    gallery_images: [],
                    rating: 0,
                    review_count: 0,
                }
            });
        }

        const performerProfile = performerRows[0];

        // Parse JSON fields
        performerProfile.skills = performerProfile.skills ? JSON.parse(performerProfile.skills) : [];
        performerProfile.gallery_images = performerProfile.gallery_images ? JSON.parse(performerProfile.gallery_images) : [];

        // Map database fields to frontend PerformerProfile interface names
        const formattedProfile = {
            id: performerProfile.id,
            user_id: performerProfile.user_id,
            full_name: performerProfile.full_name,
            stage_name: performerProfile.stage_name,
            location: performerProfile.location,
            performance_type: performerProfile.performance_type,
            bio: performerProfile.bio,
            price: performerProfile.price_display, // Map price_display to price
            skills: performerProfile.skills,
            profile_picture_url: performerProfile.profile_picture_url,
            contact_number: performerProfile.contact_number,
            direct_booking: performerProfile.accept_direct_booking === 1, // Convert TINYINT to boolean
            travel_distance: performerProfile.travel_distance_km, // Map travel_distance_km
            availability_weekdays: performerProfile.preferred_availability_weekdays === 1,
            availability_weekends: performerProfile.preferred_availability_weekends === 1,
            availability_morning: performerProfile.preferred_availability_mornings === 1,
            availability_evening: performerProfile.preferred_availability_evenings === 1,
            gallery_images: performerProfile.gallery_images,
            rating: performerProfile.average_rating,
            review_count: performerProfile.total_reviews,
        };

        res.status(200).json({ message: 'Performer profile fetched successfully.', profile: formattedProfile });

    } catch (error) {
        console.error('Error fetching performer profile:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};

// Function to update a performer's profile
exports.updatePerformerProfile = async (req, res) => {

    const BASE_URL = 'https://gigslk-backend-production.up.railway.app';

    upload(req, res, async (err) => {
        if (err) {
            console.error('Multer upload error:', err);
            return res.status(400).json({ message: err.message || 'File upload failed.' });
        }

        const userId = req.user.id; // User ID from authenticated token
        const {
            full_name,
            stage_name,
            location,
            performance_type,
            bio,
            price,
            skills,
            profile_picture_url, // This is the string from req.body
            contact_number,
            direct_booking,
            travel_distance,
            availability_weekdays,
            availability_weekends,
            availability_morning,
            availability_evening,
            gallery_images: galleryImagesFromBody,
        } = req.body;

        // Get file paths from req.files (newly uploaded files)
        const profilePictureFile = req.files && req.files['profile_picture'] ? req.files['profile_picture'][0] : null;
        const galleryImageFiles = req.files && req.files['gallery_images'] ? req.files['gallery_images'] : [];

        let connection;
        try {
            connection = await db.getConnection(); // Get a connection from the pool
            await connection.beginTransaction(); // Start a transaction

            // --- 1. Determine the final profile picture URL ---
            let finalProfilePictureUrl = null;
            if (profilePictureFile) {
                // A new file was uploaded, construct a full URL
                finalProfilePictureUrl = `${BASE_URL}/uploads/${profilePictureFile.filename}`;
            } else if (profile_picture_url) {
                // An existing URL was sent from the frontend
                finalProfilePictureUrl = profile_picture_url;
            }
            // If neither is present, finalProfilePictureUrl remains null.


            // --- 2. Determine the final gallery images URLs ---
            // Parse existing gallery images from the frontend (which should be full URLs)
            const parsedExistingGalleryUrls = galleryImagesFromBody ? JSON.parse(galleryImagesFromBody) : [];

            // Construct full URLs for newly uploaded gallery images
            const newlyUploadedGalleryUrls = galleryImageFiles.map(file =>
                `${BASE_URL}/uploads/${file.filename}`
            );

            // Combine existing and new full URLs
            const finalGalleryImageUrls = [...parsedExistingGalleryUrls, ...newlyUploadedGalleryUrls];

            // Stringify the final array of full URLs for database storage
            const galleryImagesJson = JSON.stringify(finalGalleryImageUrls);


            // Parse skills and other fields
            const skillsJson = JSON.stringify(skills ? JSON.parse(skills) : []);
            const directBookingTinyInt = direct_booking ? 1 : 0;
            const travelDistanceInt = parseInt(travel_distance, 10);
            const availabilityWeekdaysTinyInt = availability_weekdays ? 1 : 0;
            const availabilityWeekendsTinyInt = availability_weekends ? 1 : 0;
            const availabilityMorningTinyInt = availability_morning ? 1 : 0;
            const availabilityEveningTinyInt = availability_evening ? 1 : 0;

            // Check if a performer profile already exists for this user_id
            const [existingProfileCheck] = await connection.query('SELECT id FROM performers WHERE user_id = ?', [userId]);

            if (existingProfileCheck.length > 0) {
                // Update existing profile
                await connection.query(
                    `UPDATE performers SET
                    full_name = ?,
                    stage_name = ?,
                    location = ?,
                    performance_type = ?,
                    bio = ?,
                    price_display = ?,
                    skills = ?,
                    profile_picture_url = ?,
                    contact_number = ?,
                    accept_direct_booking = ?,
                    travel_distance_km = ?,
                    preferred_availability_weekdays = ?,
                    preferred_availability_weekends = ?,
                    preferred_availability_mornings = ?,
                    preferred_availability_evenings = ?,
                    gallery_images = ?
                    WHERE user_id = ?`,
                    [
                        full_name,
                        stage_name,
                        location,
                        performance_type,
                        bio,
                        price,
                        skillsJson,
                        finalProfilePictureUrl,
                        contact_number,
                        directBookingTinyInt,
                        travelDistanceInt,
                        availabilityWeekdaysTinyInt,
                        availabilityWeekendsTinyInt,
                        availabilityMorningTinyInt,
                        availabilityEveningTinyInt,
                        galleryImagesJson, // Use the JSON string of full URLs
                        userId
                    ]
                );
                await connection.commit();
                res.status(200).json({ message: 'Performer profile updated successfully.' });
            } else {
                await connection.query(
                    `INSERT INTO performers (
                        user_id, full_name, stage_name, location, performance_type, bio, price_display, skills,
                        profile_picture_url, contact_number, accept_direct_booking, travel_distance_km,
                        preferred_availability_weekdays, preferred_availability_weekends,
                        preferred_availability_mornings, preferred_availability_evenings, gallery_images
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        userId,
                        full_name,
                        stage_name,
                        location,
                        performance_type,
                        bio,
                        price,
                        skillsJson,
                        finalProfilePictureUrl,
                        contact_number,
                        directBookingTinyInt,
                        travelDistanceInt,
                        availabilityWeekdaysTinyInt,
                        availabilityWeekendsTinyInt,
                        availabilityMorningTinyInt,
                        availabilityEveningTinyInt,
                        galleryImagesJson, // Use the JSON string of full URLs
                    ]
                );
                await connection.commit();
                res.status(201).json({ message: 'Performer profile created successfully.' });
            }

        } catch (error) {
            if (connection) {
                await connection.rollback(); // Rollback on error
            }
            console.error('Error updating/creating performer profile:', error);
            res.status(500).json({ message: 'Internal server error.', error: error.message });
        } finally {
            if (connection) {
                connection.release(); // Always release the connection
            }
        }
    });
};

// Function to get all performer profiles for public browsing
exports.getAllPerformerProfiles = async (req, res) => {
    try {
        const [performerRows] = await db.query('SELECT * FROM performers');

        const allProfiles = performerRows.map(performerProfile => {
            // Parse JSON fields
            performerProfile.skills = performerProfile.skills ? JSON.parse(performerProfile.skills) : [];
            performerProfile.gallery_images = performerProfile.gallery_images ? JSON.parse(performerProfile.gallery_images) : [];

            // Map database fields to frontend PerformerProfile interface names
            return {
                id: performerProfile.id,
                user_id: performerProfile.user_id,
                full_name: performerProfile.full_name,
                stage_name: performerProfile.stage_name,
                location: performerProfile.location,
                performance_type: performerProfile.performance_type,
                bio: performerProfile.bio,
                price: performerProfile.price_display, // Map price_display to price
                skills: performerProfile.skills,
                profile_picture_url: performerProfile.profile_picture_url,
                contact_number: performerProfile.contact_number,
                direct_booking: performerProfile.accept_direct_booking === 1, // Convert TINYINT to boolean
                travel_distance: performerProfile.travel_distance_km, // Map travel_distance_km
                availability_weekdays: performerProfile.preferred_availability_weekdays === 1,
                availability_weekends: performerProfile.preferred_availability_weekends === 1,
                availability_morning: performerProfile.preferred_availability_mornings === 1,
                availability_evening: performerProfile.preferred_availability_evenings === 1,
                gallery_images: performerProfile.gallery_images,
                rating: performerProfile.average_rating,
                review_count: performerProfile.total_reviews,
            };
        });

        res.status(200).json({ message: 'All performer profiles fetched successfully.', profiles: allProfiles });

    } catch (error) {
        console.error('Error fetching all performer profiles:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};
