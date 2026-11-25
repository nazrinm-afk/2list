# 2List — Content Creation Mode: Context & Architecture Dossier

Dokumen ini berfungsi sebagai **Jambatan Memori (Context Bridge)** khusus untuk mereka bentuk dan membangunkan mod **Content Creation** (penciptaan kandungan digital / media sosial / video pendek & panjang) di dalam aplikasi 2List (`index.html`), secara terasing tanpa merosakkan aliran **TV Magazine** atau **Conti Sheet**.

---

## 1. Latar Belakang & Kedudukan Semasa Dalam Kod

Di dalam `index.html` sekarang, apabila pengguna mencipta projek baru (`projectDialog` → `projectTypeDialog` → `scriptFormatDialog`, baris ~2456–2462):
1. Pengguna memilih antara **Conti Sheet** (`data-type="conti"`) atau **Script** (`data-type="script"`).
2. Jika memilih **Script**, dialog `Choose script format` muncul dengan 4 pilihan:
   - `TV Magazine` (`data-format="tv-magazine"`) — **Aktif**
   - `Talk Show` — *Dikunci (`PRO` / disabled)*
   - `Documentary` — *Dikunci (`PRO` / disabled)*
   - `Social Media Content` — *Dikunci (`PRO` / disabled)*

Buat masa ini, keseluruhan struktur skrin `Home`, `Item`, `Episode`, dan `Script` diikat secara tegar (*hardcoded*) kepada istilah penyiaran TV tradisional seperti *Station (TVS/TV3)*, *TX Date*, *Broadcast Slot (30/60 min)*, *Commercial Breaks*, *Host Throw*, dan *Capsules per Episode*.

---

## 2. Mengapa Content Creation Perlukan Aliran Tersendiri

Pencipta kandungan (*Content Creators*, produksi digital, Reels/TikTok/YouTube Shorts/YouTube Long-form, kempen jenama) **tidak menggunakan** struktur *Broadcast Slot*, *Commercial Breaks*, atau *Host Throw*. Sebaliknya, aliran kerja Content Creation memerlukan:

- **Identiti Projek / Kempen / Saluran**:
  - Platform sasaran (TikTok, IG Reels, YouTube Shorts, YouTube Video, Podcast/Vodcast).
  - *Content Pillars* / Kategori atau Siri (bukannya *TV Station* & *Commercial Breaks*).
- **Perancangan Idea & Batch Penggambaran (*Content Pipeline / Board*)**:
  - Status pantas: `IDEA` → `SCRIPTING` → `READY TO SHOOT` → `FILMED` → `EDITING` → `POSTED`.
  - *Sponsored / Brand Deal* tracker (deliverables, tarikh hantar draf, tarikh posting).
- **Struktur Skrip Mesra Kreator (bukannya jadual A/V TV klasik semata-mata)**:
  - **Hook (0–3 saat)** — visual hook & spoken/text hook.
  - **Body / Talking Points / Story Beats** — poin penting atau skrip penuh + senarai *B-Roll / Shotlist* yang diperlukan.
  - **CTA (Call to Action) & Outro**.
  - **Caption, Hashtags & Posting Notes**.
- **Integrasi Conti / Shotlist Ringkas di Set**:
  - Boleh menyambung terus ke fungsi *Conti Sheet* sedia ada apabila penggambaran melibatkan banyak kamera (*multi-cam shoot* / kempen komersial), atau mod *Shot Checklist* pantas untuk penggambaran solo/kru kecil.

---

## 3. Rujukan Teknikal Dalam `index.html`

- **Titik Masuk Format**:
  - `projectTypeDialog(name)` & `scriptFormatDialog(name)` (baris ~2457–2462).
  - `doAction('select-project-type')` & `doAction('select-script-format')` (baris ~2552–2574).
  - Pemboleh ubah projek: `p.settings.projectType` dan `p.settings.scriptFormat` (contoh: `'content-creation'` atau `'social-media'`).
  - `document.body.dataset.projectType` pada `render()` (baris ~1508).
- **Enjin AI Sedia Ada**:
  - Integrasi Gemini (`buildGeminiPrompt`, `requestAI`, baris ~1269 & ~3399) boleh disesuaikan untuk menjana *Hooks*, *Talking Points*, dan *B-Roll suggestions* khusus untuk mod Content Creation.
- **Penyimpanan & Sinkronisasi**:
  - Menggunakan adapter `safeStorage` / IndexedDB dan Google Sheets (`adapter.save(p, token)`), di mana objek projek `p` disimpan sebagai JSON fleksibel—bermakna medan tambahan untuk Content Creation boleh disimpan di dalam `p.settings` dan `p.items` / `p.records` tanpa memecahkan skema projek lama!

---

## 4. Sempadan Keselamatan (Jangan Usik!)

1. **Pastikan pengasingan berdasarkan `p.settings.scriptFormat` / `p.settings.projectType`**:
   - Projek sedia ada seperti `ANGGUN S4` (`scriptFormat: 'tv-magazine'`) mesti terus berfungsi tanpa gangguan.
2. **JANGAN ubah penggayaan atau fizik Liquid Glass Tab Bar** (`.sidebar nav`, `.nav-active-pill`), tetapi label/ikon tab boleh disesuaikan secara dinamik mengikut mod projek jika dipersetujui pengguna.
3. **JANGAN rosakkan mod `Conti Sheet`**.
4. Setiap kali mengubah `index.html`, naik taraf `CACHE_NAME` di dalam `sw.js`.
