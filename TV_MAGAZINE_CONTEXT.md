# 2List — TV Magazine Workflow: Context & Redesign Dossier

Dokumen ini berfungsi sebagai **Jambatan Memori (Context Bridge)** khusus untuk merombak, memperkemas, dan membuang elemen berulang (*repetitive*) dalam aliran kerja **TV Magazine** di dalam aplikasi 2List (`index.html`), tanpa menjejaskan modul lain seperti **Liquid Glass Tab Bar** atau **Conti Sheet**.

---

## 1. Masalah Utama Semasa (Audit UX & Keberulangan)

Pengguna mendapati bahagian **TV Magazine** pada masa ini rasa bercelaru (*cluttered*) dan banyak perkara yang berulang (*repetitive*). Hasil audit kod `index.html` mendapati:

1. **Pertindihan Paparan Episod di 3 Tempat Berbeza**:
   - **Tab `Home` → Swipe Kiri (`Series Episodes Overview`, baris ~1588–1641)**: Memaparkan senarai kotak Episode 01–13 lengkap dengan Lokasi, lencana Sponsored, Tema, dan senarai Capsule 1–5.
   - **Tab `Episode` (`overview()`, baris ~1644)**: Memaparkan maklumat yang hampir **100% sama** (Lokasi, Sponsored, Tema, senarai kad Capsule dalam episod tersebut) ditambah 4 kotak statistik kaku (termasuk *Commercial breaks* yang tidak pernah berubah).
   - **Tab `Script` (`scriptMainPage()`, baris ~2034–2064)**: Sekali lagi memaparkan grid kad Episode 01–13 dengan kiraan kapsul, status skrip, dan durasi.

2. **Pemilih Episod (*Episode Picker*) Yang Tidak Konsisten (4 Gaya Berbeza)**:
   - Di `Episode`: Klik tajuk `<h1> Episode [1] ▾` untuk buka grid nombor.
   - Di `Conti`: Dropdown `<select>` kecil di penjuru kanan atas.
   - Di `Item → Capsule`: Dropdown `<select>` tersembunyi di dalam menu lipat `Search / filter`.
   - Di `Script`: Grid kad besar 2 lajur.

3. **Aliran `Item` (`log()`, baris ~1645–1710) Yang Leceh**:
   - Setiap kali masuk ke tab `Item`, pengguna dipaksa melihat skrin pisah (*Split Cover*: `Questions` vs `Capsule`) dan perlu tekan sekali lagi hanya untuk melihat senarai. Apabila tukar tab, ia ter-reset semula ke *Split*.
   - Data `p.throws` masih dikira dalam lencana notifikasi `logCount` (`records + throws`), menyebabkan angka lencana mengelirukan walaupun senarai `throws` sudah tidak dipaparkan di skrin `Item`.

4. **Borang `Capsule` (`recordDialog()`, baris ~2406–2431) Terlalu Berlapis**:
   - Paparan baca sahaja di atas (perlu klik `Edit` dahulu untuk ubah tajuk/lokasi/tarikh), diikuti dua kotak lipat `<details>` (`Interview questions` & `Details`), serta dua butang `Apply record` berasingan dalam satu dialog.
   - Pengurusan tetamu (*Guest*) dan soalan temu bual tersebar di dua tempat berbeza.

5. **Butang Simpan (`Save`) & Tetapan Yang Mengelirukan**:
   - Bar atas `Save script` hanya muncul apabila masuk ke dalam *Script Editor* sesuatu episod, sedangkan perubahan pada `Home`, `Item`, atau `Episode` tiada penunjuk status simpanan yang jelas.
   - Ikon Gear (`⚙`) pada kad `Home` membuka *Project Settings*, manakala ikon Gear yang sama pada kad `Episode` membuka *Episode Settings*.

---

## 2. Rujukan Teknikal Dalam `index.html`

- **Skema Projek TV Magazine**:
  - `p.settings.projectType = 'script'`, `p.settings.scriptFormat = 'tv-magazine'`
  - `p.settings`: `{ slot, target, breaks, capsules, episodes, intro, promo, credit, station, host, txDates, episodeLocations, episodeThemes, episodeSponsored }`
  - `p.records[]`: Senarai kapsul (`id, episode, capsule, type, topic, description, guest, title, location, date, status, duration, questions, vo, remarks, profile`)
  - `p.scripts[ep]`: Seksyen skrip VIDEO / AUDIO (`Intro`, `Opening`, `Promo`, `Throw 1..N`, `Capsule 1..N`, `Break`, `Closing`, `Credit`).
- **Fungsi Utama Berkaitan**:
  - `home()` (baris ~1582)
  - `overview()` (baris ~1644)
  - `log()` (baris ~1645)
  - `scriptMainPage()` & `editor()` & `preview()` (baris ~2034–2075)
  - `generate(p, ep)` (baris ~1108) — penjana struktur skrip TV Magazine.
  - `recordDialog(id)` & `episodeOverviewDialog(ep)` (baris ~2406–2455).

---

## 3. Sempadan Keselamatan (Jangan Usik!)

1. **JANGAN ubah komponen Liquid Glass Tab Bar** (`.sidebar nav`, `.nav-active-pill`, penapis SVG `#liquid-glass-opt-a`, dan fizik spring tab bar) melainkan jika jumlah/nama tab dipersetujui secara eksplisit oleh pengguna untuk diubah.
2. **JANGAN rosakkan mod `Conti Sheet` tersendiri** (`projectType === 'conti'`, fungsi `conti()`, `contiRecordPage()`, dan swipe-to-delete Conti).
3. Kekalkan keserasian data sedia ada (`SEED_ANGGUN_S4` dan penyegerakan Google Sheets `Code.gs`) supaya data projek `ANGGUN S4` tidak hilang.
4. Setiap kali selesai mengubah `index.html`, kemas kini versi `CACHE_NAME` di dalam `sw.js`.
