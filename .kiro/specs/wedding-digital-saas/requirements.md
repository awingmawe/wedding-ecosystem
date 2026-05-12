# Requirements Document

## Introduction

Wedding Digital SaaS adalah platform multi-tenant yang menyediakan ekosistem lengkap untuk manajemen undangan pernikahan digital. Platform ini terdiri dari 3 aplikasi utama yang saling terintegrasi: Client & WO Dashboard, Wedding Invitation, dan Scanner System. Dokumen ini mendefinisikan kebutuhan fungsional dan non-fungsional yang harus dipenuhi oleh platform berdasarkan desain teknis yang telah disetujui.

## Glossary

- **Platform**: Keseluruhan sistem Wedding Digital SaaS yang mencakup ketiga aplikasi dan backend services
- **Dashboard**: Aplikasi web responsif untuk client dan Wedding Organizer mengelola undangan digital
- **Invitation_App**: Aplikasi web mobile-first yang menampilkan undangan digital kepada tamu
- **Scanner_System**: Aplikasi web mobile-optimized untuk verifikasi kehadiran tamu menggunakan QR code
- **Backend_API**: Shared backend services yang melayani ketiga aplikasi frontend
- **Tenant**: Entitas bisnis (client) yang memiliki satu atau lebih event pernikahan dalam platform
- **Event**: Satu acara pernikahan yang dikelola dalam platform
- **Guest**: Tamu undangan yang terdaftar dalam sebuah event
- **Go_Show**: Tamu walk-in yang belum terdaftar sebelumnya dan didaftarkan di hari-H
- **QR_Code**: Kode QR unik yang di-generate otomatis untuk setiap tamu sebagai identitas check-in
- **RSVP**: Konfirmasi kehadiran yang disubmit oleh tamu melalui undangan digital
- **Check_In**: Proses verifikasi kehadiran tamu di venue menggunakan QR scan atau manual
- **CMS**: Content Management System untuk mengelola konten setiap section undangan
- **Section**: Modul konten pada undangan digital yang dapat diaktifkan/dinonaktifkan
- **WebSocket**: Protokol komunikasi real-time untuk sinkronisasi data antara scanner dan dashboard
- **PWA**: Progressive Web App yang mendukung offline capability pada Scanner System
- **WO**: Wedding Organizer yang membantu mengelola event pernikahan
- **Usher**: Petugas di venue yang mengoperasikan Scanner System
- **Lane**: Jalur antrian scanner device di venue (maksimal 2 per event)

## Requirements

### Requirement 1: Multi-Tenant Architecture

**User Story:** Sebagai platform administrator, saya ingin setiap client memiliki data yang terisolasi, sehingga tidak ada kebocoran data antar tenant.

#### Acceptance Criteria

1. THE Platform SHALL menerapkan tenant_id pada setiap record data milik tenant di database untuk memastikan isolasi data
2. WHEN sebuah query dieksekusi, THE Backend_API SHALL secara otomatis memfilter data berdasarkan tenant_id yang diekstrak dari session user yang terautentikasi, dan hanya mengembalikan data yang dimiliki oleh tenant tersebut
3. IF seorang user mengakses resource milik tenant lain, THEN THE Backend_API SHALL menolak akses dan mengembalikan error 403 Forbidden tanpa mengungkapkan informasi tentang keberadaan resource tersebut, terlepas dari apakah request memiliki tenant_id yang valid atau tidak
4. THE Platform SHALL mendukung maksimal 50 events per tenant dengan data yang terisolasi antar event, dimana query pada satu event tidak mengembalikan data dari event lain dalam tenant yang sama
5. IF sebuah request diterima tanpa tenant_id yang valid atau tenant_id tidak dapat diekstrak dari session user, THEN THE Backend_API SHALL menolak request tersebut dan mengembalikan error yang mengindikasikan akses tidak sah

### Requirement 2: Autentikasi dan Otorisasi

