const express = require('express');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const { nanoid } = require('nanoid');
const mysql = require('mysql2/promise');
const { Storage } = require('@google-cloud/storage');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
    storage: multer.memoryStorage(),
});

app.use(cors());
app.use(bodyParser.json());

const GOOGLE_APPLICATION_CREDENTIALS = `${yourcredentialserviceaccountkeypath}`; 
const GCS_BUCKET_NAME = 'florysbucket'; 

const storage = new Storage({
    keyFilename: GOOGLE_APPLICATION_CREDENTIALS,
});
const bucket = storage.bucket(GCS_BUCKET_NAME);

const dbConfig = {
    host: '34.101.41.22',
    user: 'root',
    password: '1',
    database: 'florys',
};

app.post('/register', async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    // Validate input
    if (!username || !email || !password || !confirmPassword) {
        return res.status(400).json({ message: 'Semua field diperlukan' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Password tidak cocok' });
    }

    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute('SELECT * FROM users WHERE username = ? OR email = ?', [username, email]);
        if (rows.length > 0) {
            return res.status(400).json({ message: 'Username atau email sudah terdaftar' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await connection.execute('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);
        res.status(201).json({ message: 'Registrasi berhasil silahkan login' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Terjadi kesalahan saat registrasi' });
    } finally {
        await connection.end();
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
        return res.status(400).json({ message: 'Email dan password diperlukan' });
    }

    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(401).json({ message: 'Email atau password salah' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Email atau password salah' });
        }

        res.status(200).json({ message: 'Login berhasil' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Terjadi kesalahan saat login' });
    } finally {
        await connection.end();
    }
});

app.post('/checkin', async (req, res) => {
    const { username } = req.body;

    // Validate input
    if (!username) {
        return res.status(400).json({ message: 'Username diperlukan' });
    }

    const checkInId = `${new Date().toISOString().slice(0, 10)}-${nanoid()}`;
    const checkInDate = new Date();

    const connection = await mysql.createConnection(dbConfig);
    try {
        const [userRows] = await connection.execute('SELECT * FROM users WHERE username = ?', [ username]);
        if (userRows.length === 0) {
            return res.status(400).json({ message: 'Username tidak terdaftar' });
        }

        await connection.execute('INSERT INTO check_ins (check_in_id, username, check_in_date) VALUES (?, ?, ?)', [checkInId, username, checkInDate]);
        res.status(201).json({ message: 'Check-in berhasil', checkInId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Terjadi kesalahan saat check-in' });
    } finally {
        await connection.end();
    }
});

app.get('/checkin/:username', async (req, res) => {
    const { username } = req.params;
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [userRows] = await connection.execute('SELECT * FROM users WHERE username = ?', [username]);
        if (userRows.length === 0) {
            return res.status(400).json({ message: 'Username tidak terdaftar' });
        }

        const [rows] = await connection.execute('SELECT COUNT(*) AS checkInCount FROM check_ins WHERE username = ?', [username]);
        res.status(200).json({ username, checkInCount: rows[0].checkInCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Terjadi kesalahan saat mengambil data check-in' });
    } finally {
        await connection.end();
    }
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
            publicUrl: `https://console.cloud.google.com/storage/browser/${bucket.name}/${file.name}`
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
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${api_key_from_openweatherapi}`;

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
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});