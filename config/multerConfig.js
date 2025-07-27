const multer = require('multer');
const path = require('path');

// Set storage engine
const storage = multer.diskStorage({
    destination: './uploads/', // Files will be stored in the 'uploads' directory
    filename: function(req, file, cb){
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

// Initialize upload
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
    fileFilter: function(req, file, cb){
        checkFileType(file, cb);
    }
}).fields([ // Use .fields() to handle multiple file inputs with different names
    { name: 'profile_picture', maxCount: 1 },
    { name: 'gallery_images', maxCount: 10 } // Allow up to 10 gallery images
]);

// Check file type
function checkFileType(file, cb){
    // Allowed ext (extensions)
    const filetypes = /jpeg|jpg|png|gif/;
    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype);

    if(mimetype && extname){
        return cb(null, true);
    } else {
        cb('Error: Images Only!');
    }
}

module.exports = upload;