**User Story:** Sebagai pengguna platform, saya ingin sistem login yang aman dengan pembagian hak akses berdasarkan role, sehingga setiap pengguna hanya bisa mengakses fitur sesuai perannya.

#### Acceptance Criteria

1. THE Backend_API SHALL mengautentikasi pengguna menggunakan JWT access token dengan masa berlaku 15 menit dan refresh token dengan masa berlaku 7 hari, menerapkan refresh token rotation pada setiap penerbitan access token baru
2. WHEN seorang user mengirimkan kredensial login yang valid (email dan password), THE Backend_API SHALL mengembalikan access token dan refresh token dalam waktu kurang dari 2 detik
3. IF seorang user mengirimkan kredensial login yang tidak valid (email tidak terdaftar atau password salah), THEN THE Backend_API SHALL menolak login dan mengembalikan pesan error yang mengindikasikan kredensial tidak valid tanpa membedakan apakah email atau password yang salah
4. IF seorang user gagal login sebanyak 5 kali berturut-turut pada akun yang sama, THEN THE Backend_API SHALL mengunci akun tersebut selama 15 menit dan mengembalikan pesan error yang mengindikasikan akun terkunci sementara
5. THE Platform SHALL mendukung 4 role: Admin, Client, WO, dan Scanner Operator
6. WHILE seorang user memiliki role Client, THE Dashboard SHALL hanya menampilkan data event milik client tersebut, dan WHILE seorang user memiliki role Admin, THE Dashboard SHALL menerapkan pembatasan visibilitas data yang sama sesuai scope yang di-assign
7. WHILE seorang user memiliki role WO, THE Dashboard SHALL menampilkan data event yang di-assign kepada WO tersebut
8. WHILE seorang user memiliki role Scanner Operator, THE Scanner_System SHALL mengizinkan akses QR scan dan manual check-in sebagai dua kapabilitas yang wajib tersedia secara bersamaan
9. WHEN access token expired dan refresh token masih valid, THE Backend_API SHALL memvalidasi refresh token, mencabut refresh token lama, dan mengeluarkan access token baru beserta refresh token baru
10. IF refresh token sudah expired atau tidak valid (dicabut atau tidak ditemukan), THEN THE Backend_API SHALL menolak permintaan token baru dan mengembalikan error yang mengindikasikan sesi telah berakhir sehingga user harus login ulang
11. THE Backend_API SHALL meng-hash password menggunakan bcrypt dengan minimum cost factor 10 sebelum menyimpan ke database

### Requirement 3: Manajemen Tamu

**User Story:** Sebagai client/WO, saya ingin mengelola daftar tamu undangan dengan mudah, sehingga saya bisa mengatur siapa saja yang diundang dan melacak status mereka.

#### Acceptance Criteria

1. WHEN seorang client menambahkan tamu baru dengan data nama, grup, dan opsional phone/email/plus_one_count, THE Backend_API SHALL membuat record tamu dan otomatis men-generate QR code unik untuk tamu tersebut dalam waktu kurang dari 3 detik
2. THE Dashboard SHALL menyediakan fitur import bulk tamu melalui file CSV dengan kolom wajib (nama, grup) dan kolom opsional (phone, email, plus_one_count), dengan maksimal 2000 baris per file
3. WHEN tamu di-import via CSV, THE Backend_API SHALL memvalidasi setiap baris dan men-generate QR code untuk setiap tamu yang lolos validasi, serta mengembalikan laporan hasil import berisi jumlah berhasil dan daftar baris yang gagal beserta alasannya
4. IF sebuah baris CSV memiliki data tidak valid (nama kosong, grup tidak sesuai enum, atau duplikat nama dalam event yang sama), THEN THE Backend_API SHALL melewati baris tersebut tanpa menghentikan proses import dan mencatat error pada laporan hasil
5. THE Dashboard SHALL menyediakan fitur CRUD (Create, Read, Update, Delete) untuk data tamu
6. WHEN sebuah QR code di-generate, THE QR_Code SHALL memiliki payload yang unik dan terenkripsi sehingga guest_id dan event_id tidak dapat dibaca tanpa dekripsi
7. THE Backend_API SHALL memastikan setiap QR code payload bersifat unik di seluruh platform (tidak ada dua tamu yang memiliki payload sama, baik dalam satu event maupun lintas event)
8. WHEN seorang tamu dihapus dari daftar, THE Backend_API SHALL menonaktifkan QR code terkait sehingga QR tersebut tidak dapat digunakan untuk check-in
9. THE Dashboard SHALL menampilkan daftar tamu dengan pagination (maksimal 50 item per halaman) yang mencakup informasi nama, grup, status RSVP, dan status check-in
10. THE Dashboard SHALL mendukung pengelompokan dan filter tamu berdasarkan grup (family, friend, colleague, VIP) dan status (belum RSVP, confirmed, declined, checked-in)

