# Panduan On-Ramp / Off-Ramp untuk Pengguna Awam

## Ruang lingkup

**Tetap:** login lewat Connect Wallet (Xellar Kit + wagmi seperti sekarang). Tidak ada perubahan login, gas, atau account abstraction.

**Yang ditambah:** pengguna yang belum paham crypto bisa memakai uang biasa (Rupiah) untuk:

| Aksi | Siapa | Arah |
|---|---|---|
| **Donasi / deposit** | Donatur, pemberi dispute, pemberi jaminan | Rupiah masuk, jadi USDC di wallet, lalu dipakai di aplikasi (on-ramp) |
| **Tarik dana** | Pelajar penerima beasiswa, donatur (refund) | USDC keluar, jadi Rupiah di rekening/e-wallet (off-ramp) |

Pengguna tetap punya wallet, tapi tidak perlu tahu cara membeli, menukar, atau mengirim USDC sendiri.

> Bagian bertanda **[cek]** adalah asumsi dari pembacaan cepat kode; pastikan sebelum dikerjakan.

---

## 1. Kondisi sekarang

- Login: `@xellar/kit` + wagmi (`src/constants/wagmi.config.ts`), `xellarEnv: "sandbox"`.
- Semua uang di aplikasi dalam **USDC**. Kurs IDR sudah diambil di `src/components/providers/TokenProvider.tsx` (CoinGecko, fallback 16000).
- Donasi/deposit lewat modal: `DonateModal.tsx`, `ConfidenceStakeModal.tsx`, modal dispute, dll. Semuanya mengharuskan pengguna **sudah punya USDC dan ETH** untuk gas.
- Penarikan dana milestone ada di kontrak (`milestones.ts`, `treasury.ts`), tapi hasilnya hanya USDC di wallet. Tidak ada jalan ke rekening bank.

**Masalah inti:** pengguna awam berhenti di "saya tidak punya USDC" dan "saya tidak tahu cara menjual USDC".

---

## 2. Alur yang dituju

### 2.1 On-ramp: Isi saldo / Donasi
1. Pengguna menekan **Donasi** (atau Deposit/Jaminan).
2. Aplikasi memeriksa saldo USDC wallet.
   - Cukup: lanjut seperti biasa.
   - Kurang: tampilkan **"Saldo kurang Rp X. Isi saldo sekarang?"**
3. Pengguna memilih **Isi saldo** dan membayar dengan metode lokal (transfer bank/VA, e-wallet, QRIS).
4. Penyedia ramp mengirim USDC ke wallet pengguna yang sedang terhubung.
5. Aplikasi mendeteksi saldo masuk dan melanjutkan ke donasi/deposit yang tadi tertunda.

### 2.2 Off-ramp: Tarik ke rekening
1. Pelajar menekan **Tarik dana** setelah milestone disetujui dan dana cair ke wallet.
2. Aplikasi menampilkan: jumlah USDC, estimasi Rupiah, biaya, perkiraan waktu.
3. Pengguna memilih rekening bank/e-wallet (pertama kali: isi data + verifikasi).
4. Pengguna menandatangani pengiriman USDC ke penyedia (satu konfirmasi wallet).
5. Penyedia mencairkan Rupiah ke rekening. Status: Diproses, Dikirim, Selesai.

### 2.3 Prinsip tampilan
- Nominal utama dalam **Rupiah**, USDC kecil di bawahnya.
- Istilah: "Isi saldo", "Tarik ke rekening", "Deposit", "Jaminan". Hindari "swap", "bridge", "approve", "USDC" di teks utama.
- Wallet tetap terlihat (alamat singkat, tombol disconnect), karena login memang Connect Wallet.
- Bukti transaksi (hash/explorer) di panel "Detail", bukan di alur utama.

---

## 3. Yang harus diubah

### A. Pilih penyedia ramp (keputusan dulu)
Syarat: mendukung **IDR**, **USDC di chain yang Anda pakai (Lisk)**, on-ramp dan off-ramp, ada widget/SDK atau API, dan KYC ditangani penyedia.

- Periksa dulu apakah **Xellar** (sudah dipakai) menyediakan fitur ramp/onramp di SDK-nya **[cek dokumentasi Xellar]**. Jika ada, ini jalur paling murah.
- Alternatif: penyedia on/off-ramp IDR lokal atau global (bandingkan biaya, limit, dukungan Lisk, waktu pencairan).
- Jika USDC di Lisk tidak didukung langsung, perlu rute: ramp ke chain lain lalu bridge, atau pakai token yang didukung. Ini menambah kerumitan, tanyakan penyedia lebih dulu.

### B. Frontend
1. **Komponen baru** `src/components/ramp/`:
   - `TopUpModal.tsx`: pilih nominal, metode bayar, buka widget penyedia, tunggu saldo masuk.
   - `WithdrawModal.tsx`: nominal, rekening, ringkasan biaya, konfirmasi wallet, status.
   - `useRampStatus.ts`: polling status order (Diproses/Dikirim/Selesai) dan error.
2. **Util** `src/util/formatMoney.ts`: USDC ke Rupiah pakai kurs `TokenProvider`; pakai di semua tampilan nominal.
3. **Hook saldo**: `useUsdcBalance()` (wagmi `useReadContract` pada token) agar modal bisa memeriksa kecukupan saldo sebelum aksi.
4. **Cek saldo sebelum aksi** di modal berikut; jika kurang, buka `TopUpModal` dengan nominal kekurangan, lalu lanjutkan aksi:
   - `DonateModal.tsx`
   - `ConfidenceStakeModal.tsx`
   - modal dispute di `DisputesPage.tsx` (stake 10% target dana)
   - `CreateProgramModal.tsx` bila ada deposit awal
   - `VoteModal.tsx` bila voting memakai donasi
