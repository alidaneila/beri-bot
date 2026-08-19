# Party + Salary Bot

Bot Discord untuk pembentukan party raid (GDN/DDN) dan pembagian gaji/loot otomatis. Node.js + discord.js v14 + SQLite (better-sqlite3).

## 1. Setup Awal

```bash
npm install
cp .env.example .env
```

Isi `.env`:
- `DISCORD_TOKEN`, `CLIENT_ID` — dari Discord Developer Portal (Bot & General Information)
- `GUILD_ID` — ID server (aktifkan Developer Mode di Discord, klik kanan server > Copy Server ID)
- `SALARY_CHANNEL_ID` — ID channel tempat semua thread salary dibuat
- `ITEM_ADMIN_USER_ID` — (opsional) satu-satunya Discord User ID yang boleh pakai `/setting item`. Kosongkan kalau semua orang boleh.

**Permission bot** di Developer Portal > Bot: aktifkan **Server Members Intent** (dipakai untuk resolve nama member di select menu). Undang bot dengan permission minimal: View Channel, Send Messages, Manage Messages (untuk hapus panel party lama), Create Public Threads, Manage Threads (untuk rename judul thread), Use Application Commands.

## 2. Isi Database

```bash
npm run seed-items      # masukin 159 item dari raw_items.txt ke database
npm run deploy-commands # daftarkan /createparty, /setting, /item-button ke server
npm start                # jalankan bot
```

Kalau daftar item game berubah/nambah di kemudian hari:
- Cara cepat tanpa sentuh kode: pakai `/setting item` di Discord (dibatasi ke `ITEM_ADMIN_USER_ID` doang).
- Cara massal: edit `raw_items.txt`, jalankan `npm run parse-items` (regenerate `src/database/itemData.js`), lalu `npm run seed-items` lagi (aman dijalankan berkali-kali, item yang sudah ada di-skip otomatis).

## 3. Cara Pakai

### Party
1. `/createparty title:<judul>` — bikin panel party dengan tombol role (FU, PR, MC, SM, MT, ICE_STACKING, ARCHER, DPS), otomatis ping `@here <title>`. ICE_STACKING & DPS munculin dropdown subrole setelah tombol dipencet.
2. Kapasitas per role fleksibel (FU & ARCHER max 2 orang, DPS max 3, sisanya max 1 — atur di `src/config.js`), tapi total party dibatasi **hard cap 8 orang** (`config.partyMemberCap`) nggak peduli role apa yang mereka ambil. Party nggak wajib penuh buat di-Done.
3. Member klik tombol role buat join, atau "Cancel My Role" buat keluar.
4. Host bisa: **Lock Party** (kunci slot), **Remove Member** (kick tampilan, bukan hapus data), **Edit Title**, **Notify Again** (broadcast role yang masih ada slot kosong), **Cancel Run**.
5. Host klik **Done** → party dikunci status `done`, thread salary otomatis dibuat di `SALARY_CHANNEL_ID`, panel party lama dihapus, dan semua member party di-ping asli (bukan cuma mention di embed) di pesan pertama thread.

### Salary (di dalam thread yang otomatis dibuat)
Tombol host-only di sini bisa dipegang **host ATAU accounting** yang ditunjuk (lihat poin 8). Set Accounting sendiri tetap murni host-only.

1. **`/item-button item:<ketik nama, autocomplete> qty:<n>`** — tambah item ke daftar loot (status `pending`, menunggu harga). Pencarian lintas seluruh catalog (nggak difilter raid_type), biar cocok buat marathon yang loot-nya campur dari banyak raid.
2. Tombol **Set Harga Item** — pilih item pending dari dropdown, isi harga jual total di modal → status jadi `sold`, masuk section "✅ Sudah Laku".
3. Tombol **Add Gold Drop** — cuma minta jumlah gold (nama otomatis "Gold Drop"), tampil di section terpisah **🪙 Gold Drops**. Setelah ditambah, ada tombol opsional buat pilih siapa yang **nggak** kebagian drop itu (default: semua dapat rata). Gold drop cuma muncul kalau memang ada — kalau nggak ada, section-nya nggak ditampilin. Item hasil jual selalu dibagi rata ke semua, nggak ada opsi exclude per-item.
4. Tombol **Catat Sealstamp Loan** — langsung pilih lender dari dropdown member (bukan ketik ID manual), isi jumlah stamp. Nggak perlu pilih item lagi — total semua sealstamp dijumlah lalu dipotong sekaligus dari total pool item yang laku (bukan per-item), dan dibalikin penuh ke yang minjemin.
5. Tombol **Toggle Exclude dari Gaji** — tandai member yang nggak ikut pembagian sama sekali (tetap kelihatan di roster, keluar dari pembagi semua pool).
6. Tombol **Mark Paid** — tandai member yang sudah ditransfer. Title thread otomatis dapat prefix 💰 begitu ada minimal 1 orang yang dibayar (sekali saja). **Begitu ada 1 orang yang di-mark paid, item/gold/stamp/exclude otomatis terkunci** (server-side, bukan cuma UI) biar perhitungan nggak berubah lagi setelah ada yang mulai ditransfer.
7. Tombol **Close Panel** — kunci panel total, semua tombol nonaktif.
8. Tombol **Set Accounting** (host-only) — pilih 1 member dari dropdown, lalu isi IGN-nya di modal (manual, karena Discord nggak nyimpen nama in-game). Accounting ini setara host untuk semua tombol di atas KECUALI Set Accounting itu sendiri.

