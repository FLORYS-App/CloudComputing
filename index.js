const express = require('express');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const { Storage } = require('@google-cloud/storage');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

admin.initializeApp({
    credential: admin.credential.cert(require('./serviceAccountKey.json')),
    storageBucket: 'https://console.cloud.google.com/storage/browser/florysbucket'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

app.post('/register', async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    if (!/^[a-zA-Z0-9]{3,}$/.test(username)) {
        return res.status(400).json({ message: 'Username salah' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ message: 'Email tidak valid' });
    }
    if (password.length < 8 || !/(?=.*[0-9])(?=.*[a-zA-Z])/.test(password)) {
        return res.status(400).json({ message: 'Password harus minimal 8 karakter' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Password tidak sesuai.' });
    }

    const userSnapshot = await db.collection('users').where('username', '==', username).get();
    if (!userSnapshot.empty) {
        return res.status(400).json({ message: 'Username sudah terdaftar' });
    }

    const emailSnapshot = await db.collection('users').where('email', '==', email).get();
    if (!emailSnapshot.empty) {
        return res.status(400).json({ message: 'Email sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.collection('users').add({
        username,
        email,
        password: hashedPassword
    });

    res.status(201).json({ message: 'Registrasi berhasil silahkan login' });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const userSnapshot = await db.collection('users').where('email', '==', email).get();
    if (userSnapshot.empty) {
        return res.status(401).json({ message: 'Email atau password salah' });
    }

    const user = userSnapshot.docs[0].data();
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
        return res.status(401).json({ message: 'email atau password salah' });
    }
    res.status(200 ).json({ message: 'Login berhasil' });
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Tolong masukkan file yang akan diupload.' });
    }

    const uniqueFileName = `${Date.now()}-${req.file.originalname}`;
    const blob = bucket.file(uniqueFileName);
    const blobStream = blob.createWriteStream({
        metadata: {
            contentType: req.file.mimetype
        }
    });

    blobStream.on('error', (err) => {
        res.status(500).json({ message: 'Gagal mengupload file', error: err.message });
    });

    blobStream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFileName}`;
        res.status(200).json({ message: 'File berhasil diupload', fileName: uniqueFileName, publicUrl });
    });

    blobStream.end(req.file.buffer);
});

app.get('/files', async (req, res) => {
    try {
        const [files] = await bucket.getFiles();
        const fileList = files.map(file => ({
            name: file.name,
            publicUrl: `https://storage.googleapis.com/${bucket.name}/${file.name}`
        }));
        res.status(200).json(fileList);
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil daftar file', error: error.message });
    }
});

app.get('/files/:filename', async (req, res) => {
    const filename = req.params.filename;
    try {
        const file = bucket.file(filename);
        const exists = await file.exists();

        if (!exists[0]) {
            return res.status(404).json({ message: 'File tidak ditemukan' });
        }

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
        res.status(200).json({ name: filename, publicUrl });
    } catch (error) {
        res.status(500).json({ message: 'Terjadi kesalahan', error: error.message });
    }
});

app.get('/weather', async (req, res) => {
    const city = req.query.city;
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=4aadf05227ff55a7fc02e0070de2a73f`;

    try {
        const response = await axios.get(url);
        const data = response.data;
        const weatherInfo = {
            city: data.name,
            weather: data.weather[0].description,
            temperature: data.main.temp,
            temp_min: data.main.temp_min,
            temp_max: data.main.temp_max,
            pressure: data.main.pressure,
            humidity: data.main.humidity,
            wind_speed: data.wind.speed,
            wind_direction: data.wind.deg,
        };
        res.json(weatherInfo);
    } catch (error) {
        res.status(500).json({ message: 'Terjadi kesalahan'});
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