### Requirement 4: RSVP dan Konfirmasi Kehadiran

**User Story:** Sebagai tamu, saya ingin mengkonfirmasi kehadiran melalui undangan digital, sehingga penyelenggara bisa mempersiapkan acara dengan lebih baik.

#### Acceptance Criteria

1. WHEN tamu mengisi form RSVP pada Invitation_App, THE Backend_API SHALL menyimpan data konfirmasi kehadiran yang mencakup pilihan acara (attendance) dan jumlah tamu (guest_count dengan nilai minimum 1 dan maksimum plus_one_count + 1)
2. THE Invitation_App SHALL menyediakan pilihan kehadiran: akad, resepsi, keduanya, atau menolak
3. IF tamu memilih attendance "menolak", THEN THE Invitation_App SHALL menyembunyikan field jumlah tamu dan THE Backend_API SHALL menyimpan guest_count sebagai 0
4. WHEN tamu mengisi jumlah tamu tambahan, THE Backend_API SHALL memvalidasi bahwa guest_count bernilai antara 1 hingga plus_one_count + 1
5. IF jumlah tamu pada RSVP melebihi batas yang diizinkan, THEN THE Backend_API SHALL menolak submission dan mengembalikan pesan error yang menunjukkan batas maksimum tamu yang diizinkan
6. WHEN RSVP berhasil disubmit, THE Backend_API SHALL mem-broadcast update melalui WebSocket ke Dashboard dalam waktu kurang dari 500ms
7. WHEN tamu yang sudah pernah submit RSVP mengisi ulang form RSVP, THE Backend_API SHALL memperbarui data RSVP yang sudah ada (bukan membuat record baru)
8. THE Dashboard SHALL menampilkan status RSVP seluruh tamu yang mencakup: nama tamu, pilihan kehadiran, jumlah tamu, dan waktu submission

### Requirement 5: CMS Undangan Digital

**User Story:** Sebagai client/WO, saya ingin mengelola konten undangan melalui CMS yang mudah digunakan, sehingga saya bisa mengkustomisasi undangan sesuai keinginan.

#### Acceptance Criteria

