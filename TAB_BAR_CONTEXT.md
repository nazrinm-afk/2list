# 2List — Liquid Glass Tab Bar: Context & Handover Dossier

Dokumen ini dicipta khas sebagai **jambatan memori (Context Bridge)** untuk menyambung pembangunan Tab Bar di dalam perbualan baru tanpa kehilangan sebarang data atau konteks perbincangan terdahulu.

---

## 1. Matlamat & Visi Reka Bentuk
- **Objektif**: Mengadaptasi tema **Liquid Glass iOS** untuk bottom tab navigation 2List (Mobile PWA & Web).
- **Rujukan Utama**:
  - `unionst/union-tab-view` (SwiftUI Liquid Glass tab bar).
  - iOS YouTube app liquid glass floating bar.
  - Apple Human Interface Guidelines: Translucent, airy, fluid momentum, unobtrusive.

---

## 2. Keputusan Reka Bentuk Utama (Disahkan Pengguna)

### A. Seni Bina 2 Pill (Tiada Pill Ketiga/Tengah)
- **Hanya 2 Pill Dibenarkan**:
  1. **Whole Pill**: Badan utama keseluruhan tab bar (kapsul kaca terapung / outer container).
  2. **Active Sliding Pill (`.nav-active-pill`)**: Kapsul penunjuk aktif yang meluncur secara fizikal di bawah ikon yang ditekan.
- **Pill Kedua / Cincin Tengah Dibuang**: Lapisan cincin dalaman (*perimeter distortion rim* / inner border inset 4-5px) yang sebelum ini kelihatan seperti pill statik di tengah telah **dibuang sepenuhnya**.

### B. Border Seamless
- **Tiada garisan sempadan (borderless)**: Menggunakan `border: none!important;`.
- Permukaan kaca berpadu secara *seamless* dengan latar belakang melalui *backdrop blur* 22px, sedikit *saturate (190%)*, dan bayang ambien lembut (`box-shadow: 0 14px 34px rgba(0,0,0,0.26), 0 2px 8px rgba(0,0,0,0.12)`). Tiada garisan keras (*stroke*) di sekelilingnya.

### C. Tingkah Laku Skrol
- **Kekal Di Posisi (Always Visible)**: Fungsi *auto-hide* semasa skrol telah **dibuang** buat masa ini — tab bar kekal di kedudukannya sepanjang masa semasa pengguna menatal halaman.

---

## 3. Kod Teknikal Dalam Fail Projek

### Fail Utama: `index.html`
- **CSS Tab Bar**: Baris ~70–145 (dalam `@media (max-width: 760px)`):
  - `.sidebar nav`: Badan tab bar terapung.
  - `.nav-active-pill`: Kapsul penunjuk aktif yang meluncur.
  - `.nav-link`: Butang ikon tab dengan label ringkas.
- **HTML Nav Render**: Baris ~1475 di dalam `function header()`.
  - Senarai tab: `['conti', 'Conti']`, `['script', 'Script']`, `['home', 'Home']`, `['log', 'Item']`, `['overview', 'Episode']`.
- **Logik Skrol**: Baris ~3520–3575 (`window.addEventListener('scroll')` dan element scroll capture).
- **Logik Pertukaran Tab**: `function doAction('nav', b)` di baris ~2524.

### Fail Service Worker: `sw.js`
- Cache terkini: `2list-pwa-v20261127-07`. Sentiasa bump versi cache apabila mengemas kini `index.html`.

### Artifak Berkaitan
- **Atomization Deck**: `tabbar_atomization_deck.html` (Simulator 3D interaktif 6 atom & tuning sandbox).

---

## 4. Fasa 1: Whole Pill (Optical Liquid Glass) — LIVE DALAM `index.html`
Status: **Telah diimplementasikan ke `index.html` (Type A + kedudukan direndahkan)**
- **Whole Pill Final (Type A)**:
  `K=2.00 | RGB=2.5px | Bevel=42% | Blur=0.8px | Tint=35% | Rim=7% | Shadow=ON`
  *(Pantulan terbalik di pinggir border + RGB khusus zon terbalik sahaja; 0.8px micro-blur untuk elak piksel kasar; tengah kekal jelas & normal; kedudukan bawah direndahkan ke `max(calc(env(safe-area-inset-bottom,0px) - 14px), 6px)`.)*

## 5. Fasa 2: Active Pill (Optical Glass Lens Overlay) — LIVE DALAM `index.html`
Status: **Telah diimplementasikan ke `index.html` (Optical Lens Overlay + Crisp Icon On Land + Spring Wobble)**
- **Active Pill Final**:
  `AP_K=1.00 | AP_RGB=1.5px | AP_Bevel=26% | AP_Blur=1.4px | AP_Tint=0% | AP_Rim=11% | Stretch=40% | CrispOnLand=ON` *(ikon & label aktif kekal kuning aksen `#f4cc57`)*
- **Seni Bina & Fizik Interaksi**:
  - Active Pill berada di **atas** ikon menu (`z-index: 5`) dengan penapis biasan optik `#active-pill-glass-rgb` (sama sifat optik seperti Whole Pill), jadi ikon & label menu di bawahnya membias dengan kesan kaca & RGB pinggir semasa dilintasi/diseret.
  - **Crisp Icon On Land (`z-index: 6`)**: Sebaik sahaja Active Pill mendarat & berhenti pada tab pilihan, lapisan ikon aktif yang tajam muncul lembut di atas Active Pill (bebas kabur `1.4px`), dan hilang serta-merta apabila mula meluncur/diseret.
  - **Spring Wobble & Scrubbing**: `Stretch=40%` (`stiffness: 210 / 340`, `damping: 21 / 26`) dengan sokongan klik terus dan seretan jari melintang (*horizontal scrubbing*).

---

## 6. Arahan Untuk Perbualan Baru
Apabila memulakan perbualan baru, berikan arahan ini:
> *"Saya ingin sambung kerja reka bentuk tab bar 2List. Sila baca `TAB_BAR_CONTEXT.md` dahulu untuk fahami semua keputusan reka bentuk sebelum ini."*
