# Catatan upgrade kontrak (Nawasena, chain 31338)

## Cek kondisi sekarang

```bash
cd packages/contract
bun run status-v4-nawasena
```

Perintah ini hanya membaca. Ia menunjukkan kontrak mana yang berbeda dari kode di repo, lengkap dengan
perintah upgrade-nya. Percayai hasilnya, bukan catatan di bawah, kalau keduanya berbeda.

Setelah upgrade, tambahkan satu baris di tabel riwayat.

## Kode yang terpasang (per 26 November 2026, blok 574)

Alamat proxy tidak pernah berubah saat upgrade; yang berganti adalah implementasinya.

| Kontrak | Proxy | Implementasi |
|---|---|---|
| Core | `0x09120eAED8e4cD86D85a616680151DAA653880F2` | `0xc075BC0f734EFE6ceD866324fc2A9DBe1065CBB1` |
| CoreLogic (modul Core) | – | `0x837a41023CF81234f89F956C94D676918b4791c1` |
| Treasury | `0xeC1BB74f5799811c0c1Bff94Ef76Fb40abccbE4a` | `0x6484EB0792c646A4827638Fc1B6F20461418eB00` |
| MilestoneManager | `0xF6a8aD553b265405526030c2102fda2bDcdDC177` | `0xfaE849108F2A63Abe3BaB17E21Be077d07e7a9A2` |
| Bounty | `0x6732128F9cc0c4344b2d4DC6285BCd516b7E59E6` | `0xf201fFeA8447AB3d43c98Da3349e0749813C9009` |
| Selection | `0x75b0B516B47A27b1819D21B26203Abf314d42CCE` | `0xA75E74a5109Ed8221070142D15cEBfFe9642F489` |
| CommitteeGovernance | `0x15Ff10fCc8A1a50bFbE07847A22664801eA79E0f` | `0xce830DA8667097BB491A70da268b76a081211814` |

## Riwayat terakhir

Waktu dalam WIB, menurut jam blok. Riwayat sebelum 26 November ada di event `Upgraded` tiap proxy.

| Waktu | Blok | Yang diganti | Isi perubahan |
|---|---|---|---|
| 26 Nov 03.10 | 554–559 | Core, CoreLogic, Treasury, MilestoneManager, Bounty, CommitteeGovernance | Putaran perbaikan keamanan |
| 26 Nov 11.19 | 565–569 | Core, CoreLogic, Treasury, Bounty, Selection | Batas jumlah pendaftar, program macet saat semua penerima bersalah, pengambilan dana tertunda |
| 26 Nov 13.37 | 573–574 | Core, CoreLogic | Lama pembekuan: ringan 180 hari, milestone 365 hari; daftar hitam tidak bisa terhapus oleh hukuman ringan |