1. THE Dashboard SHALL menyediakan CMS editor untuk mengelola konten setiap section undangan
2. THE CMS SHALL mendukung 14 tipe section: cover, bride_groom, story, verse, countdown, akad_resepsi, rsvp, attire, gallery, video, gift, messages, closing, dan music
3. WHEN client mengaktifkan atau menonaktifkan sebuah section, THE Invitation_App SHALL hanya menampilkan section yang aktif sesuai urutan sort_order
4. THE CMS SHALL mendukung upload media (foto dan video) dengan validasi format (JPEG, PNG, WebP untuk foto; MP4 untuk video) dan ukuran file maksimal 5MB per foto dan 50MB per video
5. IF upload media gagal karena file melebihi batas ukuran atau format tidak termasuk dalam daftar yang didukung, THEN THE Dashboard SHALL menampilkan pesan error yang menyebutkan format yang didukung dan batas ukuran maksimal
6. WHEN konten section diubah dan disimpan melalui CMS, THE Backend_API SHALL menyimpan perubahan dan Invitation_App SHALL menampilkan konten terbaru pada pemuatan halaman berikutnya
7. IF penyimpanan konten section gagal, THEN THE Dashboard SHALL menampilkan pesan error dan mempertahankan data yang sudah diisi oleh client di form editor
8. THE Dashboard SHALL menyediakan fitur preview undangan yang menampilkan tampilan sesuai konfigurasi section aktif dan konten terkini sebelum publish
9. THE CMS SHALL mendukung pengaturan sort_order untuk menentukan urutan tampilan section
10. THE Backend_API SHALL memastikan sort_order setiap section dalam satu event bersifat unik dan berurutan (sequential tanpa gap, dimulai dari 1)
11. WHEN client mengubah urutan sebuah section, THE Backend_API SHALL otomatis menghitung ulang sort_order seluruh section aktif agar tetap berurutan tanpa gap

### Requirement 6: Wedding Invitation App

**User Story:** Sebagai tamu, saya ingin melihat undangan digital yang indah dan personal di mobile browser, sehingga saya mendapat informasi lengkap tentang acara pernikahan.

#### Acceptance Criteria

1. WHEN tamu membuka URL undangan dengan guest-slug yang valid, THE Invitation_App SHALL menampilkan undangan yang dipersonalisasi dengan nama tamu di cover sesuai data guest record
2. THE Invitation_App SHALL menggunakan URL format /{event-slug}?to={guest-slug} untuk personalisasi
3. IF guest-slug tidak ditemukan atau event-slug tidak valid, THEN THE Invitation_App SHALL menampilkan halaman error yang menginformasikan bahwa undangan tidak ditemukan
4. THE Invitation_App SHALL menampilkan section yang aktif sesuai konfigurasi CMS, diurutkan berdasarkan sort_order yang telah ditentukan
5. THE Invitation_App SHALL menerapkan lazy loading pada gambar dan media sehingga hanya konten yang terlihat di viewport yang dimuat terlebih dahulu
6. THE Invitation_App SHALL memiliki load time di bawah 3 detik pada koneksi mobile 3G
7. THE Invitation_App SHALL menampilkan animasi scroll dan transisi saat pengguna berpindah antar section
8. WHEN section music aktif dalam konfigurasi CMS, THE Invitation_App SHALL menyediakan background music player dengan kontrol play/pause, dengan state awal sesuai konfigurasi autoplay di CMS; WHEN section music tidak aktif, THE Invitation_App SHALL tidak menampilkan music player
9. WHEN section countdown aktif dalam konfigurasi CMS dan berhasil dimuat, THE Invitation_App SHALL menyediakan tombol "Tambah ke Kalender" yang menghasilkan file kalender (.ics) atau link Google Calendar berisi tanggal dan lokasi acara
10. WHEN section akad_resepsi aktif dalam konfigurasi CMS, THE Invitation_App SHALL menampilkan link Google Maps yang mengarah ke lokasi venue sesuai data maps_url dari CMS; WHEN section akad_resepsi tidak aktif, THE Invitation_App SHALL menyembunyikan link Google Maps
11. WHEN tamu mengirim ucapan melalui form messages, THE Invitation_App SHALL memvalidasi bahwa nama pengirim (maksimal 100 karakter) dan isi ucapan (maksimal 500 karakter) tidak kosong, dan WHEN validasi berhasil, THE Invitation_App SHALL mengirimkan data ke Backend_API untuk disimpan
12. THE Invitation_App SHALL menampilkan daftar ucapan dari tamu lain dengan urutan terbaru terlebih dahulu, dimuat secara bertahap (pagination) maksimal 20 ucapan per halaman

### Requirement 7: Scanner System - QR Code Verification

