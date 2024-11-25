const express = require('express');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

admin.initializeApp({
    credential: admin.credential.cert(require('./serviceAccountKey.json')),
    storageBucket: 'https://console.cloud.google.com/storage/browser/florys'
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
    if (password.length < 8 || !/(?=.*[0-9])(?=.*[!@#$%^&*])(?=.*[a-zA-Z])/.test(password)) {
        return res.status(400).json({ message: 'Password harus minimal 8 karakter dan harus terdapat huruf, angka, dan simbol' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Password tidak sesuai.' });
    }

    const userSnapshot = await db.collection('users').where('username', '==', username).get();
    if (!userSnapshot.empty) {
        return res.status(400).json({ message: 'Username sudah terdaftar' });
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
    const { username, password } = req.body;

    const userSnapshot = await db.collection('users').where('username', '==', username).get();
    if (userSnapshot.empty) {
        return res.status(401).json({ message: 'Username atau password salah' });
    }

    const user = userSnapshot.docs[0].data();
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
        return res.status(401).json({ message: 'Username atau password salah' });
    }
    res.status(200 ).json({ message: 'Login berhasil' });
});

app.post('/change-password', async (req, res) => {
    const { username, oldPassword, newPassword, confirmNewPassword } = req.body;

    const userSnapshot = await db.collection('users').where('username', '==', username).get();
    if (userSnapshot.empty) {
        return res.status(404).json({ message: 'Username salah' });
    }

    const user = userSnapshot.docs[0].data();
    const isMatch = await bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
        return res.status(401).json({ message: 'Password lama tidak sesuai' });
    }
    if (newPassword.length < 8 || !/(?=.*[0-9])(?=.*[!@#$%^&*])(?=.*[a-zA-Z])/.test(newPassword)) {
        return res.status(400).json({ message: 'Password baru harus minimal 8 karakter dan mengandung huruf, angka, dan simbol.' });
    }
    if (newPassword !== confirmNewPassword) {
        return res.status(400).json({ message: 'Password salah' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await db.collection('users').doc(userSnapshot.docs[0].id).update({ password: hashedNewPassword });
    res.status(200).json({ message: 'Password berhasil diubah' });
});

const upload = multer({ storage: multer.memoryStorage() });

app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Tolong masukkan file yang akan diupload.' });
    }

    const blob = bucket.file(req.file.originalname);
    const blobStream = blob.createWriteStream({
        metadata: {
            contentType: req.file.mimetype
        }
    });

    blobStream.on('error', (err) => {
        res.status(500).json({ message: 'Gagal mengupload file' });
    });

    blobStream.on('finish', () => {
        res.status(200).json({ message: 'File berhasil diupload', fileName: req.file.originalname });
    });

    blobStream.end(req.file.buffer);
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});