5. **Tombol Tarik dana** di `DashboardPage.tsx` (panel pelajar) dan di tempat refund donatur, membuka `WithdrawModal`.
6. **Kurs**: pindahkan pengambilan kurs ke backend yang di-cache (CoinGecko dari tiap browser rawan gagal dan memakai fallback 16000 yang bisa salah). Tampilkan kurs terkunci saat konfirmasi.
7. **Teks**: ganti jargon di modal terkait (lihat tabel).

| Sekarang | Jadi |
|---|---|
| Confirm Transaction in Wallet | Konfirmasi di wallet Anda |
| Stake & Dispute | Setor Deposit & Laporkan |
| Spends your available voting power from USDC donations | Memakai bobot suara dari donasi Anda |
| `{amount} USDC` | `Rp {amount}` (USDC kecil di bawah) |

### C. Backend
1. Endpoint untuk **membuat order ramp** dan **menerima webhook** status dari penyedia (backend sudah punya pola webhook di `packages/backend/src/features/webhooks`; tambahkan `ramp` di sana) **[cek struktur]**.
2. Simpan order: pengguna (alamat wallet), arah (on/off), nominal, status, ID order penyedia. Verifikasi tanda tangan webhook.
3. Endpoint kurs ter-cache untuk frontend.
4. Simpan **rekening tujuan** bila penyedia menyaratkan. Jangan simpan data kartu/bank sensitif bila bisa diserahkan ke penyedia.

### D. Konfigurasi
- Kunci API penyedia hanya di backend. Frontend hanya memegang kunci publik widget.
- Variabel env baru: `VITE_RAMP_*` (publik) dan `RAMP_*` (rahasia, backend).
- Pisahkan sandbox dan produksi penyedia.
- RPC: pakai chain **Nawasena** untuk sekarang. Build produksi mengisi `VITE_RPC_URL=https://rpc.nawasena-labs.com` (Caddy meneruskan ke `host.docker.internal:8550`). Fallback `http://100.73.196.95:8550` di `wagmi.config.ts` hanya untuk dev lokal dan tidak boleh terpakai di produksi (browser memblokir `http` dari halaman `https`).
- Catatan: blok CORS di Caddy untuk `rpc.nawasena-labs.com` sedang dikomentari. Jika browser menolak request RPC dengan error CORS, aktifkan kembali header `Access-Control-Allow-*` dan respons `OPTIONS 204`, atau pastikan node RPC sendiri yang mengirim header tersebut.
- Penyedia ramp harus mendukung chain yang dipakai. Nawasena (id 31338) adalah chain privat, jadi ramp biasanya tidak bisa mengirim USDC langsung ke sana. Untuk uji coba, pakai ramp sandbox/mock; untuk produksi sungguhan perlu chain yang didukung penyedia (mis. Lisk).

### E. Hukum dan kepatuhan (wajib sebelum rilis)
- Penyedia ramp biasanya menangani KYC; pastikan jelas siapa pemegang izin dan siapa yang bertanggung jawab atas dana pengguna.
- Konfirmasi ke ahli hukum soal penggalangan dana / beasiswa berbasis donasi dan penerimaan pembayaran di Indonesia.
- Tampilkan syarat dan biaya penyedia sebelum pengguna membayar.

---

## 4. Urutan pengerjaan

1. Pilih penyedia dan cek dukungan IDR + USDC di Lisk (blokir utama).
2. `formatMoney` + `useUsdcBalance` + sapuan teks (cepat, terlihat langsung).
3. On-ramp di modal Donasi (alur paling sering dipakai), lalu Deposit/Jaminan/Dispute.
4. Backend order + webhook + status.
5. Off-ramp untuk pelajar.
6. Uji dengan pengguna awam, lalu perbaiki.

---

## 5. Kriteria diterima

Pengguna yang sudah Connect Wallet tapi saldo USDC-nya nol dapat:

- [ ] Menekan Donasi, melihat "Saldo kurang Rp X", mengisi saldo lewat transfer bank/QRIS, lalu donasi selesai tanpa keluar dari aplikasi.
- [ ] Pelajar menarik dana milestone ke rekening dan melihat status sampai uang masuk.
- [ ] Melihat semua nominal dalam Rupiah dan biaya sebelum membayar.
- [ ] Menyelesaikan alur tanpa harus membeli atau menukar token di tempat lain.

Ukur: persentase pengguna yang selesai top up, waktu dari klik Donasi sampai donasi tercatat, dan pertanyaan dukungan tentang "USDC" atau "saldo".

---

## 6. Risiko

- **Dukungan chain**: jika penyedia tidak mendukung USDC di Lisk, alur jadi lebih panjang.
- **Waktu dan biaya**: on/off-ramp tidak instan dan ada biaya; tampilkan jujur di depan.
- **Order tersangkut**: pengguna sudah bayar tapi USDC belum masuk; perlu status jelas, tombol "Cek ulang", dan kontak dukungan.
- **Salah wallet**: ramp harus mengirim ke wallet yang sedang terhubung; tampilkan alamat singkat untuk konfirmasi.
- **Risiko kurs**: kurs berubah antara pembayaran dan pencairan; kunci kurs saat konfirmasi.