**User Story:** Sebagai usher/operator scanner, saya ingin memverifikasi kehadiran tamu dengan cepat menggunakan QR code, sehingga proses check-in berjalan lancar.

#### Acceptance Criteria

1. WHEN QR code di-scan, THE Scanner_System SHALL memverifikasi dan menampilkan hasil dalam waktu kurang dari 2 detik, kemudian kembali ke mode scan-ready setelah 5 detik atau ketika usher mengetuk layar
2. WHEN QR code valid dan tamu belum check-in, THE Scanner_System SHALL menampilkan layar HIJAU dengan nama tamu dan grup tamu (family/friend/colleague/VIP)
3. WHEN QR code tidak valid, tidak ditemukan dalam database event yang aktif, atau memiliki format valid tetapi gagal validasi event-specific (misalnya milik event lain), THE Scanner_System SHALL menampilkan layar MERAH dengan pesan error yang mengindikasikan QR tidak valid
4. WHEN QR code milik tamu yang sudah check-in, THE Scanner_System SHALL menampilkan layar KUNING dengan nama tamu, pesan yang mengindikasikan sudah check-in, dan waktu check-in sebelumnya
5. WHEN dua scanner device men-scan QR yang sama secara bersamaan, THE Backend_API SHALL memastikan hanya satu check-in yang berhasil dicatat, dan scanner kedua SHALL menerima respons duplikat (layar KUNING)
6. THE Scanner_System SHALL mendukung maksimal 2 scanner device aktif secara bersamaan per event
7. IF scanner device ketiga mencoba terhubung ke event yang sudah memiliki 2 scanner aktif, THEN THE Scanner_System SHALL menolak koneksi dan menampilkan pesan error yang mengindikasikan batas maksimal device telah tercapai
8. THE Backend_API SHALL memastikan hanya ada satu record check-in per tamu terlepas dari jumlah percobaan scan (idempotent)

### Requirement 8: Scanner System - Manual Check-in dan Go-Show

**User Story:** Sebagai usher, saya ingin bisa melakukan check-in manual dan mendaftarkan tamu walk-in, sehingga semua tamu bisa masuk meskipun ada kendala teknis.

#### Acceptance Criteria

1. THE Scanner_System SHALL menyediakan search bar yang memungkinkan usher mencari tamu berdasarkan nama dengan metode partial match (mengandung kata kunci), dan menampilkan hasil pencarian setelah minimal 3 karakter diinput, dengan maksimal 10 hasil pencarian ditampilkan
2. WHEN tamu ditemukan melalui pencarian manual dan belum check-in, THE Scanner_System SHALL mengizinkan check-in manual dengan satu klik pada tombol check-in di samping nama tamu
3. WHEN pencarian manual menghasilkan nol hasil, THE Scanner_System SHALL menampilkan opsi "Tambah sebagai Go-Show"
4. WHEN tamu ditemukan melalui pencarian manual namun sudah berstatus checked-in, THE Scanner_System SHALL menampilkan indikator status "Sudah Check-in" pada tamu tersebut dan menonaktifkan tombol check-in
5. WHEN tamu Go-Show didaftarkan, THE Backend_API SHALL membuat record tamu baru dengan field wajib (nama tamu), type "go_show", dan status langsung checked-in beserta timestamp check-in
6. FOR ALL tamu Go-Show, THE Backend_API SHALL mencatat method check-in sebagai "go_show" pada record CHECK_IN
7. WHEN check-in manual atau Go-Show berhasil, THE Scanner_System SHALL menampilkan layar HIJAU dengan nama tamu selama 3 detik sebagai konfirmasi visual
8. WHEN check-in manual atau Go-Show berhasil, THE Backend_API SHALL mem-broadcast update melalui WebSocket ke Dashboard dalam waktu kurang dari 500ms
9. IF registrasi Go-Show gagal karena kegagalan server, THEN THE Scanner_System SHALL menampilkan pesan error dan mempertahankan data input yang sudah diisi oleh usher

