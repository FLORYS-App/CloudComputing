# Menggunakan Node.js sebagai base image
FROM node:14

# Set working directory
WORKDIR /usr/src/app

# Menyalin package.json dan package-lock.json
COPY package*.json ./

# Menginstal dependensi
RUN npm install

# Menyalin semua file ke dalam kontainer
COPY . .

# Mengekspos port yang digunakan oleh aplikasi
EXPOSE 3000

# Menjalankan aplikasi
CMD ["node", "index.js"]  # Ganti 'index.js' dengan nama file utama Anda jika berbeda