Fee 0.3% dipotong dari gaji kotor **masing-masing orang**, bukan dibagi rata — tiap baris di "Status Gaji" nampilin rincian kotor vs fee-nya biar member bisa ngecek sendiri.

Panel salary selalu jadi **satu sumber kebenaran** — setiap ada perubahan data (item baru, harga, stamp loan, exclude, mark paid, accounting), bot langsung edit ulang embed yang sama, bukan kirim pesan baru.

## 4. Struktur Kode

```
src/
  config.js               semua konstanta bisa diubah di sini (fee rate, harga stamp, definisi role/slot)
  database/
    schema.sql             skema lengkap
    db.js                  koneksi + auto-migrate schema saat start
    itemData.js             hasil generate dari raw_items.txt (JANGAN edit manual)
    parseItemData.js         parser raw_items.txt -> itemData.js
    seedItems.js              seed itemData.js -> tabel item_catalog
  services/
    partyService.js          semua logika party (join, lock, remove, dst) — murni DB, tidak nyentuh Discord
    salaryService.js          semua logika salary + rebuildSalaryPanel() (pola edit-satu-embed)
    calculate.js               mesin hitung gaji model "Pool" — pure function, gampang ditest sendiri
  ui/
    partyEmbed.js / partyComponents.js     tampilan panel party
    salaryEmbed.js / salaryComponents.js    tampilan panel salary
  commands/
    party.js, itemAdd.js, lootAdd.js        slash command
    deploy-commands.js                       script registrasi command
  handlers/
    interactionCreate.js    router semua button/select/modal/autocomplete
  utils/
    members.js                helper resolve display name
```

## 5. Catatan & Batasan yang Perlu Diketahui

- Select menu member/item dibatasi 25 opsi (limit Discord). Untuk party dengan role banyak/item sangat banyak per run, ini biasanya cukup — kalau ternyata sering kepotong, kabari saya, bisa ditambah pagination.
- Sealstamp loan yang **tidak** dikaitkan ke item spesifik (opsi "tidak terkait item spesifik") tidak memotong pool manapun — jadi total yang dibagikan akan sedikit lebih besar dari total loot. Sebisa mungkin selalu kaitkan ke item spesifik biar perhitungan tetap balance.
- Perhitungan `netPayable` dibulatkan per orang (`Math.round`), jadi total keseluruhan bisa beda 1-2 gold dari `grossPool - fee` karena pembulatan — ini normal, bukan bug.
- Nomor run (`Run ID`) sekarang tidak lagi ditampilkan di footer panel salary (dulu ada, sengaja dihapus karena cuma referensi internal). Kalau perlu debug, cari langsung lewat database pakai `run_id` yang tercatat di tabel `party_run`/`salary_thread`.

## 6. Multi-Server (Private, Approved-Only)

Bot ini sekarang bisa dipakai di banyak server, tapi **cuma server yang di-approve owner** yang bisa pakai command apapun.

**Setup server baru:**
1. Invite bot ke server.
2. Owner bot (user dengan `OWNER_USER_ID` di `.env`) jalanin `/approve` **di server itu**.
3. Admin server (izin *Manage Guild*) jalanin `/setting server` buat atur:
   - `salary_channel` — channel tempat thread salary otomatis dibuat
   - `thread_visibility` — `private` (default) atau `public`
   - `unsold_board_channel` — (opsional) channel buat board item belum laku **lintas-server**
   - `autonick` — (opsional) kalau ON, nickname member otomatis jadi `nama | IGN` begitu mereka ngasih IGN pas ditag first-timer

Semua field di `/setting server` opsional per-panggilan — cuma yang diisi yang ke-update, bisa dipanggil ulang kapan aja buat ganti pengaturan.

**Global unsold board:** kalau `unsold_board_channel` diisi di 2+ server, board itu nampilin gabungan **semua** item yang masih `pending` (belum diisi harga) dari **semua** server yang ikutan, format: nama item, siapa yang tanggung jawab (accounting/host thread itu), dan sudah berapa lama (`<t:...:R>`, auto-update sendiri di client Discord). Board ke-refresh otomatis tiap ada item ditambah/dihapus/diisi harga/run dibatalin di server manapun.

**Command deployment:** `npm run deploy-commands` — kalau `GUILD_ID` di `.env` diisi, command didaftar instan ke 1 server itu (mode dev/testing). Kalau `GUILD_ID` dikosongin, command didaftar **global** (bisa dipakai di server manapun yang di-approve, tapi propagasi ke Discord bisa sampai ±1 jam).

**Penting — Privileged Intent:** fitur tag first-timer + capture IGN butuh **Message Content Intent**. Aktifin di Discord Developer Portal > aplikasi bot kamu > Bot > **Privileged Gateway Intents** > centang *Message Content Intent* (dan *Server Members Intent* kalau belum). Tanpa ini, bot gagal login atau nggak bisa baca isi pesan balasan IGN.