### Requirement 9: Real-time Synchronization

**User Story:** Sebagai client/WO, saya ingin melihat update check-in dan RSVP secara real-time di dashboard, sehingga saya bisa memantau progress acara secara langsung.

#### Acceptance Criteria

1. WHEN tamu berhasil check-in (QR scan, manual, atau Go-Show), THE Backend_API SHALL mem-broadcast event melalui WebSocket ke semua connected Dashboard clients dalam waktu kurang dari 500ms sejak check-in tercatat
2. WHEN RSVP baru disubmit, THE Backend_API SHALL mem-broadcast update ke Dashboard melalui WebSocket dalam waktu kurang dari 500ms sejak RSVP tersimpan
3. THE WebSocket SHALL menggunakan room-based connection per event sehingga broadcast untuk event tertentu hanya diterima oleh client yang terhubung ke room event tersebut
4. WHEN koneksi WebSocket terputus, THE Scanner_System SHALL menyimpan data check-in secara lokal dalam offline queue dengan kapasitas minimum 2000 entri, mencakup timestamp checked_in_at pada saat scan dilakukan
5. WHEN koneksi WebSocket kembali tersambung, THE Scanner_System SHALL otomatis men-sync seluruh data check-in yang tertunda ke Backend_API dengan urutan kronologis berdasarkan timestamp checked_in_at, dan Backend_API SHALL menerapkan aturan idempotency (mengabaikan duplikat tanpa error ke scanner)
6. THE Dashboard SHALL menampilkan statistik yang diperbarui dalam waktu kurang dari 500ms setelah broadcast diterima: total tamu terdaftar, total RSVP masuk, total check-in, dan total Go-Show
7. THE Backend_API SHALL memastikan konsistensi data dimana dashboard.total_checked_in selalu sama dengan jumlah record check-in aktual di database pada setiap broadcast update
8. WHILE koneksi WebSocket aktif, THE Dashboard SHALL menampilkan indikator status koneksi "terhubung", dan WHILE koneksi WebSocket terputus, THE Dashboard SHALL menampilkan indikator status "terputus" agar pengguna mengetahui apakah data yang ditampilkan bersifat live

### Requirement 10: Offline Capability (PWA)

**User Story:** Sebagai operator scanner, saya ingin scanner tetap bisa beroperasi meskipun koneksi internet tidak stabil, sehingga proses check-in tidak terganggu.

#### Acceptance Criteria

1. THE Scanner_System SHALL diimplementasikan sebagai Progressive Web App (PWA) dengan service worker yang memungkinkan operasi tanpa koneksi internet
2. WHILE koneksi internet terputus, THE Scanner_System SHALL tetap dapat melakukan scan QR dan memverifikasi terhadap cache data tamu lokal, serta menyimpan hasil check-in secara lokal hingga maksimal 2000 record, dan WHEN kapasitas lokal tercapai, THE Scanner_System SHALL tetap mengizinkan scanning dengan mekanisme overflow handling (misalnya menimpa record tertua yang sudah tersinkronisasi atau menampilkan peringatan) tanpa menghentikan operasi scan
3. WHEN konektivitas internet terdeteksi (baik melalui event pemulihan koneksi maupun deteksi konektivitas periodik), THE Scanner_System SHALL otomatis men-sync seluruh data check-in yang tersimpan lokal ke server dalam waktu tidak lebih dari 30 detik
4. IF terjadi konflik data saat sync (misalnya tamu sudah di-check-in oleh device lain saat offline), THEN THE Scanner_System SHALL menerapkan prinsip idempotency dimana record check-in pertama yang tercatat di server yang berlaku dan record duplikat diabaikan tanpa menampilkan error ke operator
5. THE Scanner_System SHALL menyimpan cache data tamu (nama, QR payload, dan status check-in) yang di-refresh setiap kali koneksi tersedia dan sebelum event dimulai, untuk mendukung verifikasi offline
6. WHILE koneksi internet terputus, THE Scanner_System SHALL menampilkan indikator visual yang jelas bahwa sistem sedang beroperasi dalam mode offline
7. WHEN Scanner_System beralih dari mode offline ke online, THE Scanner_System SHALL memperbarui cache data tamu dari server untuk menyinkronkan status check-in terbaru dari device lain

