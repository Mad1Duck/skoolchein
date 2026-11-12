# Rencana Multi-Network (Opsi B: satu indexer + satu database)

Tujuan: satu aplikasi, satu indexer, satu database melayani beberapa chain (mis. Nawasena, Base, Lisk). Pengguna bisa berganti chain di aplikasi, dan data serta alamat kontrak menyesuaikan chain yang dipilih.

> Status: rencana. Belum ada kode indexer/backend yang diubah. Angka di bawah dari pembacaan cepat repo; konfirmasi saat mengerjakan.

## 1. Kondisi sekarang

| Lapisan | Kondisi | Masalah untuk multi-chain |
|---|---|---|
| Kontrak | `sync-deployments.ts` menulis satu set alamat ke `contractsV4.ts` (chain 31338) | Menimpa file saat deploy chain lain |
| Indexer (`packages/ponder`) | Satu chain `nawasena`; alamat dari env `CONTRACT_*`; 17 tabel; ~1.500 baris handler | ID on-chain (`pid`, `blockchainId`) hanya unik per chain, jadi data dua chain bertabrakan |
| Backend (`packages/backend`) | ~10 service query ke Ponder SQL berdasarkan ID, tanpa chain | Query tidak tahu chain mana |
| Frontend | `v4Addresses` satu set, diimpor ~17 file; `USDC_ADDRESS` tetap | Alamat kontrak/token tidak bisa berganti |

## 2. Desain target

**Prinsip:** setiap baris data punya `chainId`, dan setiap pencarian menyertakannya. Chain pertama (Nawasena, 31338) tetap berjalan normal di setiap tahap.

### 2.1 Kontrak dan deployment
- `sync-deployments.ts <chainId>` menulis per chain, bukan menimpa: mis. `deployments/<chainId>.json`, lalu `contractsV4.ts` digenerate menjadi peta `{ [chainId]: addresses }`.
- Token pembayaran (USDC) per chain; di chain publik pakai USDC asli, di Nawasena MockUSDC.
- Tiap chain butuh deployment kontrak sendiri (di luar cakupan rencana ini).

### 2.2 Indexer (Ponder)
- `ponder.config.ts`: `chains` dibaca dari env (daftar chain + RPC), dan tiap kontrak memakai bentuk multi-chain `chain: { <nama>: { address, startBlock } }`.
- Env per chain, mis. `CONTRACT_CORE_31338`, `CONTRACT_CORE_8453`, `START_BLOCK_<chainId>`, `PONDER_RPC_URL_<chainId>`. Chain yang tidak punya env diabaikan.
- **Skema**: tambah kolom `chainId` di semua 17 tabel, dan jadikan bagian dari primary key (komposit), contoh:
  - `v4_programs`: PK `(chainId, pid)`
  - `v4_applicants` / `v4_scholars`: PK `(chainId, pid, wallet)`
  - `v4_milestones`, `v4_disputes`: PK `(chainId, blockchainId)`
  - `v4_reputation`, `v4_bounty_hunters`: PK `(chainId, address)`
  - tabel ber-PK `tx_hash`: `(chainId, tx_hash)`
  - `indexed_blocks`: `(chainId, blockNumber)`
  - `v4_token_registry`: `(chainId, token)`
- **Handler**: ambil `context.chain.id` di setiap event, sertakan di semua insert/update/find. Helper di `handlers/v4/helpers.ts` diubah dulu agar tidak lupa.
- **Reindex wajib.** Ponder tidak mengubah skema di tempat; database indexer dibangun ulang dari blok awal. Data berasal dari chain jadi bisa dibuat ulang, tapi ada waktu sinkron ulang.
- SSE (`sse.notify.service.ts`): sertakan `chainId` di payload agar klien hanya bereaksi pada chain aktif.

### 2.3 Backend
- Semua endpoint menerima `chainId` (query `?chainId=` atau header `x-chain-id`); jika kosong, pakai `DEFAULT_CHAIN_ID` dari env. Klien lama tetap jalan.
- Validasi `chainId` terhadap `SUPPORTED_CHAIN_IDS` (env) → 400 bila tidak didukung.
- Semua service (programs, applicants, scholars, milestones, votes, disputes, reputation, dashboard, tokens, admin) memfilter `chainId` di setiap query ke Ponder SQL.
- Channel SSE dibedakan per chain.
- Webhook progres belajar tidak bergantung chain; dibiarkan.

### 2.4 Frontend
- `v4Addresses` menjadi `getV4Addresses(chainId)`; semua pemakaian (~17 file) membaca chain aktif dari `useChainId()`.
- Token (`token.ts`) per chain: `USDC_META` jadi fungsi `getUsdcMeta(chainId)`.
- Klien API (`axios`) menambah `chainId` di setiap request; semua `queryKey` react-query menyertakan `chainId` agar cache tidak tercampur.
- **Pengganti chain**: komponen di header memakai `useSwitchChain()` dari wagmi. Jika wallet di chain yang tidak didukung, tampilkan ajakan "Pindah jaringan" dan nonaktifkan aksi tulis.
- `wagmiConfig` hanya berisi chain yang benar-benar didukung (Ganache/testnet hanya di dev).
- `getRampNetwork()` (sudah dibuat) sudah per chain.

## 3. Tahapan (Nawasena tetap jalan di tiap tahap)

1. **Persiapan kontrak**: ubah `sync-deployments` menjadi per chain; hasilkan peta alamat. Chain tetap hanya Nawasena.
2. **Indexer**: skema + handler + config multi-chain, dengan satu chain aktif (31338). Reindex di database baru, bandingkan hasil dengan database lama (jumlah baris, beberapa program/milestone).
3. **Backend**: tambah `chainId` + default. Uji bahwa semua endpoint lama mengembalikan hasil yang sama untuk 31338.
4. **Frontend**: peta alamat, `useChainId`, query key, pengganti chain. Uji dengan satu chain, lalu dua.
5. **Chain kedua** (Base/Lisk testnet dulu): deploy kontrak, tambahkan env indexer, uji pindah chain, pastikan data tidak bocor antar chain.

Kerjakan di cabang terpisah (mis. `feat/multichain`), satu tahap per commit.

## 4. Risiko

- **Reindex dan waktu henti**: jalankan indexer baru berdampingan dengan yang lama, lalu pindahkan backend setelah data cocok.
- **`chainId` terlewat di satu query**: data chain A muncul di chain B. Mitigasi: satu helper wajib untuk semua query, dan tes dengan data dua chain.
- **Skala**: satu database untuk banyak chain bisa menjadi besar; pantau, tambahkan indeks pada `chainId`.
- **ID bertabrakan di kode lain**: cek tempat yang menyimpan `pid` mentah (cache, URL, localStorage). Rute seperti `/programs/:pid` perlu `chainId` atau prefix chain.
- **Reputasi per chain**: sebagai default, reputasi dan bobot suara dihitung per chain, tidak digabung. Menggabungkan antar-chain butuh keputusan terpisah.
- **Ponder multichain**: sebelum mulai, cek versi Ponder yang dipakai mendukung sintaks `chain` per kontrak, dan batasan RPC per chain.

## 5. Keputusan yang dibutuhkan

1. Daftar chain yang didukung dan RPC masing-masing.
2. Apakah semua chain akan punya deployment kontrak (dan alamat USDC asli) sendiri, atau sebagian hanya baca?
3. Chain default untuk klien lama.
4. Reputasi per chain atau digabung.
5. Indexer baru berdampingan dulu, atau langsung mengganti.
