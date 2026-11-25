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

### C. Tingkah Laku Skrol (Auto-Hide & Reveal)
- **Scroll Down Delay (~2 Skrol)**: Bar tidak bersembunyi secara mendadak. Ia memerlukan jarak skrol kumulatif (~85px, bersamaan ~2 gerakan skrol) sebelum meluncur keluar dengan lembut (`transform: translate3d(0, calc(100% + 48px), 0)`).
- **Swipe Up Smooth Reveal**: Apabila pengguna meleret ke atas (*swipe up*), bar muncul semula secara lembut menggunakan fizik spring Apple:
  ```css
  transition: transform 0.44s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.36s cubic-bezier(0.16, 1, 0.3, 1)!important;
  ```

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
- Cache terkini: `2list-pwa-v20261125-02`. Sentiasa bump versi cache apabila mengemas kini `index.html`.

### Artifak Berkaitan
- **Atomization Deck**: `tabbar_atomization_deck.html` (Simulator 3D interaktif 6 atom & tuning sandbox).

---

## 4. Fasa 1: Whole Pill (Optical Liquid Glass) — LIVE DALAM `index.html`
Status: **Telah diimplementasikan ke `index.html` (Type A + kedudukan direndahkan)**
- **Whole Pill Final (Type A)**:
  `K=2.00 | RGB=2.5px | Bevel=42% | Blur=0.8px | Tint=35% | Rim=7% | Shadow=ON`
  *(Pantulan terbalik di pinggir border + RGB khusus zon terbalik sahaja; 0.8px micro-blur untuk elak piksel kasar; tengah kekal jelas & normal; kedudukan bawah direndahkan ke `max(calc(env(safe-area-inset-bottom,0px) - 14px), 6px)`.)*

## 5. Fasa 2: Active Pill — LIVE DALAM `index.html`
Status: **Telah diimplementasikan ke `index.html` (iOS Liquid Pill + Spring Wobble)**
- **Active Pill Final (`iOS Liquid Pill`)**:
  `Tone=neutral | Fill=16% | Sheen=70% | Edge=65% | Blur=6.0px | Stretch=20% | Shadow=55% | Lift=ON`
- **Fizik Interaksi**:
  - Spring wobble halus (`stiffness: 210 / 340`, `damping: 21 / 26`) dengan *velocity-based liquid stretch* (`scaleX`/`scaleY`) semasa meluncur antara tab.
  - Menyokong klik terus dan seretan jari melintang (*horizontal scrubbing*) dengan pembesaran titisan (*droplet inflation*) semasa ditekan.
  - Kontras adaptif: Mod Gelap (kaca putih bercahaya) & Mod Terang (kaca *smoked* lut sinar).

---

## 6. Arahan Untuk Perbualan Baru
Apabila memulakan perbualan baru, berikan arahan ini:
> *"Saya ingin sambung kerja reka bentuk tab bar 2List. Sila baca `TAB_BAR_CONTEXT.md` dahulu untuk fahami semua keputusan reka bentuk sebelum ini."*