### Requirement 11: Theme dan Kustomisasi

**User Story:** Sebagai client, saya ingin mengkustomisasi tampilan dashboard dan undangan sesuai tema pernikahan saya, sehingga semua terlihat konsisten dan personal.

#### Acceptance Criteria

1. THE Dashboard SHALL mendukung kustomisasi theme dengan 5 properti warna: primary color, secondary color, accent color, surface color, dan text color, dimana setiap nilai warna harus dalam format hex yang valid (contoh: #RRGGBB atau #RGB)
2. THE Invitation_App SHALL mendukung theme terpisah dari dashboard dengan properti: primary color, secondary color, accent color, background color, dan text color, yang dapat dikustomisasi melalui CMS
3. WHEN client mengubah theme, THE Dashboard SHALL menerapkan perubahan warna dalam waktu kurang dari 1 detik tanpa memerlukan reload halaman
4. THE Platform SHALL menggunakan font Playfair Display untuk semua heading dan Poppins untuk semua body text pada Dashboard dan Invitation_App
5. THE Dashboard SHALL menyediakan minimal 5 preset palette warna sebagai referensi inspirasi yang dapat langsung dipilih oleh client untuk diterapkan sebagai theme
6. IF client memasukkan nilai warna dengan format yang tidak valid (termasuk input kosong, input parsial, atau format yang ambigu), THEN THE Dashboard SHALL memperlakukan input tersebut sebagai tidak valid dan menampilkan pesan error yang mengindikasikan format warna yang diharapkan, serta tidak menyimpan perubahan
7. WHEN event baru dibuat, THE Platform SHALL menerapkan default theme pada dashboard dan invitation sehingga tampilan langsung dapat digunakan tanpa konfigurasi manual, dan IF penerapan default theme gagal karena error sistem, THEN THE Platform SHALL tetap membuat event tanpa styling hingga client mengkonfigurasi theme secara manual

### Requirement 12: Performa dan Skalabilitas

**User Story:** Sebagai platform administrator, saya ingin sistem mampu menangani beban tinggi dengan performa yang konsisten, sehingga pengalaman pengguna tetap optimal.

#### Acceptance Criteria

1. THE Scanner_System SHALL memproses verifikasi QR code dalam waktu kurang dari 2 detik, diukur dari saat QR code terdeteksi oleh kamera hingga hasil verifikasi (hijau/merah/kuning) ditampilkan di layar
2. THE Invitation_App SHALL mencapai First Contentful Paint dalam waktu kurang dari 3 detik pada koneksi mobile 3G (throughput 750 Kbps, latency 400ms)
3. THE Backend_API SHALL mengirimkan WebSocket event ke semua connected clients dengan latency kurang dari 500ms, diukur dari saat event di-trigger di server hingga diterima oleh client
4. WHILE jumlah tamu dalam satu event mencapai 2000, THE Platform SHALL tetap memenuhi seluruh target response time yang didefinisikan pada kriteria 1, 2, dan 3
5. WHEN proses check-in dilakukan, THE Backend_API SHALL mendeteksi duplikat check-in dalam waktu kurang dari 200ms sebelum memproses verifikasi selanjutnya
6. WHEN pencarian tamu dilakukan berdasarkan QR payload, guest slug, atau event slug, THE Backend_API SHALL mengembalikan hasil dalam waktu kurang dari 100ms
7. WHILE 0 hingga 2 scanner device aktif secara bersamaan pada satu event, THE Backend_API SHALL memproses setiap request check-in secara independen tanpa peningkatan response time melebihi 20% dari response time single-device, dengan ketentuan bahwa baseline response time minimum ditetapkan sebesar 50ms untuk mencegah overhead absolut yang tidak terbatas pada kasus baseline mendekati nol

### Requirement 13: Keamanan Data

**User Story:** Sebagai client, saya ingin data tamu dan informasi pribadi terlindungi dengan baik, sehingga privasi semua pihak terjaga.

#### Acceptance Criteria

1. THE Backend_API SHALL mengenkripsi QR code payload menggunakan AES-256 sehingga guest_id dan event_id tidak dapat dibaca tanpa dekripsi
2. THE Backend_API SHALL mengenkripsi data PII (phone, email) at rest di database menggunakan enkripsi simetris sehingga nilai plaintext tidak tersimpan langsung di storage
3. THE Backend_API SHALL menerapkan rate limiting maksimal 100 requests per menit per tenant pada seluruh endpoint API
4. IF jumlah request dari sebuah tenant melebihi batas rate limit, THEN THE Backend_API SHALL menolak request berikutnya dan mengembalikan HTTP 429 hingga window waktu berikutnya
5. THE Backend_API SHALL memvalidasi semua input di sisi server sebelum memproses, termasuk tipe data, panjang string (maksimal 1000 karakter untuk field teks), dan format field (email, phone)
6. IF input tidak lolos validasi server, THEN THE Backend_API SHALL menolak request dan mengembalikan pesan error yang menyebutkan field mana yang gagal beserta alasan spesifiknya
7. THE Backend_API SHALL menerapkan CORS policy yang hanya mengizinkan request dari origin domain yang terdaftar untuk masing-masing aplikasi (Dashboard, Invitation_App, Scanner_System)
8. THE Backend_API SHALL melakukan virus scan dan validasi tipe file pada setiap upload media, dengan batasan ukuran file maksimal 10MB dan hanya menerima format gambar (JPEG, PNG, WebP) serta video (MP4, WebM), dimana validasi ukuran dan format dilakukan secara eksplisit sebelum memproses file
9. IF file upload tidak lolos validasi keamanan, THEN THE Backend_API SHALL menolak upload dan mengembalikan pesan error yang menyebutkan alasan penolakan spesifik (ukuran melebihi batas, format tidak didukung, atau terdeteksi malware)

### Requirement 14: Notifikasi dan Distribusi Undangan

**User Story:** Sebagai client/WO, saya ingin mengirim undangan digital ke tamu melalui WhatsApp atau Email, sehingga tamu menerima link undangan yang dipersonalisasi.

#### Acceptance Criteria

1. THE Dashboard SHALL menyediakan fitur pengiriman undangan melalui WhatsApp (menggunakan nomor phone tamu) dan Email (menggunakan alamat email tamu)
2. WHEN undangan dikirim ke tamu, THE Platform SHALL menyertakan invitation_url milik tamu tersebut yang menggunakan format /{event-slug}?to={guest-slug} sesuai konfigurasi Invitation_App
3. THE Dashboard SHALL menyediakan fitur kirim undangan ke tamu individual atau bulk dengan maksimal 500 tamu per batch pengiriman
4. WHEN undangan dikirim ke tamu, THE Platform SHALL menggunakan invitation_url yang sudah ter-generate untuk tamu tersebut
5. IF tamu tidak memiliki nomor phone dan alamat email secara lengkap, THEN THE Dashboard SHALL menonaktifkan seluruh opsi pengiriman undangan dan menampilkan indikasi bahwa data kontak (phone dan email) harus dilengkapi sebelum undangan dapat dikirim
6. WHEN pengiriman undangan gagal, THE Platform SHALL mencatat status pengiriman sebagai "gagal" dan menampilkan notifikasi kegagalan pada Dashboard
7. THE Dashboard SHALL menampilkan status pengiriman untuk setiap tamu dengan status: belum dikirim, terkirim, atau gagal
