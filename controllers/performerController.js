const db = require('../config/db');
const jwt = require('jsonwebtoken');
const upload = require('../config/multerConfig');

// Define the base URL for constructing absolute image URLs
const BASE_URL = 'https://gigslk-backend-production.up.railway.app';

// Helper function to convert relative path to absolute URL
const toAbsoluteUrl = (relativePath) => {
    if (!relativePath) return null;
    // Ensure the relativePath starts with a single slash and is not already an absolute URL
    const cleanedPath = relativePath.replace(/^\/+/, '');
    return `${BASE_URL}/${cleanedPath}`;
};

// Helper function to convert absolute URL to relative path for DB storage
const toRelativePath = (absoluteUrl) => {
    if (!absoluteUrl) return null;
    // If it's a temp blob URL, it should not be saved
    if (absoluteUrl.startsWith('blob:')) return null;

    // Check if it's already a relative path (starts with /uploads/)
    if (absoluteUrl.startsWith('/uploads/')) {
        return absoluteUrl;
    }

    // If it starts with BASE_URL, remove it
    if (absoluteUrl.startsWith(BASE_URL)) {
        return absoluteUrl.replace(BASE_URL, '').replace(/^\/+/, '/'); // Ensure it starts with a single /
    }

    // If it's neither, it might be a placeholder or invalid, handle as needed
    // For now, if it's not starting with BASE_URL or /uploads/, assume it's invalid for DB storage
    return null;
};


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
                },
            });
        }

        const performerProfile = performerRows[0];

        // Parse JSON fields
        performerProfile.skills = performerProfile.skills ? JSON.parse(performerProfile.skills) : [];
        performerProfile.gallery_images = performerProfile.gallery_images ? JSON.parse(performerProfile.gallery_images) : [];

        // Map database fields to frontend PerformerProfile interface names and construct absolute URLs
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
            profile_picture_url: toAbsoluteUrl(performerProfile.profile_picture_url),
            contact_number: performerProfile.contact_number,
            direct_booking: performerProfile.accept_direct_booking === 1, // Convert TINYINT to boolean
            travel_distance: performerProfile.travel_distance_km, // Map travel_distance_km
            availability_weekdays: performerProfile.preferred_availability_weekdays === 1,
            availability_weekends: performerProfile.preferred_availability_weekends === 1,
            availability_morning: performerProfile.preferred_availability_mornings === 1,
            availability_evening: performerProfile.preferred_availability_evenings === 1,
            gallery_images: performerProfile.gallery_images.map(url => toAbsoluteUrl(url)).filter(Boolean), // Filter out any nulls
            rating: performerProfile.average_rating,
            review_count: performerProfile.total_reviews,
        };

        res.status(200).json({
            message: 'Performer profile fetched successfully.',
            profile: formattedProfile,
        });
    } catch (error) {
        console.error('Error fetching performer profile:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};

// Function to update a performer's profile
exports.updatePerformerProfile = async (req, res) => {
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
            profile_picture_url, // This is the string from req.body (could be existing absolute URL or empty)
            contact_number,
            direct_booking,
            travel_distance,
            availability_weekdays,
            availability_weekends,
            availability_morning,
            availability_evening,
            gallery_images: galleryImagesFromBody, // JSON string of existing absolute URLs
        } = req.body;

        // Get file paths from req.files (newly uploaded files)
        const profilePictureFile = req.files && req.files['profile_picture'] ? req.files['profile_picture'][0] : null;
        const galleryImageFiles = req.files && req.files['gallery_images'] ? req.files['gallery_images'] : [];

        let connection;
        try {
            connection = await db.getConnection(); // Get a connection from the pool
            await connection.beginTransaction(); // Start a transaction

            // --- 1. Determine the final profile picture URL for DB storage (relative path) ---
            let finalProfilePictureUrl = null;
            if (profilePictureFile) {
                // A new file was uploaded, store its relative path
                finalProfilePictureUrl = `/uploads/${profilePictureFile.filename}`;
            } else if (profile_picture_url) {
                // An existing URL was sent from the frontend. Convert it to a relative path.
                // This handles cases where the frontend sends an absolute URL or an empty string.
                finalProfilePictureUrl = toRelativePath(profile_picture_url);
            }
            // If profile_picture_url was explicitly sent as an empty string, it means user cleared it.
            if (profile_picture_url === '') {
                finalProfilePictureUrl = null;
            }


            // --- 2. Determine the final gallery images URLs for DB storage (array of relative paths) ---
            let existingRelativeGalleryUrls = [];
            if (galleryImagesFromBody) {
                try {
                    const parsedExistingGalleryUrls = JSON.parse(galleryImagesFromBody);
                    // Convert existing absolute URLs from frontend to relative paths for DB
                    existingRelativeGalleryUrls = parsedExistingGalleryUrls
                        .map(url => toRelativePath(url))
                        .filter(Boolean); // Filter out any nulls from invalid conversions
                } catch (parseError) {
                    console.warn('Could not parse gallery_images from body:', parseError);
                    // If parsing fails, treat it as no existing images from body
                    existingRelativeGalleryUrls = [];
                }
            }

            // For newly uploaded files, get their relative paths
            const newlyUploadedGalleryUrls = galleryImageFiles.map(file => `/uploads/${file.filename}`);

            // Combine the arrays of relative paths
            const finalGalleryImageUrls = [...existingRelativeGalleryUrls, ...newlyUploadedGalleryUrls];
            // Stringify the final array of relative URLs for database storage
            const galleryImagesJson = JSON.stringify(finalGalleryImageUrls);

            // Parse skills and other fields
            const skillsJson = JSON.stringify(skills ? JSON.parse(skills) : []);
            const directBookingTinyInt = direct_booking === 'true' || direct_booking === true ? 1 : 0; // Handle boolean from form-data
            const travelDistanceInt = parseInt(travel_distance, 10) || 0;
            const availabilityWeekdaysTinyInt = availability_weekdays === 'true' || availability_weekdays === true ? 1 : 0;
            const availabilityWeekendsTinyInt = availability_weekends === 'true' || availability_weekends === true ? 1 : 0;
            const availabilityMorningTinyInt = availability_morning === 'true' || availability_morning === true ? 1 : 0;
            const availabilityEveningTinyInt = availability_evening === 'true' || availability_evening === true ? 1 : 0;


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
                        galleryImagesJson,
                        userId,
                    ]
                );
                await connection.commit();
                res.status(200).json({ message: 'Performer profile updated successfully.' });
            } else {
                // Create new profile
                await connection.query(
                    `INSERT INTO performers (
                        user_id,
                        full_name,
                        stage_name,
                        location,
                        performance_type,
                        bio,
                        price_display,
                        skills,
                        profile_picture_url,
                        contact_number,
                        accept_direct_booking,
                        travel_distance_km,
                        preferred_availability_weekdays,
                        preferred_availability_weekends,
                        preferred_availability_mornings,
                        preferred_availability_evenings,
                        gallery_images
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
                        galleryImagesJson,
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

// Function to get all performer profiles for public Browse
exports.getAllPerformerProfiles = async (req, res) => {
    try {
        const [performerRows] = await db.query('SELECT * FROM performers');
        const allProfiles = performerRows.map(performerProfile => {
            // Parse JSON fields
            performerProfile.skills = performerProfile.skills ? JSON.parse(performerProfile.skills) : [];
            performerProfile.gallery_images = performerProfile.gallery_images ? JSON.parse(performerProfile.gallery_images) : [];

            // Map database fields to frontend PerformerProfile interface names and construct absolute URLs
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
                profile_picture_url: toAbsoluteUrl(performerProfile.profile_picture_url),
                contact_number: performerProfile.contact_number,
                direct_booking: performerProfile.accept_direct_booking === 1, // Convert TINYINT to boolean
                travel_distance: performerProfile.travel_distance_km, // Map travel_distance_km
                availability_weekdays: performerProfile.preferred_availability_weekdays === 1,
                availability_weekends: performerProfile.preferred_availability_weekends === 1,
                availability_morning: performerProfile.preferred_availability_mornings === 1,
                availability_evening: performerProfile.preferred_availability_evenings === 1,
                gallery_images: performerProfile.gallery_images.map(url => toAbsoluteUrl(url)).filter(Boolean),
                rating: performerProfile.average_rating,
                review_count: performerProfile.total_reviews,
            };
        });

        res.status(200).json({
            message: 'All performer profiles fetched successfully.',
            profiles: allProfiles,
        });
    } catch (error) {
        console.error('Error fetching all performer profiles:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};