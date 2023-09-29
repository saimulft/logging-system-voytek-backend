const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images')
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname))
    }
})

const uploadImage = multer({
    storage: imageStorage
})

app.post('/upload', uploadImage.single('image'), (req, res) => {
    console.log(req.file)
})

