export function renderIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ev Yemeklerim — Günlük Taze Ev Yemekleri & Doğal Ürünler</title>
  <style>
    :root {
      --bg: #faf7f2;
      --surface: #ffffff;
      --surface-alt: #f3ede2;
      --border: #e5dec9;
      --primary: #b45309;
      --primary-hover: #92400e;
      --primary-light: #fef3c7;
      --accent: #15803d;
      --accent-light: #dcfce7;
      --danger: #b91c1c;
      --danger-light: #fee2e2;
      --text: #1c1917;
      --text-muted: #57534e;
      --radius: 14px;
      --shadow: 0 6px 24px rgba(28, 25, 23, 0.07);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    /* Header */
    header {
      background: #1c1917;
      color: #fff;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    }
    .header-inner {
      max-width: 1320px;
      margin: 0 auto;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      text-decoration: none;
      color: #fff;
    }
    .brand-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, #d97706, #9a3412);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    .brand-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }
    .brand-sub {
      font-size: 11px;
      color: #d6d3d1;
      display: block;
    }
    .nav-tabs {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .nav-btn {
      background: rgba(255,255,255,0.08);
      color: #e7e5e4;
      border: 1px solid rgba(255,255,255,0.12);
      padding: 8px 15px;
      border-radius: 999px;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.18s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .nav-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
    .nav-btn.active {
      background: var(--primary);
      border-color: #f59e0b;
      color: #fff;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .cart-trigger {
      background: linear-gradient(135deg, #d97706, #b45309);
      color: #fff;
      border: none;
      padding: 9px 16px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 10px rgba(217,119,6,0.35);
    }
    .cart-badge {
      background: #fff;
      color: #9a3412;
      font-size: 12px;
      font-weight: 800;
      padding: 1px 7px;
      border-radius: 999px;
    }
    .user-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,0.1);
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 13px;
    }
    .role-badge {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 999px;
      text-transform: uppercase;
    }
    .role-ADMIN { background: #dc2626; color: #fff; }
    .role-CUSTOMER { background: #16a34a; color: #fff; }

    /* Hero */
    .hero {
      background: linear-gradient(135deg, #431407 0%, #7c2d12 55%, #9a3412 100%);
      color: #fff;
      padding: 36px 20px;
      border-bottom: 1px solid var(--border);
    }
    .hero-inner {
      max-width: 1320px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      flex-wrap: wrap;
    }
    .hero h1 {
      font-size: 30px;
      font-weight: 800;
      margin-bottom: 8px;
      line-height: 1.2;
    }
    .hero p {
      color: #fed7aa;
      max-width: 640px;
      font-size: 15px;
    }
    .hero-badges {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 16px;
    }
    .hero-badge {
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.2);
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 12.5px;
      color: #fffbeb;
    }

    /* Main Container */
    main {
      max-width: 1320px;
      width: 100%;
      margin: 0 auto;
      padding: 24px 20px 60px;
      flex: 1;
    }

    /* Filter Bar */
    .filter-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 24px;
      flex-wrap: wrap;
      background: var(--surface);
      padding: 14px 18px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
    }
    .category-pills {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .cat-pill {
      background: var(--surface-alt);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 7px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .cat-pill.active, .cat-pill:hover {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
    .search-input {
      padding: 9px 14px;
      border-radius: 999px;
      border: 1px solid var(--border);
      font-size: 14px;
      min-width: 240px;
      outline: none;
    }
    .search-input:focus { border-color: var(--primary); }

    /* Product Grid */
    .product-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 22px;
    }
    .product-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      transition: transform 0.18s, box-shadow 0.18s;
    }
    .product-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 28px rgba(28, 25, 23, 0.12);
    }
    .product-img-wrap {
      position: relative;
      height: 195px;
      background: #292524;
      overflow: hidden;
    }
    .product-img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .stock-pill {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 700;
      backdrop-filter: blur(6px);
    }
    .stock-ok { background: rgba(21, 128, 61, 0.9); color: #fff; }
    .stock-low { background: rgba(180, 83, 9, 0.95); color: #fff; }
    .stock-out { background: rgba(185, 28, 28, 0.95); color: #fff; }
    .cat-tag {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(28, 25, 23, 0.8);
      color: #fef3c7;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }
    .product-body {
      padding: 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .product-title {
      font-size: 17px;
      font-weight: 800;
      color: var(--text);
    }
    .product-meta {
      display: flex;
      gap: 10px;
      font-size: 12px;
      color: var(--text-muted);
      flex-wrap: wrap;
    }
    .product-desc {
      font-size: 13.5px;
      color: var(--text-muted);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .allergen-list {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
      margin-top: 2px;
    }
    .allergen-chip {
      font-size: 11px;
      background: #fff7ed;
      color: #9a3412;
      border: 1px solid #fed7aa;
      padding: 2px 7px;
      border-radius: 6px;
      font-weight: 600;
    }
    .product-footer {
      padding: 12px 16px 16px;
      border-top: 1px solid #f5f5f4;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .price-tag {
      font-size: 20px;
      font-weight: 900;
      color: var(--primary);
    }
    .btn {
      padding: 8px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-primary:hover:not(:disabled) { background: var(--primary-hover); }
    .btn-outline { background: transparent; border-color: var(--border); color: var(--text); }
    .btn-outline:hover:not(:disabled) { background: var(--surface-alt); }
    .btn-success { background: var(--accent); color: #fff; }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 8px; }

    /* Cards & Tables for Orders / Admin */
    .panel-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      box-shadow: var(--shadow);
      margin-bottom: 20px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px;
      box-shadow: var(--shadow);
    }
    .stat-label { font-size: 12.5px; color: var(--text-muted); font-weight: 600; }
    .stat-value { font-size: 24px; font-weight: 900; margin-top: 4px; color: var(--text); }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13.5px;
    }
    th, td {
      padding: 11px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: var(--surface-alt);
      font-weight: 700;
      font-size: 12px;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    /* Status Badges */
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 800;
    }
    .status-PAID { background: #dbeafe; color: #1e40af; }
    .status-PREPARING { background: #fef3c7; color: #92400e; }
    .status-DELIVERED { background: #dcfce7; color: #166534; }
    .status-REFUND_REQUESTED { background: #ffedd5; color: #9a3412; }
    .status-REFUNDED { background: #fee2e2; color: #991b1b; }

    /* Modals & Drawers */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(28, 25, 23, 0.65);
      backdrop-filter: blur(3px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 200;
      padding: 16px;
    }
    .modal-backdrop.open { display: flex; }
    .modal-box {
      background: var(--surface);
      border-radius: 16px;
      max-width: 680px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      padding: 24px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.3);
      border: 1px solid var(--border);
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 12px;
    }
    .form-group.full { grid-column: 1 / -1; }
    .form-group label {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--text-muted);
    }
    .form-control {
      padding: 9px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
    }
    textarea.form-control { min-height: 80px; resize: vertical; }

    /* Toast Notification */
    #toast-container {
      position: fixed;
      bottom: 22px;
      right: 22px;
      z-index: 300;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .toast {
      background: #1c1917;
      color: #fff;
      padding: 12px 18px;
      border-radius: 10px;
      font-size: 13.5px;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.22);
      border-left: 5px solid var(--primary);
      max-width: 380px;
    }
    .toast.success { border-left-color: #22c55e; }
    .toast.error { border-left-color: #ef4444; }
  </style>
</head>
<body>
  <header>
    <div class="header-inner">
      <div class="brand" onclick="switchView('store')">
        <div class="brand-icon">🍲</div>
        <div>
          <span class="brand-title">Ev Yemeklerim</span>
          <span class="brand-sub">Anne Eli Değmiş Günlük Taze Lezzetler</span>
        </div>
      </div>

      <nav class="nav-tabs">
        <button class="nav-btn active" id="nav-store" onclick="switchView('store')">🍽️ Günün Menüsü & Ürünler</button>
        <button class="nav-btn" id="nav-orders" onclick="switchView('orders')" style="display:none;">📦 Siparişlerim & İade</button>
        <button class="nav-btn" id="nav-emails" onclick="switchView('emails')" style="display:none;">✉️ E-Posta Bildirimlerim</button>
        <button class="nav-btn" id="nav-profile" onclick="switchView('profile')" style="display:none;">👤 Üyelik Bilgilerim</button>
        <button class="nav-btn" id="nav-admin" onclick="switchView('admin')" style="display:none;">🛠️ Yönetici Paneli</button>
      </nav>

      <div class="header-actions">
        <div id="auth-area"></div>
        <button class="cart-trigger" onclick="openCartModal()">
          🛒 Sepetim <span class="cart-badge" id="cart-count">0</span>
        </button>
      </div>
    </div>
  </header>

  <section class="hero" id="hero-banner">
    <div class="hero-inner">
      <div>
        <h1>Katkısız, Doğal Ev Yapımı Lezzetler & Kurutmalıklar</h1>
        <p>Dalında kurutulmuş Aydın dağ inciri, doğal fermente sele siyah zeytin, güneşte kurutulmuş cennet hurması, çıtır incir reçeli ve el yapımı kızarmış içli köfte doğrudan mutfağımızdan sofranıza.</p>
        <div class="hero-badges">
          <span class="hero-badge">✅ %100 Doğal & Katkısız Ev Yapımı</span>
          <span class="hero-badge">🔒 Atomik Günlük Stok Garantisi</span>
          <span class="hero-badge">✉️ Anında Sipariş & İade E-Posta Bildirimi</span>
        </div>
      </div>
    </div>
  </section>

  <main>
    <!-- VIEW 1: STOREFRONT -->
    <div id="view-store">
      <div class="filter-bar">
        <div class="category-pills" id="category-pills"></div>
        <input type="search" id="search-box" class="search-input" placeholder="Yemek, malzeme veya kategori ara..." oninput="renderStorefront()" />
      </div>
      <div class="product-grid" id="product-grid"></div>
    </div>

    <!-- VIEW 2: CUSTOMER ORDERS & REFUNDS -->
    <div id="view-orders" style="display:none;">
      <div class="panel-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
          <div>
            <h2 style="font-size:22px;font-weight:800;">📦 Siparişlerim ve İade Yönetimi</h2>
            <p style="font-size:13.5px;color:var(--text-muted);">Siparişlerinizin durumunu takip edebilir, satın alma anındaki dondurulmuş (snapshot) fiyatları görebilir ve tek tıkla iade işlemi başlatabilirsiniz.</p>
          </div>
          <button class="btn btn-outline btn-sm" onclick="loadMyOrders()">🔄 Yenile</button>
        </div>
        <div id="my-orders-container"></div>
      </div>
    </div>

    <!-- VIEW 3: TRANSACTIONAL EMAIL INBOX -->
    <div id="view-emails" style="display:none;">
      <div class="panel-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
          <div>
            <h2 style="font-size:22px;font-weight:800;">✉️ Gönderilen E-Posta Bildirimleri</h2>
            <p style="font-size:13.5px;color:var(--text-muted);">Satın alma ve iade işlemlerinde hesabınıza gönderilen gerçek HTML e-posta bildirimleri.</p>
          </div>
          <button class="btn btn-outline btn-sm" onclick="loadEmailsView()">🔄 Yenile</button>
        </div>
        <div id="emails-list-container"></div>
      </div>
    </div>

    <!-- VIEW 3B: MEMBER PROFILE & TURKEY ADDRESS PORTAL -->
    <div id="view-profile" style="display:none;">
      <div class="panel-card" style="max-width:820px;margin:0 auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border);">
          <div>
            <h2 style="font-size:22px;font-weight:900;">👤 Üyelik Bilgilerim & Türkiye Adres Portalı</h2>
            <p style="font-size:13.5px;color:var(--text-muted);">Türkiye'deki 81 İl, 973 İlçe ve tüm Mahalleler arasından teslimat bölgenizi seçip adres açıklamanızı kaydedebilirsiniz.</p>
          </div>
          <span class="status-badge status-DELIVERED">☁️ Supabase Kalıcı Kayıt Aktif</span>
        </div>

        <form onsubmit="submitProfileForm(event)">
          <!-- Kişisel Bilgiler -->
          <div style="background:var(--surface-alt);padding:16px;border-radius:12px;border:1px solid var(--border);margin-bottom:20px;">
            <h3 style="font-size:15px;font-weight:800;margin-bottom:12px;color:var(--primary);">1. Kişisel Üyelik Bilgileri</h3>
            <div class="form-grid">
              <div class="form-group">
                <label>E-Posta Adresi</label>
                <input type="email" id="prof-email" class="form-control" disabled style="background:#e7e5e4;cursor:not-allowed;" />
              </div>
              <div class="form-group">
                <label>Ad Soyad *</label>
                <input type="text" id="prof-fullname" class="form-control" required placeholder="Adınız Soyadınız" />
              </div>
              <div class="form-group">
                <label>Telefon Numarası *</label>
                <input type="text" id="prof-phone" class="form-control" required placeholder="05XX XXX XX XX" />
              </div>
              <div class="form-group">
                <label>Yeni Şifre (Değiştirmek istemiyorsanız boş bırakın)</label>
                <input type="password" id="prof-password" class="form-control" placeholder="En az 6 karakter" />
              </div>
            </div>
          </div>

          <!-- Türkiye İl - İlçe - Mahalle Adres Portalı -->
          <div style="background:#fff;padding:18px;border-radius:12px;border:2px solid #fed7aa;margin-bottom:20px;box-shadow:0 4px 14px rgba(180,83,9,0.06);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
              <h3 style="font-size:16px;font-weight:900;color:var(--primary);">2. 🇹🇷 Türkiye İl • İlçe • Mahalle Seçim Portalı</h3>
              <span id="neighborhood-status-badge" style="font-size:12px;font-weight:700;color:var(--accent);background:var(--accent-light);padding:4px 10px;border-radius:999px;">81 İl & Tüm İlçeler Hazır</span>
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label>Adres Başlığı</label>
                <select id="addr-title" class="form-control" onchange="updateCombinedAddressPreview()">
                  <option value="Ev Adresi">🏠 Ev Adresi</option>
                  <option value="İş Yeri Adresi">🏢 İş Yeri Adresi</option>
                  <option value="Aile / Diğer Adres">📍 Aile / Diğer Adres</option>
                </select>
              </div>

              <div class="form-group">
                <label>İl Seçiniz (81 İl) *</label>
                <select id="addr-province" class="form-control" required onchange="onProvinceChange()">
                  <option value="">-- İl Seçiniz --</option>
                </select>
              </div>

              <div class="form-group">
                <label>İlçe Seçiniz *</label>
                <select id="addr-district" class="form-control" required onchange="onDistrictChange()" disabled>
                  <option value="">-- Önce İl Seçiniz --</option>
                </select>
              </div>

              <div class="form-group">
                <label>Mahalle / Köy Seçiniz *</label>
                <select id="addr-neighborhood" class="form-control" required onchange="onNeighborhoodChange()" disabled>
                  <option value="">-- Önce İlçe Seçiniz --</option>
                </select>
              </div>

              <div class="form-group full" id="custom-neighborhood-wrap" style="display:none;">
                <label>Mahalle / Köy Adını Yazınız *</label>
                <input type="text" id="addr-neighborhood-custom" class="form-control" placeholder="Örn: Cumhuriyet Mah." oninput="updateCombinedAddressPreview()" />
              </div>

              <div class="form-group full">
                <label>Açık Adres Detayı / Açıklama (Cadde, Sokak, Bina No, Kat, Daire No, Tarif) *</label>
                <textarea id="addr-detail" class="form-control" required placeholder="Örn: Bahariye Caddesi Çiçek Apartmanı No: 42 Kat: 3 Daire: 5 (Köşedeki fırının yanındaki bina)" oninput="updateCombinedAddressPreview()"></textarea>
              </div>
            </div>

            <!-- Canlı Birleştirilmiş Adres Önizlemesi -->
            <div style="background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:12px 14px;margin-top:8px;">
              <div style="font-size:11.5px;font-weight:800;color:#9a3412;text-transform:uppercase;margin-bottom:4px;">📍 Kaydedilecek Tam Teslimat Adresi Önizlemesi:</div>
              <div id="combined-address-preview" style="font-size:14px;font-weight:700;color:var(--text);">Lütfen yukarıdan İl, İlçe, Mahalle seçin ve adres açıklamanızı yazın.</div>
              <input type="hidden" id="prof-address" />
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:10px;">
            <button type="button" class="btn btn-outline" onclick="switchView('store')">Vitrine Dön</button>
            <button type="submit" class="btn btn-primary" style="padding:11px 22px;font-size:14.5px;">💾 Adresimi ve Üyelik Bilgilerimi Kaydet</button>
          </div>
        </form>
      </div>
    </div>

    <!-- VIEW 4: ADMIN PANEL -->
    <div id="view-admin" style="display:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="font-size:24px;font-weight:900;">🛠️ Yönetici Kontrol Paneli (Admin)</h2>
          <p style="font-size:13.5px;color:var(--text-muted);">Ürün ekleme, çıkarma, fiyat/stok düzenleme, sipariş durumu ilerletme, iade onaylama, e-posta kuyruğu ve denetim izi (Audit Log).</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="openProductModal()">➕ Yeni Yemek / Ürün Ekle</button>
          <button class="btn btn-outline" onclick="loadAdminAll()">🔄 Tüm Verileri Yenile</button>
        </div>
      </div>

      <div class="stats-grid" id="admin-stats-grid"></div>

      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="cat-pill active" id="adm-tab-products" onclick="switchAdminSubTab('products')">🍲 Ürün & Menü Yönetimi</button>
        <button class="cat-pill" id="adm-tab-orders" onclick="switchAdminSubTab('orders')">📋 Sipariş & İade (FSM) Yönetimi</button>
        <button class="cat-pill" id="adm-tab-outbox" onclick="switchAdminSubTab('outbox')">📨 E-Posta Outbox Kuyruğu</button>
        <button class="cat-pill" id="adm-tab-audit" onclick="switchAdminSubTab('audit')">🛡️ Denetim İzi (Audit Logs)</button>
      </div>

      <div id="admin-sub-products" class="panel-card"></div>
      <div id="admin-sub-orders" class="panel-card" style="display:none;"></div>
      <div id="admin-sub-outbox" class="panel-card" style="display:none;"></div>
      <div id="admin-sub-audit" class="panel-card" style="display:none;"></div>
    </div>
  </main>

  <!-- MODAL: PRODUCT DETAIL -->
  <div class="modal-backdrop" id="modal-product-detail">
    <div class="modal-box" id="modal-product-detail-content"></div>
  </div>

  <!-- MODAL: AUTH (LOGIN / REGISTER) -->
  <div class="modal-backdrop" id="modal-auth">
    <div class="modal-box" style="max-width:480px;">
      <div class="modal-header">
        <h3 id="auth-modal-title" style="font-size:19px;font-weight:800;">Hesaba Giriş Yap</h3>
        <button class="btn btn-sm btn-outline" onclick="closeModal('modal-auth')">✕</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="btn btn-sm btn-primary" id="tab-login-btn" onclick="toggleAuthMode('login')" style="flex:1;">Giriş Yap</button>
        <button class="btn btn-sm btn-outline" id="tab-register-btn" onclick="toggleAuthMode('register')" style="flex:1;">Yeni Hesap Oluştur</button>
      </div>
      <form id="auth-form" onsubmit="submitAuthForm(event)">
        <div id="register-extra-fields" style="display:none;">
          <div class="form-group">
            <label>Ad Soyad *</label>
            <input type="text" id="auth-fullname" class="form-control" placeholder="Örn: Mehmet Demir" />
          </div>
          <div class="form-group">
            <label>Telefon Numarası *</label>
            <input type="text" id="auth-phone" class="form-control" placeholder="0532 000 00 00" />
          </div>
          <div style="background:#fff7ed;border:1px solid #fed7aa;padding:10px 12px;border-radius:8px;font-size:12.5px;color:#9a3412;margin-bottom:12px;">
            📍 <strong>Not:</strong> Üye olduktan hemen sonra açılacak olan <strong>Türkiye İl • İlçe • Mahalle Adres Portalı</strong> ekranından açık teslimat adresinizi seçebilirsiniz.
          </div>
        </div>
        <div class="form-group">
          <label>E-Posta Adresi *</label>
          <input type="email" id="auth-email" class="form-control" required placeholder="ornek@eposta.com" />
        </div>
        <div class="form-group">
          <label>Şifre *</label>
          <input type="password" id="auth-password" class="form-control" required placeholder="En az 6 karakter" />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;padding:11px;margin-top:8px;" id="auth-submit-btn">Giriş Yap</button>
      </form>
    </div>
  </div>

  <!-- MODAL: CART & CHECKOUT -->
  <div class="modal-backdrop" id="modal-cart">
    <div class="modal-box">
      <div class="modal-header">
        <h3 style="font-size:20px;font-weight:800;">🛒 Sepetim ve Sipariş Tamamlama</h3>
        <button class="btn btn-sm btn-outline" onclick="closeModal('modal-cart')">✕</button>
      </div>
      <div id="cart-modal-body"></div>
    </div>
  </div>

  <!-- MODAL: ADMIN CREATE/EDIT PRODUCT -->
  <div class="modal-backdrop" id="modal-admin-product">
    <div class="modal-box">
      <div class="modal-header">
        <h3 id="admin-product-modal-title" style="font-size:20px;font-weight:800;">Ürün Ekle / Düzenle</h3>
        <button class="btn btn-sm btn-outline" onclick="closeModal('modal-admin-product')">✕</button>
      </div>
      <form id="admin-product-form" onsubmit="submitAdminProductForm(event)">
        <input type="hidden" id="prd-id" />
        <div class="form-grid">
          <div class="form-group full">
            <label>Yemek / Ürün Adı *</label>
            <input type="text" id="prd-name" class="form-control" required placeholder="Örn: Anne Usulü Karnıyarık" />
          </div>
          <div class="form-group">
            <label>Kategori *</label>
            <input type="text" id="prd-category" class="form-control" required placeholder="Kurutmalıklar & Doğal Meyveler" list="cat-suggestions" />
            <datalist id="cat-suggestions">
              <option value="Kurutmalıklar & Doğal Meyveler"></option>
              <option value="Kahvaltılık & Zeytin"></option>
              <option value="Ev Yapımı Reçeller"></option>
              <option value="İçli Köfte & Ev Yemekleri"></option>
            </datalist>
          </div>
          <div class="form-group">
            <label>Birim Fiyat (TL) *</label>
            <input type="text" id="prd-price-tl" class="form-control" required placeholder="Örn: 260,00" />
          </div>
          <div class="form-group">
            <label>Günlük Stok / Porsiyon Kapasitesi *</label>
            <input type="number" id="prd-stock" class="form-control" required min="0" max="10000" value="25" />
          </div>
          <div class="form-group">
            <label>Hazırlanma Süresi (Dakika) *</label>
            <input type="number" id="prd-prep" class="form-control" required min="1" max="1440" value="15" />
          </div>
          <div class="form-group full">
            <label>Porsiyon / Gramaj Bilgisi *</label>
            <input type="text" id="prd-portion" class="form-control" required placeholder="Örn: 1 Paket (500g Net)" />
          </div>
          <div class="form-group full">
            <label>Alerjen Etiketleri (Virgülle ayırın)</label>
            <input type="text" id="prd-allergens" class="form-control" placeholder="Örn: Gluten, Ceviz, Yumurta" />
          </div>
          <div class="form-group full">
            <label>Ürün Görseli (URL girin veya bilgisayardan fotoğraf seçin)</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="text" id="prd-image" class="form-control" style="flex:1;" placeholder="/uploads/kuru-incir.jpg veya https://..." />
              <input type="file" id="prd-image-file" accept="image/*" style="font-size:12px;max-width:210px;" onchange="handleImageFileSelect(event)" />
            </div>
          </div>
          <div class="form-group full">
            <label>Ürün Tanıtımı, İçindekiler ve Isıtma Önerisi *</label>
            <textarea id="prd-desc" class="form-control" required placeholder="Yemeğin malzemelerini, pişirme tekniğini ve lezzet detaylarını yazın..."></textarea>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="prd-featured" /> Vitrinde Öne Çıkan Ürün
            </label>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
          <button type="button" class="btn btn-outline" onclick="closeModal('modal-admin-product')">İptal</button>
          <button type="submit" class="btn btn-primary">💾 Kaydet</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: EMAIL HTML PREVIEW -->
  <div class="modal-backdrop" id="modal-email-preview">
    <div class="modal-box" style="max-width:740px;">
      <div class="modal-header">
        <h3 id="email-preview-title" style="font-size:17px;font-weight:800;">E-Posta Önizleme</h3>
        <button class="btn btn-sm btn-outline" onclick="closeModal('modal-email-preview')">✕</button>
      </div>
      <div id="email-preview-meta" style="font-size:12.5px;background:var(--surface-alt);padding:10px 14px;border-radius:8px;margin-bottom:12px;"></div>
      <iframe id="email-preview-frame" style="width:100%;height:460px;border:1px solid var(--border);border-radius:10px;background:#fff;"></iframe>
    </div>
  </div>

  <div id="toast-container"></div>

  <script>
    let state = {
      user: null,
      products: [],
      adminProducts: [],
      selectedCategory: 'Tümü',
      cart: JSON.parse(localStorage.getItem('evyemek_cart') || '[]'),
      myOrders: [],
      adminOrders: [],
      emails: [],
      auditLogs: [],
      authMode: 'login',
      currentView: 'store'
    };

    function showToast(msg, type = 'info') {
      const wrap = document.getElementById('toast-container');
      const el = document.createElement('div');
      el.className = 'toast ' + type;
      el.textContent = msg;
      wrap.appendChild(el);
      setTimeout(() => el.remove(), 4200);
    }

    function escapeHtml(s) {
      if (s === null || s === undefined) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function formatKurus(k) {
      const n = Math.round(Number(k) || 0);
      const lira = Math.floor(Math.abs(n) / 100);
      const kurus = Math.abs(n) % 100;
      return (n < 0 ? '-' : '') + lira.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.') + ',' + String(kurus).padStart(2, '0') + ' ₺';
    }

    async function api(path, options = {}) {
      const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || ('İşlem başarısız (' + res.status + ')'));
      }
      return data;
    }

    function saveCart() {
      localStorage.setItem('evyemek_cart', JSON.stringify(state.cart));
      const totalQty = state.cart.reduce((s, i) => s + i.quantity, 0);
      document.getElementById('cart-count').textContent = totalQty;
    }

    async function initApp() {
      saveCart();
      await Promise.all([fetchCurrentUser(), fetchProducts()]);
    }

    async function fetchCurrentUser() {
      try {
        const data = await api('/api/auth/me');
        state.user = data.user;
      } catch {
        state.user = null;
      }
      renderAuthHeader();
    }

    function renderAuthHeader() {
      const area = document.getElementById('auth-area');
      const ordersBtn = document.getElementById('nav-orders');
      const emailsBtn = document.getElementById('nav-emails');
      const profileBtn = document.getElementById('nav-profile');
      const adminBtn = document.getElementById('nav-admin');

      if (state.user) {
        ordersBtn.style.display = 'inline-flex';
        emailsBtn.style.display = 'inline-flex';
        profileBtn.style.display = 'inline-flex';
        adminBtn.style.display = state.user.role === 'ADMIN' ? 'inline-flex' : 'none';
        area.innerHTML = \`
          <div class="user-pill">
            <span class="role-badge role-\${state.user.role}">\${state.user.role === 'ADMIN' ? 'YÖNETİCİ' : 'ÜYE'}</span>
            <strong>\${escapeHtml(state.user.fullName)}</strong>
            <button class="btn btn-sm btn-outline" style="color:#fff;border-color:rgba(255,255,255,0.25);padding:3px 8px;" onclick="logout()">Çıkış Yap</button>
          </div>
        \`;
      } else {
        ordersBtn.style.display = 'none';
        emailsBtn.style.display = 'none';
        profileBtn.style.display = 'none';
        adminBtn.style.display = 'none';
        area.innerHTML = \`
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-outline" style="color:#fff;border-color:rgba(255,255,255,0.35);" onclick="openAuthModal('login')">🔑 Giriş Yap</button>
            <button class="btn btn-sm btn-primary" onclick="openAuthModal('register')">✨ Üye Ol</button>
          </div>
        \`;
      }
    }

    async function logout() {
      await api('/api/auth/logout', { method: 'POST' });
      state.user = null;
      renderAuthHeader();
      showToast('Oturumunuz kapatıldı.');
      switchView('store');
    }

    function openAuthModal(mode = 'login') {
      toggleAuthMode(mode);
      document.getElementById('modal-auth').classList.add('open');
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('open');
    }

    function toggleAuthMode(mode) {
      state.authMode = mode;
      const isReg = mode === 'register';
      document.getElementById('auth-modal-title').textContent = isReg ? 'Yeni Üyelik Oluştur' : 'Üye / Yönetici Girişi';
      document.getElementById('register-extra-fields').style.display = isReg ? 'block' : 'none';
      document.getElementById('auth-submit-btn').textContent = isReg ? 'Üye Ol ve Giriş Yap' : 'Giriş Yap';
      document.getElementById('tab-login-btn').className = isReg ? 'btn btn-sm btn-outline' : 'btn btn-sm btn-primary';
      document.getElementById('tab-register-btn').className = isReg ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
    }

    async function submitAuthForm(e) {
      e.preventDefault();
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;
      const wasRegister = state.authMode === 'register';
      try {
        if (wasRegister) {
          const fullName = document.getElementById('auth-fullname').value;
          const phone = document.getElementById('auth-phone').value;
          const res = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ fullName, email, password, phone, address: 'Adres Seçilmedi' })
          });
          state.user = res.user;
          showToast('Üyeliğiniz oluşturuldu! Lütfen İl, İlçe ve Mahalle bilgilerinizi seçip kaydedin.', 'success');
        } else {
          const res = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
          });
          state.user = res.user;
          showToast('Hoş geldiniz, ' + res.user.fullName + '!', 'success');
        }
        closeModal('modal-auth');
        renderAuthHeader();
        if (state.user && state.user.role === 'ADMIN') {
          await switchView('admin');
        } else if (wasRegister) {
          await switchView('profile');
        } else {
          await switchView('store');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function fetchProducts() {
      const data = await api('/api/products');
      state.products = data.products;
      renderCategories();
      renderStorefront();
    }

    function renderCategories() {
      const cats = ['Tümü', ...new Set(state.products.map(p => p.category))];
      const wrap = document.getElementById('category-pills');
      wrap.innerHTML = cats.map(c => \`
        <button class="cat-pill \${state.selectedCategory === c ? 'active' : ''}" onclick="selectCategory('\${escapeHtml(c)}')">\${escapeHtml(c)}</button>
      \`).join('');
    }

    function selectCategory(c) {
      state.selectedCategory = c;
      renderCategories();
      renderStorefront();
    }

    function renderStorefront() {
      const q = (document.getElementById('search-box').value || '').toLowerCase().trim();
      const filtered = state.products.filter(p => {
        if (state.selectedCategory !== 'Tümü' && p.category !== state.selectedCategory) return false;
        if (q && !(p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))) return false;
        return true;
      });

      const grid = document.getElementById('product-grid');
      if (filtered.length === 0) {
        grid.innerHTML = '<div class="panel-card" style="grid-column:1/-1;text-align:center;padding:40px;">Aradığınız kriterlere uygun yemek/ürün bulunamadı.</div>';
        return;
      }

      grid.innerHTML = filtered.map(p => {
        const stockClass = p.dailyStock === 0 ? 'stock-out' : (p.dailyStock <= 5 ? 'stock-low' : 'stock-ok');
        const stockText = p.dailyStock === 0 ? 'Bugün Tükendi' : (p.dailyStock <= 5 ? \`Son \${p.dailyStock} Porsiyon!\` : \`Günlük Stok: \${p.dailyStock}\`);
        const allergensHtml = (p.allergens || []).map(a => \`<span class="allergen-chip">⚠️ \${escapeHtml(a)}</span>\`).join('');

        return \`
          <article class="product-card">
            <div class="product-img-wrap" onclick="openProductDetail('\${p.id}')" style="cursor:pointer;">
              <img src="\${escapeHtml(p.imageUrl)}" alt="\${escapeHtml(p.name)}" />
              <span class="cat-tag">\${escapeHtml(p.category)}</span>
              <span class="stock-pill \${stockClass}">\${stockText}</span>
            </div>
            <div class="product-body">
              <div class="product-title" onclick="openProductDetail('\${p.id}')" style="cursor:pointer;">\${escapeHtml(p.name)}</div>
              <div class="product-meta">
                <span>⚖️ \${escapeHtml(p.portionInfo)}</span>
                <span>⏱️ \${p.prepTimeMinutes} dk</span>
              </div>
              <p class="product-desc">\${escapeHtml(p.description)}</p>
              <div class="allergen-list">\${allergensHtml}</div>
            </div>
            <div class="product-footer">
              <div class="price-tag">\${p.priceFormatted}</div>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-sm btn-outline" onclick="openProductDetail('\${p.id}')">Detay</button>
                <button class="btn btn-sm btn-primary" \${p.dailyStock <= 0 ? 'disabled' : ''} onclick="addToCart('\${p.id}', 1)">
                  \${p.dailyStock <= 0 ? 'Tükendi' : '➕ Sepete Ekle'}
                </button>
              </div>
            </div>
          </article>
        \`;
      }).join('');
    }

    function openProductDetail(productId) {
      const p = state.products.find(x => x.id === productId);
      if (!p) return;
      const allergensHtml = (p.allergens && p.allergens.length > 0)
        ? p.allergens.map(a => \`<span class="allergen-chip">⚠️ \${escapeHtml(a)}</span>\`).join(' ')
        : '<span style="font-size:12px;color:var(--accent);">Bilinen alerjen içermez</span>';

      document.getElementById('modal-product-detail-content').innerHTML = \`
        <div class="modal-header">
          <h3 style="font-size:20px;font-weight:800;">\${escapeHtml(p.name)}</h3>
          <button class="btn btn-sm btn-outline" onclick="closeModal('modal-product-detail')">✕</button>
        </div>
        <div style="border-radius:12px;overflow:hidden;height:240px;margin-bottom:16px;">
          <img src="\${escapeHtml(p.imageUrl)}" style="width:100%;height:100%;object-fit:cover;" />
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <span class="status-badge status-PAID">\${escapeHtml(p.category)}</span>
          <span style="font-size:24px;font-weight:900;color:var(--primary);">\${p.priceFormatted}</span>
        </div>
        <p style="font-size:14.5px;line-height:1.65;margin-bottom:16px;color:var(--text);">\${escapeHtml(p.description)}</p>
        <div style="background:var(--surface-alt);padding:14px;border-radius:10px;font-size:13.5px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div><strong>⚖️ Porsiyon / Gramaj:</strong> \${escapeHtml(p.portionInfo)}</div>
          <div><strong>⏱️ Hazırlanma Süresi:</strong> \${p.prepTimeMinutes} Dakika</div>
          <div><strong>🍲 Günlük Kalan Stok:</strong> \${p.dailyStock} Porsiyon</div>
          <div><strong>🛡️ Alerjen Bilgisi:</strong> \${allergensHtml}</div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button class="btn btn-outline" onclick="closeModal('modal-product-detail')">Kapat</button>
          <button class="btn btn-primary" \${p.dailyStock <= 0 ? 'disabled' : ''} onclick="addToCart('\${p.id}', 1); closeModal('modal-product-detail');">
            🛒 Sepete Ekle (\${p.priceFormatted})
          </button>
        </div>
      \`;
      document.getElementById('modal-product-detail').classList.add('open');
    }

    function addToCart(productId, delta) {
      const p = state.products.find(x => x.id === productId);
      if (!p && delta > 0) return;
      const existing = state.cart.find(i => i.productId === productId);
      if (existing) {
        const nextQty = existing.quantity + delta;
        if (nextQty <= 0) {
          state.cart = state.cart.filter(i => i.productId !== productId);
        } else if (p && nextQty > p.dailyStock) {
          showToast(\`Bu üründen günlük stokta en fazla \${p.dailyStock} adet bulunmaktadır.\`, 'error');
          return;
        } else {
          existing.quantity = nextQty;
        }
      } else if (delta > 0) {
        if (p.dailyStock < delta) {
          showToast('Stok yetersiz.', 'error');
          return;
        }
        state.cart.push({ productId, quantity: delta });
      }
      saveCart();
      if (delta > 0 && p) {
        showToast(\`"\${p.name}" sepete eklendi.\`, 'success');
      }
      if (document.getElementById('modal-cart').classList.contains('open')) {
        renderCartModal();
      }
    }

    async function openCartModal() {
      document.getElementById('modal-cart').classList.add('open');
      await renderCartModal();
    }

    async function renderCartModal() {
      const body = document.getElementById('cart-modal-body');
      if (state.cart.length === 0) {
        body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);">Sepetinizde henüz ürün bulunmuyor.</div>';
        return;
      }

      let totalKurus = 0;
      const rowsHtml = state.cart.map(item => {
        const p = state.products.find(x => x.id === item.productId);
        if (!p) return '';
        const lineKurus = p.priceKurus * item.quantity;
        totalKurus += lineKurus;
        return \`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);gap:10px;">
            <div style="flex:1;">
              <div style="font-weight:700;">\${escapeHtml(p.name)}</div>
              <div style="font-size:12px;color:var(--text-muted);">\${escapeHtml(p.portionInfo)} • Birim: \${p.priceFormatted}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button class="btn btn-sm btn-outline" onclick="addToCart('\${p.id}', -1)">−</button>
              <strong style="min-width:24px;text-align:center;">\${item.quantity}</strong>
              <button class="btn btn-sm btn-outline" onclick="addToCart('\${p.id}', 1)">+</button>
            </div>
            <div style="font-weight:800;min-width:90px;text-align:right;">\${formatKurus(lineKurus)}</div>
          </div>
        \`;
      }).join('');

      const defaultAddress = state.user ? (state.user.address || '') : '';
      body.innerHTML = \`
        <div>\${rowsHtml}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;font-size:19px;font-weight:900;color:var(--primary);">
          <span>Sunucu Doğrulamalı Toplam:</span>
          <span>\${formatKurus(totalKurus)}</span>
        </div>
        \${!state.user ? \`
          <div style="background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:10px;margin-bottom:12px;font-size:13.5px;">
            Siparişi tamamlamak ve üyelik özelliklerinden yararlanmak için lütfen üye girişi yapın veya yeni bir hesap oluşturun.
            <div style="margin-top:8px;display:flex;gap:8px;">
              <button class="btn btn-sm btn-primary" onclick="closeModal('modal-cart'); openAuthModal('login');">🔑 Giriş Yap</button>
              <button class="btn btn-sm btn-outline" onclick="closeModal('modal-cart'); openAuthModal('register');">✨ Yeni Üyelik Oluştur</button>
            </div>
          </div>
        \` : \`
          <form onsubmit="submitCheckout(event)">
            <div class="form-group">
              <label>Teslimat Adresi *</label>
              <input type="text" id="checkout-address" class="form-control" required value="\${escapeHtml(defaultAddress)}" />
            </div>
            <div class="form-group">
              <label>Sipariş / Teslimat Notu (Opsiyonel)</label>
              <input type="text" id="checkout-note" class="form-control" placeholder="Örn: Paketleme özenli olsun, zile basmayınız vb." />
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;padding:12px;font-size:15px;">
              ✅ Siparişi Onayla ve Satın Al (\${formatKurus(totalKurus)})
            </button>
          </form>
        \`}
      \`;
    }

    async function submitCheckout(e) {
      e.preventDefault();
      const deliveryAddress = document.getElementById('checkout-address').value;
      const customerNote = document.getElementById('checkout-note').value;
      try {
        const res = await api('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            items: state.cart,
            deliveryAddress,
            customerNote,
            idempotencyKey: 'chk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
          })
        });
        state.cart = [];
        saveCart();
        closeModal('modal-cart');
        await fetchProducts();
        showToast(\`Siparişiniz (#\${res.order.orderNumber}) oluşturuldu ve onay e-postası gönderildi!\`, 'success');
        switchView('orders');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function switchView(view) {
      // Yetkisiz görünüm geçişlerini engelle
      if (view === 'admin') {
        if (!state.user || state.user.role !== 'ADMIN') {
          showToast('Yönetici paneline yalnızca yönetici hesabıyla giriş yapıldığında erişilebilir.', 'error');
          openAuthModal('login');
          return;
        }
      }
      if (['orders', 'emails', 'profile'].includes(view) && !state.user) {
        showToast('Üyelik özelliklerine erişmek için lütfen giriş yapın.', 'info');
        openAuthModal('login');
        return;
      }

      state.currentView = view;
      ['store', 'orders', 'emails', 'profile', 'admin'].forEach(v => {
        const el = document.getElementById('view-' + v);
        if (el) el.style.display = v === view ? 'block' : 'none';
        const btn = document.getElementById('nav-' + v);
        if (btn) btn.classList.toggle('active', v === view);
      });
      document.getElementById('hero-banner').style.display = view === 'store' ? 'block' : 'none';

      if (view === 'store') await fetchProducts();
      if (view === 'orders') await loadMyOrders();
      if (view === 'emails') await loadEmailsView();
      if (view === 'profile') await loadProfileView();
      if (view === 'admin') await loadAdminAll();
    }

    let turkeyLocationsMap = null;
    const provinceNeighborhoodCache = {};

    const DEFAULT_FALLBACK_NEIGHBORHOODS = [
      'Merkez Mah.', 'Cumhuriyet Mah.', 'Atatürk Mah.', 'Fatih Mah.', 'Yeni Mah.',
      'Bahçelievler Mah.', 'Zafer Mah.', 'Hürriyet Mah.', 'İstiklal Mah.', 'Kurtuluş Mah.',
      'Yunus Emre Mah.', 'Mimar Sinan Mah.', 'Gazi Mah.', 'Yeşiltepe Mah.', 'Çamlık Mah.',
      'Kültür Mah.', 'Esentepe Mah.', 'Aydınlıkevler Mah.', 'Gültepe Mah.', 'Yıldız Mah.'
    ];

    async function ensureTurkeyLocationsLoaded() {
      if (turkeyLocationsMap) return turkeyLocationsMap;
      try {
        const res = await api('/api/locations');
        turkeyLocationsMap = res.locations || {};
      } catch {
        turkeyLocationsMap = {};
      }
      const provSelect = document.getElementById('addr-province');
      if (provSelect) {
        const provinces = Object.keys(turkeyLocationsMap).sort((a, b) => a.localeCompare(b, 'tr'));
        provSelect.innerHTML = '<option value="">-- İl Seçiniz (81 İl) --</option>' +
          provinces.map(p => \`<option value="\${escapeHtml(p)}">\${escapeHtml(p)}</option>\`).join('');
      }
      return turkeyLocationsMap;
    }

    async function onProvinceChange(targetDistrict = null, targetNeighborhood = null) {
      await ensureTurkeyLocationsLoaded();
      const prov = document.getElementById('addr-province').value;
      const distSelect = document.getElementById('addr-district');
      const neighSelect = document.getElementById('addr-neighborhood');
      const customWrap = document.getElementById('custom-neighborhood-wrap');
      const badge = document.getElementById('neighborhood-status-badge');

      customWrap.style.display = 'none';
      if (!prov || !turkeyLocationsMap[prov]) {
        distSelect.innerHTML = '<option value="">-- Önce İl Seçiniz --</option>';
        distSelect.disabled = true;
        neighSelect.innerHTML = '<option value="">-- Önce İlçe Seçiniz --</option>';
        neighSelect.disabled = true;
        updateCombinedAddressPreview();
        return;
      }

      const districts = [...turkeyLocationsMap[prov]].map(d => d.trim()).sort((a, b) => a.localeCompare(b, 'tr'));
      distSelect.innerHTML = '<option value="">-- İlçe Seçiniz (' + districts.length + ' İlçe) --</option>' +
        districts.map(d => \`<option value="\${escapeHtml(d)}">\${escapeHtml(d)}</option>\`).join('');
      distSelect.disabled = false;

      neighSelect.innerHTML = '<option value="">-- Önce İlçe Seçiniz --</option>';
      neighSelect.disabled = true;
      badge.textContent = prov + ' ili seçildi (' + districts.length + ' ilçe)';

      if (targetDistrict && districts.includes(targetDistrict)) {
        distSelect.value = targetDistrict;
        await onDistrictChange(targetNeighborhood);
      } else {
        updateCombinedAddressPreview();
      }
    }

    async function onDistrictChange(targetNeighborhood = null) {
      const prov = document.getElementById('addr-province').value;
      const dist = document.getElementById('addr-district').value;
      const neighSelect = document.getElementById('addr-neighborhood');
      const customWrap = document.getElementById('custom-neighborhood-wrap');
      const badge = document.getElementById('neighborhood-status-badge');

      customWrap.style.display = 'none';
      if (!prov || !dist) {
        neighSelect.innerHTML = '<option value="">-- Önce İlçe Seçiniz --</option>';
        neighSelect.disabled = true;
        updateCombinedAddressPreview();
        return;
      }

      neighSelect.innerHTML = '<option value="">⏳ Mahalleler yükleniyor...</option>';
      neighSelect.disabled = true;
      badge.textContent = dist + ' mahalleleri yükleniyor...';

      let neighborhoods = [];
      try {
        if (!provinceNeighborhoodCache[prov]) {
          const res = await fetch('https://turkiyeapi.dev/api/v1/provinces?name=' + encodeURIComponent(prov));
          if (res.ok) {
            const json = await res.json();
            if (json && Array.isArray(json.data) && json.data.length > 0) {
              provinceNeighborhoodCache[prov] = json.data[0].districts || [];
            }
          }
        }
        const provDistricts = provinceNeighborhoodCache[prov] || [];
        const matchedDist = provDistricts.find(
          d => d.name && d.name.toLocaleLowerCase('tr') === dist.toLocaleLowerCase('tr')
        );
        if (matchedDist && Array.isArray(matchedDist.neighborhoods)) {
          neighborhoods = matchedDist.neighborhoods.map(n => {
            const name = String(n.name || '').trim();
            return name.endsWith('Mah.') || name.endsWith('Mahallesi') || name.endsWith('Köyü')
              ? name
              : (name + ' Mah.');
          });
        }
      } catch {
        // Çevrimdışı veya API erişilemez ise varsayılan mahalle listesini kullan
      }

      if (neighborhoods.length === 0) {
        neighborhoods = [...DEFAULT_FALLBACK_NEIGHBORHOODS];
      }

      neighborhoods.sort((a, b) => a.localeCompare(b, 'tr'));

      neighSelect.innerHTML =
        '<option value="">-- Mahalle / Köy Seçiniz (' + neighborhoods.length + ' Mahalle) --</option>' +
        neighborhoods.map(n => \`<option value="\${escapeHtml(n)}">\${escapeHtml(n)}</option>\`).join('') +
        '<option value="__CUSTOM__">✍️ Listede Yok / Mahalle Adını Elle Yaz</option>';
      neighSelect.disabled = false;
      badge.textContent = \`✅ \${dist} (\${neighborhoods.length} Mahalle Hazır)\`;

      if (targetNeighborhood) {
        if (neighborhoods.includes(targetNeighborhood)) {
          neighSelect.value = targetNeighborhood;
        } else {
          neighSelect.value = '__CUSTOM__';
          customWrap.style.display = 'flex';
          document.getElementById('addr-neighborhood-custom').value = targetNeighborhood;
        }
      }
      updateCombinedAddressPreview();
    }

    function onNeighborhoodChange() {
      const val = document.getElementById('addr-neighborhood').value;
      const customWrap = document.getElementById('custom-neighborhood-wrap');
      if (val === '__CUSTOM__') {
        customWrap.style.display = 'flex';
        document.getElementById('addr-neighborhood-custom').focus();
      } else {
        customWrap.style.display = 'none';
      }
      updateCombinedAddressPreview();
    }

    function updateCombinedAddressPreview() {
      const title = document.getElementById('addr-title').value || 'Ev Adresi';
      const prov = document.getElementById('addr-province').value;
      const dist = document.getElementById('addr-district').value;
      const neighSel = document.getElementById('addr-neighborhood').value;
      const neighCustom = document.getElementById('addr-neighborhood-custom').value.trim();
      const neigh = neighSel === '__CUSTOM__' ? neighCustom : neighSel;
      const detail = document.getElementById('addr-detail').value.trim();

      const previewEl = document.getElementById('combined-address-preview');
      const hiddenInput = document.getElementById('prof-address');

      if (!prov && !dist && !detail) {
        previewEl.textContent = 'Lütfen yukarıdan İl, İlçe, Mahalle seçin ve adres açıklamanızı yazın.';
        hiddenInput.value = '';
        return;
      }

      const formatted = \`[\${title}] \${neigh ? (neigh + ', ') : ''}\${detail ? detail : '(Açık adres detayı girilmedi)'} — \${dist || '?'} / \${prov || '?'}\`;
      previewEl.textContent = formatted;
      hiddenInput.value = formatted;
    }

    async function loadProfileView() {
      if (!state.user) return;
      document.getElementById('prof-email').value = state.user.email || '';
      document.getElementById('prof-fullname').value = state.user.fullName || '';
      document.getElementById('prof-phone').value = state.user.phone || '';
      document.getElementById('prof-password').value = '';

      await ensureTurkeyLocationsLoaded();
      const rawAddr = state.user.address || '';

      // Kayıtlı adresi "[Başlık] Mahalle, Detay — İlçe / İl" formatından ayrıştır
      const structuredMatch = rawAddr.match(/^\\[([^\\]]+)\\]\\s*(?:([^,]+),\\s*)?(.+?)\\s*—\\s*([^/]+?)\\s*\\/\\s*(.+)$/);
      if (structuredMatch) {
        const [, savedTitle, savedNeigh, savedDetail, savedDist, savedProv] = structuredMatch;
        const titleSel = document.getElementById('addr-title');
        if (titleSel) titleSel.value = savedTitle.trim();
        document.getElementById('addr-detail').value = savedDetail.trim();
        const provSel = document.getElementById('addr-province');
        if (provSel && turkeyLocationsMap[savedProv.trim()]) {
          provSel.value = savedProv.trim();
          await onProvinceChange(savedDist.trim(), savedNeigh ? savedNeigh.trim() : null);
        }
      } else if (rawAddr && rawAddr !== 'Adres Seçilmedi') {
        document.getElementById('addr-detail').value = rawAddr;
        updateCombinedAddressPreview();
      } else {
        document.getElementById('addr-detail').value = '';
        updateCombinedAddressPreview();
      }
    }

    async function submitProfileForm(e) {
      e.preventDefault();
      const prov = document.getElementById('addr-province').value;
      const dist = document.getElementById('addr-district').value;
      const neighSel = document.getElementById('addr-neighborhood').value;
      const neighCustom = document.getElementById('addr-neighborhood-custom').value.trim();
      const neigh = neighSel === '__CUSTOM__' ? neighCustom : neighSel;
      const detail = document.getElementById('addr-detail').value.trim();

      if (!prov || !dist || !neigh || !detail) {
        showToast('Lütfen İl, İlçe, Mahalle seçiminizi yapın ve açık adres açıklamasını girin.', 'error');
        return;
      }

      updateCombinedAddressPreview();
      const fullAddress = document.getElementById('prof-address').value;

      try {
        const payload = {
          fullName: document.getElementById('prof-fullname').value,
          phone: document.getElementById('prof-phone').value,
          address: fullAddress,
          newPassword: document.getElementById('prof-password').value || undefined
        };
        const res = await api('/api/auth/profile', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        state.user = res.user;
        document.getElementById('prof-password').value = '';
        renderAuthHeader();
        showToast('Türkiye İl/İlçe/Mahalle teslimat adresiniz ve üyelik bilgileriniz kaydedildi!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function loadMyOrders() {
      const wrap = document.getElementById('my-orders-container');
      if (!state.user) {
        wrap.innerHTML = '<div style="padding:24px;text-align:center;">Siparişlerinizi görmek için lütfen giriş yapın.</div>';
        return;
      }
      try {
        const data = await api('/api/orders/my');
        state.myOrders = data.orders;
        if (state.myOrders.length === 0) {
          wrap.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Henüz bir siparişiniz bulunmuyor.</div>';
          return;
        }
        wrap.innerHTML = state.myOrders.map(o => renderOrderCardHtml(o, false)).join('');
      } catch (err) {
        wrap.innerHTML = \`<div style="color:var(--danger);">\${escapeHtml(err.message)}</div>\`;
      }
    }

    function renderOrderCardHtml(o, isAdminView) {
      const itemsHtml = o.items.map(i => \`
        <tr>
          <td><strong>\${escapeHtml(i.productNameSnapshot)}</strong> <span style="color:var(--text-muted);font-size:12px;">(\${escapeHtml(i.portionInfoSnapshot)})</span></td>
          <td>\${i.quantity} Adet</td>
          <td>\${i.unitPriceFormatted} <span style="font-size:10px;color:var(--text-muted);">(Dondurulmuş Fiyat)</span></td>
          <td style="font-weight:700;">\${i.lineTotalFormatted}</td>
        </tr>
      \`).join('');

      let actionsHtml = '';
      if (!isAdminView) {
        if (o.status !== 'REFUNDED') {
          actionsHtml += \`
            <button class="btn btn-sm btn-danger" onclick="triggerRefund('\${o.id}', 'EXECUTE')">↩️ Siparişi İade Et (Tam İade & E-Posta)</button>
          \`;
          if (o.status !== 'REFUND_REQUESTED') {
            actionsHtml += \`
              <button class="btn btn-sm btn-outline" onclick="triggerRefund('\${o.id}', 'REQUEST')">📝 İade Talebi Oluştur</button>
            \`;
          }
        }
      } else {
        if (o.status === 'PAID') {
          actionsHtml += \`<button class="btn btn-sm btn-primary" onclick="adminChangeOrderStatus('\${o.id}', 'PREPARING')">👨‍🍳 Hazırlanıyor Yap</button>\`;
        }
        if (o.status === 'PREPARING') {
          actionsHtml += \`<button class="btn btn-sm btn-success" onclick="adminChangeOrderStatus('\${o.id}', 'DELIVERED')">🛵 Teslim Edildi Yap</button>\`;
        }
        if (o.status !== 'REFUNDED') {
          actionsHtml += \`<button class="btn btn-sm btn-danger" onclick="adminChangeOrderStatus('\${o.id}', 'REFUNDED')">💸 İadeyi Onayla / İade Et</button>\`;
        }
      }

      return \`
        <div style="border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;background:#fff;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);">
            <div>
              <span style="font-size:16px;font-weight:900;">#\${escapeHtml(o.orderNumber)}</span>
              <span style="font-size:12.5px;color:var(--text-muted);margin-left:8px;">\${escapeHtml(o.createdAt)}</span>
              <div style="font-size:12.5px;color:var(--text-muted);">👤 \${escapeHtml(o.customerNameSnapshot)} (\${escapeHtml(o.customerEmailSnapshot)}) • 📍 \${escapeHtml(o.deliveryAddress)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="status-badge status-\${o.status}">\${escapeHtml(o.statusLabel)}</span>
              <span style="font-size:18px;font-weight:900;color:var(--primary);">\${o.totalAmountFormatted}</span>
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Ürün (Snapshot)</th><th>Adet</th><th>Birim Fiyat</th><th>Toplam</th></tr>
            </thead>
            <tbody>\${itemsHtml}</tbody>
          </table>
          \${o.status === 'REFUNDED' || o.status === 'REFUND_REQUESTED' ? \`
            <div style="margin-top:10px;background:#fef2f2;border:1px solid #fecaca;padding:10px 12px;border-radius:8px;font-size:13px;color:#991b1b;">
              <strong>İade Bilgisi:</strong> Durum: \${escapeHtml(o.statusLabel)} | İade Tutarı: <strong>\${o.refund ? o.refund.amountFormatted : o.totalAmountFormatted}</strong> | Neden: \${escapeHtml(o.refundReason || '-')}
              \${o.refund ? \` | Stok Geri Yüklendi: \${o.refund.stockRestored ? 'Evet' : 'Hayır'}\` : ''}
            </div>
          \` : ''}
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap;">
            \${actionsHtml}
          </div>
        </div>
      \`;
    }

    async function triggerRefund(orderId, mode) {
      const defaultReason = mode === 'REQUEST' ? 'Teslimat saatinde evde olamayacağım için iade talep ediyorum.' : 'Müşteri talebiyle sipariş iptali ve ücret iadesi.';
      const reason = prompt('Lütfen iade nedeninizi belirtiniz:', defaultReason);
      if (reason === null) return;
      try {
        const res = await api(\`/api/orders/\${orderId}/refund\`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason || defaultReason, mode })
        });
        showToast(\`Sipariş (#\${res.order.orderNumber}) için iade işlemi tamamlandı ve e-posta bildirimi gönderildi!\`, 'success');
        await loadMyOrders();
        await fetchProducts();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function loadEmailsView() {
      const wrap = document.getElementById('emails-list-container');
      if (!state.user) {
        wrap.innerHTML = '<div style="padding:24px;text-align:center;">Gönderilen e-postaları incelemek için lütfen giriş yapın.</div>';
        return;
      }
      try {
        const data = await api('/api/emails');
        state.emails = data.emails;
        renderEmailsTable(wrap, state.emails);
      } catch (err) {
        wrap.innerHTML = \`<div style="color:var(--danger);">\${escapeHtml(err.message)}</div>\`;
      }
    }

    function renderEmailsTable(container, emails) {
      if (!emails || emails.length === 0) {
        container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Henüz gönderilmiş bir e-posta kaydı yok.</div>';
        return;
      }
      container.innerHTML = \`
        <table>
          <thead>
            <tr>
              <th>Zaman</th>
              <th>Olay Tipi</th>
              <th>Alıcı</th>
              <th>Konu (Subject)</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            \${emails.map(e => \`
              <tr>
                <td style="font-size:12px;">\${escapeHtml(e.sentAt || e.createdAt)}</td>
                <td><span class="status-badge \${e.eventType === 'ORDER_PURCHASED' ? 'status-PAID' : 'status-REFUNDED'}">\${escapeHtml(e.eventType)}</span></td>
                <td><strong>\${escapeHtml(e.recipientEmail)}</strong> <span style="font-size:11px;color:var(--text-muted);">(\${e.recipientRole})</span></td>
                <td>\${escapeHtml(e.subject)}</td>
                <td><span class="status-badge status-DELIVERED">\${escapeHtml(e.status)}</span></td>
                <td><button class="btn btn-sm btn-outline" onclick="previewEmail('\${e.id}')">👁️ HTML E-Postayı Aç</button></td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;
    }

    function previewEmail(emailId) {
      const e = state.emails.find(x => x.id === emailId);
      if (!e) return;
      document.getElementById('email-preview-title').textContent = e.subject;
      document.getElementById('email-preview-meta').innerHTML = \`
        <div><strong>Alıcı:</strong> \${escapeHtml(e.recipientEmail)} (\${e.recipientRole}) | <strong>Durum:</strong> \${escapeHtml(e.status)}</div>
        <div><strong>Message-ID:</strong> \${escapeHtml(e.messageId || '-')} | <strong>Gönderim Zamanı:</strong> \${escapeHtml(e.sentAt || e.createdAt)}</div>
      \`;
      const frame = document.getElementById('email-preview-frame');
      frame.srcdoc = e.htmlBody;
      document.getElementById('modal-email-preview').classList.add('open');
    }

    /* ADMIN FUNCTIONS */
    async function loadAdminAll() {
      if (!state.user || state.user.role !== 'ADMIN') {
        showToast('Yönetici paneline erişmek için Yönetici hesabı ile giriş yapmalısınız.', 'error');
        return;
      }
      const [statsRes, prdRes, ordRes, emlRes, audRes] = await Promise.all([
        api('/api/admin/stats'),
        api('/api/admin/products'),
        api('/api/admin/orders'),
        api('/api/emails'),
        api('/api/admin/audit-logs')
      ]);

      state.adminProducts = prdRes.products;
      state.adminOrders = ordRes.orders;
      state.emails = emlRes.emails;
      state.auditLogs = audRes.logs;

      const s = statsRes.stats;
      document.getElementById('admin-stats-grid').innerHTML = \`
        <div class="stat-card"><div class="stat-label">Toplam Net Ciro</div><div class="stat-value" style="color:var(--accent);">\${s.netRevenueFormatted}</div></div>
        <div class="stat-card"><div class="stat-label">Toplam Sipariş</div><div class="stat-value">\${s.totalOrders}</div></div>
        <div class="stat-card"><div class="stat-label">İade Edilen Sipariş / Tutar</div><div class="stat-value" style="color:var(--danger);">\${s.refundedOrdersCount} (\${s.refundedAmountFormatted})</div></div>
        <div class="stat-card"><div class="stat-label">Aktif Ürün / Kritik Stok</div><div class="stat-value">\${s.activeProductsCount} / <span style="color:var(--primary);">\${s.lowStockCount}</span></div></div>
        <div class="stat-card"><div class="stat-label">Gönderilen E-Postalar</div><div class="stat-value">\${s.sentEmailsCount}</div></div>
      \`;

      renderAdminProducts();
      renderAdminOrders();
      renderEmailsTable(document.getElementById('admin-sub-outbox'), state.emails);
      renderAdminAuditLogs();
    }

    function switchAdminSubTab(tab) {
      ['products', 'orders', 'outbox', 'audit'].forEach(t => {
        document.getElementById('admin-sub-' + t).style.display = t === tab ? 'block' : 'none';
        document.getElementById('adm-tab-' + t).classList.toggle('active', t === tab);
      });
    }

    function renderAdminProducts() {
      const wrap = document.getElementById('admin-sub-products');
      wrap.innerHTML = \`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="font-size:17px;font-weight:800;">Menüdeki Tüm Ürünler (Aktif & Arşivlenmiş)</h3>
          <button class="btn btn-sm btn-primary" onclick="openProductModal()">➕ Yeni Ürün Ekle</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Ürün Adı</th>
              <th>Kategori</th>
              <th>Porsiyon</th>
              <th>Fiyat</th>
              <th>Günlük Stok</th>
              <th>Durum</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            \${state.adminProducts.map(p => \`
              <tr style="\${p.isArchived ? 'opacity:0.55;background:#f5f5f4;' : ''}">
                <td><strong>\${escapeHtml(p.name)}</strong></td>
                <td>\${escapeHtml(p.category)}</td>
                <td style="font-size:12px;">\${escapeHtml(p.portionInfo)}</td>
                <td style="font-weight:800;color:var(--primary);">\${p.priceFormatted}</td>
                <td><strong>\${p.dailyStock}</strong> Porsiyon</td>
                <td>
                  <span class="status-badge \${p.isArchived ? 'status-REFUNDED' : 'status-DELIVERED'}">
                    \${p.isArchived ? 'Arşivlendi (Pasif)' : 'Satışta (Aktif)'}
                  </span>
                </td>
                <td style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="btn btn-sm btn-outline" onclick="openProductModal('\${p.id}')">✏️ Düzenle</button>
                  <button class="btn btn-sm btn-outline" onclick="quickAddStock('\${p.id}', \${p.dailyStock + 10})">+10 Stok</button>
                  \${p.isArchived
                    ? \`<button class="btn btn-sm btn-success" onclick="toggleArchiveProduct('\${p.id}', false)">♻️ Geri Yükle</button>\`
                    : \`<button class="btn btn-sm btn-danger" onclick="archiveProduct('\${p.id}')">🗑️ Sil / Arşivle</button>\`
                  }
                </td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;
    }

    function handleImageFileSelect(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        document.getElementById('prd-image').value = reader.result;
        showToast('Görsel seçildi ve forma eklendi.', 'success');
      };
      reader.readAsDataURL(file);
    }

    function openProductModal(productId = null) {
      const p = productId ? state.adminProducts.find(x => x.id === productId) : null;
      document.getElementById('admin-product-modal-title').textContent = p ? ('Ürünü Düzenle: ' + p.name) : 'Yeni Ev Yemeği / Ürün Ekle';
      document.getElementById('prd-id').value = p ? p.id : '';
      document.getElementById('prd-name').value = p ? p.name : '';
      document.getElementById('prd-category').value = p ? p.category : 'Kurutmalıklar & Doğal Meyveler';
      document.getElementById('prd-price-tl').value = p ? (p.priceKurus / 100).toFixed(2).replace('.', ',') : '';
      document.getElementById('prd-stock').value = p ? p.dailyStock : 25;
      document.getElementById('prd-prep').value = p ? p.prepTimeMinutes : 15;
      document.getElementById('prd-portion').value = p ? p.portionInfo : '1 Paket (500g Net)';
      document.getElementById('prd-allergens').value = p ? (p.allergens || []).join(', ') : '';
      document.getElementById('prd-image').value = p ? p.imageUrl : '';
      const fileInput = document.getElementById('prd-image-file');
      if (fileInput) fileInput.value = '';
      document.getElementById('prd-desc').value = p ? p.description : '';
      document.getElementById('prd-featured').checked = p ? p.isFeatured : false;
      document.getElementById('modal-admin-product').classList.add('open');
    }

    async function submitAdminProductForm(e) {
      e.preventDefault();
      const id = document.getElementById('prd-id').value;
      const payload = {
        name: document.getElementById('prd-name').value,
        category: document.getElementById('prd-category').value,
        priceTl: document.getElementById('prd-price-tl').value,
        dailyStock: Number(document.getElementById('prd-stock').value),
        prepTimeMinutes: Number(document.getElementById('prd-prep').value),
        portionInfo: document.getElementById('prd-portion').value,
        allergens: document.getElementById('prd-allergens').value,
        imageUrl: document.getElementById('prd-image').value || undefined,
        description: document.getElementById('prd-desc').value,
        isFeatured: document.getElementById('prd-featured').checked
      };

      try {
        if (id) {
          await api(\`/api/admin/products/\${id}\`, { method: 'PUT', body: JSON.stringify(payload) });
          showToast('Ürün başarıyla güncellendi ve denetim izine (audit log) kaydedildi.', 'success');
        } else {
          await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Yeni ürün başarıyla menüye eklendi!', 'success');
        }
        closeModal('modal-admin-product');
        await loadAdminAll();
        await fetchProducts();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function quickAddStock(id, newStock) {
      try {
        await api(\`/api/admin/products/\${id}\`, {
          method: 'PUT',
          body: JSON.stringify({ dailyStock: newStock })
        });
        showToast('Günlük porsiyon stoğu güncellendi.', 'success');
        await loadAdminAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function archiveProduct(id) {
      try {
        await api(\`/api/admin/products/\${id}\`, { method: 'DELETE' });
        showToast('Ürün vitrinden kaldırıldı (Geçmiş sipariş snapshot verileri korundu).', 'success');
        await loadAdminAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function toggleArchiveProduct(id, isArchived) {
      try {
        await api(\`/api/admin/products/\${id}\`, {
          method: 'PUT',
          body: JSON.stringify({ isArchived, dailyStock: isArchived ? 0 : 15 })
        });
        showToast('Ürün durumu güncellendi.', 'success');
        await loadAdminAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function renderAdminOrders() {
      const wrap = document.getElementById('admin-sub-orders');
      if (state.adminOrders.length === 0) {
        wrap.innerHTML = '<div style="padding:20px;text-align:center;">Henüz sipariş bulunmuyor.</div>';
        return;
      }
      wrap.innerHTML = state.adminOrders.map(o => renderOrderCardHtml(o, true)).join('');
    }

    async function adminChangeOrderStatus(orderId, status) {
      try {
        await api(\`/api/admin/orders/\${orderId}/status\`, {
          method: 'POST',
          body: JSON.stringify({ status, reason: 'Yönetici paneli üzerinden işlem yapıldı.' })
        });
        showToast('Sipariş durumu güncellendi: ' + status, 'success');
        await loadAdminAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function renderAdminAuditLogs() {
      const wrap = document.getElementById('admin-sub-audit');
      if (!state.auditLogs || state.auditLogs.length === 0) {
        wrap.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Henüz denetim kaydı yok.</div>';
        return;
      }
      wrap.innerHTML = \`
        <table>
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Kullanıcı</th>
              <th>İşlem (Action)</th>
              <th>Varlık</th>
              <th>Değişiklik Özeti</th>
            </tr>
          </thead>
          <tbody>
            \${state.auditLogs.map(l => \`
              <tr>
                <td style="font-size:12px;">\${escapeHtml(l.createdAt)}</td>
                <td><strong>\${escapeHtml(l.actorEmail)}</strong> (\${escapeHtml(l.actorRole)})</td>
                <td><span class="status-badge status-PAID">\${escapeHtml(l.action)}</span></td>
                <td>\${escapeHtml(l.entityType)} (\${escapeHtml(l.entityId)})</td>
                <td style="font-size:11.5px;max-width:420px;overflow:hidden;text-overflow:ellipsis;">
                  <code>\${escapeHtml(JSON.stringify(l.newData))}</code>
                </td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;
    }

    initApp();
  </script>
</body>
</html>`;
}
