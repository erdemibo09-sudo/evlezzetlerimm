function escapeServerHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderIndexHtml(initialProducts: Array<Record<string, unknown>> = []): string {
  const categories = [
    "Tümü",
    ...Array.from(new Set(initialProducts.map((p) => String(p.category ?? "")))).filter(Boolean),
  ];
  const ssrCategoriesHtml = categories
    .map(
      (c, idx) =>
        `<button class="cat-pill ${idx === 0 ? "active" : ""}" onclick="selectCategory('${escapeServerHtml(c)}')">${escapeServerHtml(c)}</button>`,
    )
    .join("");

  const ssrProductsHtml = initialProducts
    .map((p, idx) => {
      const dailyStock = Number(p.dailyStock ?? 0);
      const stockClass = dailyStock === 0 ? "stock-out" : dailyStock <= 5 ? "stock-low" : "stock-ok";
      const stockText =
        dailyStock === 0
          ? "Bugün Tükendi"
          : dailyStock <= 5
          ? `Son ${dailyStock} Porsiyon!`
          : `Günlük Stok: ${dailyStock}`;
      const allergens = Array.isArray(p.allergens) ? p.allergens : [];
      const allergensHtml = allergens
        .map((a) => `<span class="allergen-chip">⚠️ ${escapeServerHtml(a)}</span>`)
        .join("");
      const imgPriorityAttr = idx === 0 ? 'fetchpriority="high"' : 'loading="lazy"';
      const pid = escapeServerHtml(p.id);

      return `
          <article class="product-card">
            <div class="product-img-wrap" onclick="openProductDetail('${pid}')" style="cursor:pointer;">
              <img src="${escapeServerHtml(p.imageUrl)}" alt="${escapeServerHtml(p.name)}" width="480" height="320" decoding="async" ${imgPriorityAttr} />
              <span class="cat-tag">${escapeServerHtml(p.category)}</span>
              <span class="stock-pill ${stockClass}">${stockText}</span>
            </div>
            <div class="product-body">
              <div class="product-title" onclick="openProductDetail('${pid}')" style="cursor:pointer;">${escapeServerHtml(p.name)}</div>
              <div class="product-meta">
                <span>⚖️ ${escapeServerHtml(p.portionInfo)}</span>
                <span>⏱️ ${Number(p.prepTimeMinutes ?? 10)} dk</span>
              </div>
              <p class="product-desc">${escapeServerHtml(p.description)}</p>
              <div class="allergen-list">${allergensHtml}</div>
            </div>
            <div class="product-footer">
              <div class="price-tag">${escapeServerHtml(p.priceFormatted)}</div>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-sm btn-outline" onclick="openProductDetail('${pid}')">Detay</button>
                <button class="btn btn-sm btn-primary" ${dailyStock <= 0 ? "disabled" : ""} onclick="addToCart('${pid}', 1)">
                  ${dailyStock <= 0 ? "Tükendi" : "➕ Sepete Ekle"}
                </button>
              </div>
            </div>
          </article>`;
    })
    .join("");

  const firstImageUrl =
    initialProducts.length > 0 && typeof initialProducts[0].imageUrl === "string"
      ? initialProducts[0].imageUrl
      : "/uploads/incir-receli.jpg";

  const serializedInitialProducts = JSON.stringify(initialProducts).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Ev Lezzetlerimm — Katkısız, doğal ev yapımı lezzetler: dalında kurutulmuş Aydın dağ inciri, doğal fermente sele siyah zeytin, cennet hurması kurusu, çıtır incir reçeli ve el yapımı içli köfte sipariş platformu." />
  <title>Ev Lezzetlerimm — Günlük Taze Ev Lezzetleri & Doğal Ürünler</title>
  <link rel="preload" as="image" href="${escapeServerHtml(firstImageUrl)}" fetchpriority="high" />
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

    .ig-header-btn {
      background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
      color: #fff;
      text-decoration: none;
      padding: 7px 13px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 10px rgba(220, 39, 67, 0.35);
      transition: transform 0.15s, opacity 0.15s;
      white-space: nowrap;
    }
    .ig-header-btn:hover {
      transform: translateY(-1px);
      opacity: 0.94;
      color: #fff;
    }
    .ig-hero-badge {
      background: linear-gradient(45deg, rgba(240,148,51,0.28), rgba(220,39,67,0.38), rgba(188,24,136,0.38));
      border: 1px solid rgba(255,255,255,0.4);
      padding: 6px 13px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 700;
      color: #fff;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .ig-hero-badge:hover {
      background: linear-gradient(45deg, #f09433, #dc2743, #bc1888);
    }

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
    .status-SHIPPED { background: #e0e7ff; color: #3730a3; }
    .status-DELIVERED { background: #dcfce7; color: #166534; }
    .status-REFUND_REQUESTED { background: #ffedd5; color: #9a3412; }
    .status-REFUNDED { background: #fee2e2; color: #991b1b; }

    /* Order Stepper */
    .order-stepper {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin: 12px 0;
    }
    .order-step {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--surface-alt);
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
      text-align: center;
    }
    .order-step.done {
      background: #dcfce7;
      border-color: #86efac;
      color: #166534;
    }
    .order-step.active {
      background: #fff7ed;
      border: 2px solid var(--primary);
      color: var(--primary);
      font-weight: 900;
    }
    @media (max-width: 768px) {
      .order-stepper {
        grid-template-columns: 1fr 1fr;
      }
    }

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

    /* Mobile Floating Bottom Cart Bar */
    #mobile-sticky-cart {
      display: none;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 150;
      background: #1c1917;
      color: #fff;
      padding: 12px 16px;
      box-shadow: 0 -6px 24px rgba(0,0,0,0.28);
      border-top: 2px solid #f59e0b;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    html, body {
      overflow-x: hidden;
      max-width: 100vw;
      -webkit-tap-highlight-color: transparent;
    }

    /* =========================================================
       MOBİL & TABLET DUYARLI (RESPONSIVE) OPTİMİZASYONLAR
       ========================================================= */
    @media (max-width: 768px) {
      .header-inner {
        padding: 10px 12px;
        gap: 8px;
      }
      .brand {
        gap: 8px;
      }
      .brand-icon {
        width: 36px;
        height: 36px;
        font-size: 19px;
        border-radius: 10px;
      }
      .brand-title {
        font-size: 16.5px;
      }
      .brand-sub {
        font-size: 10px;
      }
      .header-actions {
        gap: 6px;
      }
      .ig-header-btn {
        padding: 6px 9px;
        font-size: 12px;
      }
      .ig-header-btn .ig-label {
        display: none;
      }
      .cart-trigger {
        padding: 7px 12px;
        font-size: 12.5px;
        gap: 5px;
      }
      .user-pill {
        padding: 4px 8px;
        font-size: 11.5px;
        gap: 5px;
      }
      .user-pill strong {
        max-width: 90px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* Ziyaretçi girişi yapılmadığında tek sekmeli menüyü gizle (56px kompakt başlık) */
      body:not(.logged-in) .nav-tabs {
        display: none;
      }
      body.logged-in .nav-tabs {
        order: 3;
        width: 100%;
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding-top: 4px;
        padding-bottom: 2px;
        gap: 6px;
      }
      .nav-tabs::-webkit-scrollbar {
        display: none;
      }
      .nav-btn {
        flex-shrink: 0;
        white-space: nowrap;
        padding: 7px 12px;
        font-size: 12.5px;
      }
      .hero {
        padding: 16px 14px;
      }
      .hero h1 {
        font-size: 19.5px;
        line-height: 1.25;
        margin-bottom: 6px;
      }
      .hero p {
        font-size: 12.5px;
        line-height: 1.45;
      }
      .hero-badges {
        margin-top: 10px;
        gap: 6px;
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding-bottom: 2px;
      }
      .hero-badges::-webkit-scrollbar {
        display: none;
      }
      .hero-badge {
        flex-shrink: 0;
        white-space: nowrap;
        font-size: 11px;
        padding: 4px 10px;
      }
      main {
        padding: 14px 12px 84px;
      }
      .filter-bar {
        padding: 10px 12px;
        gap: 10px;
        margin-bottom: 14px;
        border-radius: 12px;
      }
      .category-pills {
        width: 100%;
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding-bottom: 2px;
        gap: 6px;
      }
      .category-pills::-webkit-scrollbar {
        display: none;
      }
      .cat-pill {
        flex-shrink: 0;
        white-space: nowrap;
        padding: 8px 13px;
        font-size: 12.5px;
      }
      /* 16px font iOS Safari'de otomatik yakınlaştırmayı (auto-zoom) önler */
      .search-input {
        width: 100%;
        min-width: 0;
        font-size: 16px;
        padding: 10px 14px;
      }
      .product-grid {
        grid-template-columns: 1fr;
        gap: 14px;
      }
      .product-img-wrap {
        height: 185px;
      }
      .product-body {
        padding: 14px;
        gap: 6px;
      }
      .product-title {
        font-size: 16px;
      }
      .product-footer {
        padding: 10px 14px 14px;
        flex-wrap: wrap;
      }
      .product-footer .btn {
        min-height: 40px;
        padding: 8px 13px;
        font-size: 13px;
      }
      .panel-card {
        padding: 14px 12px;
        border-radius: 12px;
      }
      .stats-grid {
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 16px;
      }
      .stat-card {
        padding: 12px;
      }
      .stat-value {
        font-size: 18px;
      }
      /* Tüm formları mobilde tek sütun ve dokunmatik uyumlu (44px / 16px) yap */
      .form-grid {
        grid-template-columns: 1fr !important;
        gap: 10px;
      }
      .form-control {
        font-size: 16px;
        min-height: 44px;
        padding: 10px 12px;
      }
      /* Tabloları mobilde yatay kaydırılabilir yap */
      table {
        display: block;
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        white-space: nowrap;
        font-size: 12.5px;
      }
      th, td {
        padding: 8px 10px;
      }
      /* Modalları mobilde alt çekmece (Bottom Sheet) görünümüne kavuştur */
      .modal-backdrop {
        align-items: flex-end;
        padding: 0;
      }
      .modal-box {
        border-radius: 20px 20px 0 0;
        max-height: 92vh;
        padding: 18px 14px 26px;
        max-width: 100%;
      }
      #toast-container {
        left: 12px;
        right: 12px;
        bottom: 74px;
      }
      .toast {
        max-width: 100%;
        width: 100%;
        font-size: 13px;
      }
      body.has-cart-items #mobile-sticky-cart {
        display: flex;
      }
    }

    @media (max-width: 400px) {
      .brand-sub {
        display: none;
      }
      .stats-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-inner">
      <div class="brand" onclick="switchView('store')">
        <div class="brand-icon">🍲</div>
        <div>
          <span class="brand-title">Ev Lezzetlerimm</span>
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
        <a href="https://www.instagram.com/evlezzetlerimm" target="_blank" rel="noopener noreferrer" class="ig-header-btn" aria-label="Instagram @evlezzetlerimm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
          <span class="ig-label">@evlezzetlerimm</span>
        </a>
        <a href="mailto:evlezzetlerimm@gmail.com" class="btn btn-sm btn-outline" style="color:#fef3c7;border-color:rgba(255,255,255,0.3);border-radius:999px;text-decoration:none;" title="İletişim E-Postası: evlezzetlerimm@gmail.com">
          ✉️ <span class="ig-label">evlezzetlerimm@gmail.com</span>
        </a>
        <div id="auth-area">
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-outline" style="color:#fff;border-color:rgba(255,255,255,0.35);" onclick="openAuthModal('login')">🔑 Giriş Yap</button>
            <button class="btn btn-sm btn-primary" onclick="openAuthModal('register')">✨ Üye Ol</button>
          </div>
        </div>
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
          <a href="https://www.instagram.com/evlezzetlerimm" target="_blank" rel="noopener noreferrer" class="ig-hero-badge">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
            Instagram: @evlezzetlerimm
          </a>
          <a href="mailto:evlezzetlerimm@gmail.com" class="hero-badge" style="text-decoration:none;font-weight:700;border-color:rgba(255,255,255,0.4);">
            ✉️ İletişim: evlezzetlerimm@gmail.com
          </a>
          <span class="hero-badge">✅ %100 Doğal & Katkısız Ev Yapımı</span>
          <span class="hero-badge">🏦 Hızlı IBAN Havale/EFT & Canlı Kargo Takibi</span>
          <span class="hero-badge">✉️ Otomatik Sipariş & Durum E-Posta Bildirimi</span>
        </div>
      </div>
    </div>
  </section>

  <main>
    <!-- VIEW 1: STOREFRONT -->
    <div id="view-store">
      <div class="filter-bar">
        <div class="category-pills" id="category-pills">${ssrCategoriesHtml}</div>
        <input type="search" id="search-box" class="search-input" placeholder="Yemek, malzeme veya kategori ara..." oninput="renderStorefront()" />
      </div>
      <div class="product-grid" id="product-grid">${ssrProductsHtml}</div>
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
        <button class="cat-pill" id="adm-tab-orders" onclick="switchAdminSubTab('orders')">📋 Sipariş, IBAN & Kargo Yönetimi</button>
        <button class="cat-pill" id="adm-tab-settings" onclick="switchAdminSubTab('settings')">🏦 IBAN & Brevo E-Posta Ayarları</button>
        <button class="cat-pill" id="adm-tab-outbox" onclick="switchAdminSubTab('outbox')">📨 E-Posta Outbox Kuyruğu</button>
        <button class="cat-pill" id="adm-tab-audit" onclick="switchAdminSubTab('audit')">🛡️ Denetim İzi (Audit Logs)</button>
      </div>

      <div id="admin-sub-products" class="panel-card"></div>
      <div id="admin-sub-orders" class="panel-card" style="display:none;"></div>
      <div id="admin-sub-settings" class="panel-card" style="display:none;"></div>
      <div id="admin-sub-outbox" class="panel-card" style="display:none;"></div>
      <div id="admin-sub-audit" class="panel-card" style="display:none;"></div>
    </div>
  </main>

  <!-- MODAL: IBAN PAYMENT & CONFIRMATION (POST-CHECKOUT) -->
  <div class="modal-backdrop" id="modal-iban-payment">
    <div class="modal-box" style="max-width:600px;" id="modal-iban-payment-content"></div>
  </div>

  <!-- MODAL: ADMIN CARGO SHIPPING INPUT -->
  <div class="modal-backdrop" id="modal-cargo-ship">
    <div class="modal-box" style="max-width:480px;">
      <div class="modal-header">
        <h3 style="font-size:19px;font-weight:800;">🚚 Siparişi Kargoya Ver</h3>
        <button class="btn btn-sm btn-outline" onclick="closeModal('modal-cargo-ship')">✕</button>
      </div>
      <form onsubmit="submitCargoShipForm(event)">
        <input type="hidden" id="cargo-order-id" />
        <div class="form-group">
          <label>Kargo Firması Seçiniz *</label>
          <select id="cargo-company" class="form-control" required>
            <option value="Yurtiçi Kargo">Yurtiçi Kargo</option>
            <option value="Aras Kargo">Aras Kargo</option>
            <option value="PTT Kargo">PTT Kargo</option>
            <option value="Sürat Kargo">Sürat Kargo</option>
            <option value="MNG / DHL Kargo">MNG / DHL Kargo</option>
            <option value="HepsiJet">HepsiJet</option>
            <option value="Kolay Gelsin">Kolay Gelsin</option>
          </select>
        </div>
        <div class="form-group">
          <label>Kargo Takip Kodu / Gönderi Numarası *</label>
          <input type="text" id="cargo-tracking-code" class="form-control" required placeholder="Örn: 904821736451" />
        </div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;padding:10px 12px;border-radius:8px;font-size:12.5px;color:#1e40af;margin-bottom:14px;">
          📦 Kargoya verildiğinde müşteriye otomatik bilgi gider ve sistem kargo firmasından teslimat durumunu çekerek paket ulaştığında siparişi otomatik olarak <strong>Teslim Edildi</strong> durumuna geçirir.
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" class="btn btn-outline" onclick="closeModal('modal-cargo-ship')">İptal</button>
          <button type="submit" class="btn btn-primary">🚚 Kargoya Verildi Olarak Güncelle</button>
        </div>
      </form>
    </div>
  </div>

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

  <!-- MOBİL SABİT ALT SEPET ÇUBUĞU -->
  <div id="mobile-sticky-cart" onclick="openCartModal()">
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="background:#d97706;color:#fff;width:34px;height:34px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:17px;">🛒</span>
      <div>
        <div id="mobile-cart-summary" style="font-size:13px;font-weight:800;color:#fff;">Sepetiniz (0 Ürün)</div>
        <div id="mobile-cart-total" style="font-size:12px;color:#fcd34d;font-weight:700;">0,00 ₺</div>
      </div>
    </div>
    <button type="button" class="btn btn-primary btn-sm" style="padding:9px 14px;font-size:13px;border-radius:999px;">
      Sepeti Onayla →
    </button>
  </div>

  <script>
    let state = {
      user: null,
      products: ${serializedInitialProducts},
      adminProducts: [],
      selectedCategory: 'Tümü',
      cart: JSON.parse(localStorage.getItem('evyemek_cart') || '[]'),
      myOrders: [],
      adminOrders: [],
      emails: [],
      auditLogs: [],
      storeSettings: {
        contactEmail: 'evlezzetlerimm@gmail.com',
        ibanNumber: 'TR00 0000 0000 0000 0000 0000 00',
        ibanHolderName: 'Ev Lezzetlerimm - Erdem İbo',
        bankName: 'Ziraat Bankası / FAST (7/24)',
        brevoConfigured: false
      },
      adminSettings: null,
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
      document.body.classList.toggle('has-cart-items', totalQty > 0);
      const mobSummary = document.getElementById('mobile-cart-summary');
      const mobTotal = document.getElementById('mobile-cart-total');
      if (mobSummary && mobTotal) {
        let totalKurus = 0;
        for (const item of state.cart) {
          const p = (state.products || []).find(x => x.id === item.productId);
          if (p) totalKurus += p.priceKurus * item.quantity;
        }
        mobSummary.textContent = \`Sepetinizde \${totalQty} ürün var\`;
        mobTotal.textContent = \`Toplam: \${formatKurus(totalKurus)}\`;
      }
    }

    async function fetchStoreSettings() {
      try {
        const data = await api('/api/store-settings');
        if (data && data.settings) {
          state.storeSettings = data.settings;
        }
      } catch {
        // varsayılan ayarları koru
      }
    }

    function copyTextToClipboard(text, label) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast(label + ' panoya kopyalandı: ' + text, 'success');
        }).catch(() => {
          showToast(label + ': ' + text, 'info');
        });
      } else {
        showToast(label + ': ' + text, 'info');
      }
    }

    async function initApp() {
      saveCart();
      renderAdminSettings();
      fetchStoreSettings().then(() => renderAdminSettings());
      if (!state.products || state.products.length === 0) {
        await Promise.all([fetchCurrentUser(), fetchProducts()]);
      } else {
        fetchCurrentUser();
      }
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

      document.body.classList.toggle('logged-in', Boolean(state.user));

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

      grid.innerHTML = filtered.map((p, idx) => {
        const stockClass = p.dailyStock === 0 ? 'stock-out' : (p.dailyStock <= 5 ? 'stock-low' : 'stock-ok');
        const stockText = p.dailyStock === 0 ? 'Bugün Tükendi' : (p.dailyStock <= 5 ? \`Son \${p.dailyStock} Porsiyon!\` : \`Günlük Stok: \${p.dailyStock}\`);
        const allergensHtml = (p.allergens || []).map(a => \`<span class="allergen-chip">⚠️ \${escapeHtml(a)}</span>\`).join('');
        const imgPriority = idx === 0 ? 'fetchpriority="high"' : 'loading="lazy"';

        return \`
          <article class="product-card">
            <div class="product-img-wrap" onclick="openProductDetail('\${p.id}')" style="cursor:pointer;">
              <img src="\${escapeHtml(p.imageUrl)}" alt="\${escapeHtml(p.name)}" width="480" height="320" decoding="async" \${imgPriority} />
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
          <h3 style="font-size:18px;font-weight:800;">\${escapeHtml(p.name)}</h3>
          <button class="btn btn-sm btn-outline" onclick="closeModal('modal-product-detail')">✕</button>
        </div>
        <div style="border-radius:12px;overflow:hidden;height:210px;margin-bottom:14px;">
          <img src="\${escapeHtml(p.imageUrl)}" alt="\${escapeHtml(p.name)}" width="480" height="320" style="width:100%;height:100%;object-fit:cover;" />
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <span class="status-badge status-PAID">\${escapeHtml(p.category)}</span>
          <span style="font-size:22px;font-weight:900;color:var(--primary);">\${p.priceFormatted}</span>
        </div>
        <p style="font-size:14px;line-height:1.6;margin-bottom:14px;color:var(--text);">\${escapeHtml(p.description)}</p>
        <div class="form-grid" style="background:var(--surface-alt);padding:12px;border-radius:10px;font-size:13px;margin-bottom:16px;gap:8px;">
          <div><strong>⚖️ Porsiyon / Gramaj:</strong> \${escapeHtml(p.portionInfo)}</div>
          <div><strong>⏱️ Hazırlanma Süresi:</strong> \${p.prepTimeMinutes} Dakika</div>
          <div><strong>🍲 Günlük Kalan Stok:</strong> \${p.dailyStock} Porsiyon</div>
          <div><strong>🛡️ Alerjen Bilgisi:</strong> \${allergensHtml}</div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-outline" style="flex:1;min-height:42px;" onclick="closeModal('modal-product-detail')">Kapat</button>
          <button class="btn btn-primary" style="flex:2;min-height:42px;" \${p.dailyStock <= 0 ? 'disabled' : ''} onclick="addToCart('\${p.id}', 1); closeModal('modal-product-detail');">
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
            <div style="background:#fff7ed;border:1.5px solid #f59e0b;border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:13px;line-height:1.5;color:#7c2d12;">
              <div>🏦 <strong>IBAN Havale / FAST Ödeme & Sipariş Süreci:</strong></div>
              <div>1️⃣ Sepeti onayladığınızda siparişiniz anında <strong>Sipariş Alındı</strong> olarak kaydedilir, e-posta adresinize gönderilir ve <strong>Siparişlerim</strong> ekranına düşer.</div>
              <div>2️⃣ Hemen ardından açılacak ekranda <strong>Firma IBAN ve Alıcı Ad Soyad</strong> bilgileri yer alır. Ödemeyi yapıp <em>"Parayı Gönderdim"</em> butonuna bastığınızda firmamız kontrol ederek siparişinizi <strong>Sipariş Hazırlanıyor</strong> aşamasına geçirir.</div>
              <div style="color:#b91c1c;font-weight:800;margin-top:4px;">⚠️ Uyarı: 1 gün (24 saat) içinde IBAN'a ödeme yapılmayan siparişler otomatik iptal edilir.</div>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;padding:12px;font-size:15px;">
              ✅ Sepeti Onayla ve Sipariş Oluştur (\${formatKurus(totalKurus)})
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
        showToast(\`Siparişiniz (#\${res.order.orderNumber}) 'Sipariş Alındı' olarak kaydedildi ve e-postanıza gönderildi!\`, 'success');
        await switchView('orders');
        openIbanPaymentModal(res.order.id, res.order);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function openIbanPaymentModal(orderId, orderObj = null) {
      const o = orderObj || (state.myOrders || []).find(x => x.id === orderId) || (state.adminOrders || []).find(x => x.id === orderId);
      if (!o) return;
      const s = state.storeSettings || {};
      const defaultSender = o.paymentSenderName || (state.user ? state.user.fullName : o.customerNameSnapshot) || '';

      const box = document.getElementById('modal-iban-payment-content');
      box.innerHTML = \`
        <div class="modal-header">
          <h3 style="font-size:19px;font-weight:900;color:var(--primary);">🏦 Sipariş Alındı — IBAN Ödeme Bilgileri</h3>
          <button class="btn btn-sm btn-outline" onclick="closeModal('modal-iban-payment')">✕</button>
        </div>

        <div style="background:#ecfdf5;border:1px solid #6ee7b7;padding:12px 14px;border-radius:10px;margin-bottom:14px;font-size:13.5px;color:#065f46;">
          ✅ <strong>Siparişiniz (#\${escapeHtml(o.orderNumber)}) "Sipariş Alındı" olarak oluşturuldu!</strong><br/>
          Sipariş alındı bilginiz e-posta adresinize (<strong>\${escapeHtml(o.customerEmailSnapshot)}</strong>) gönderildi ve <strong>Siparişlerim</strong> sayfasına eklendi.
        </div>

        <div style="background:#fff7ed;border:2px solid #f59e0b;border-radius:12px;padding:16px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
            <span style="font-size:14px;font-weight:900;color:#9a3412;">💳 FİRMA IBAN & ALICI BİLGİLERİ</span>
            <span style="font-size:18px;font-weight:900;color:var(--primary);">Ödenecek Tutar: \${escapeHtml(o.totalAmountFormatted)}</span>
          </div>

          <div style="background:#fff;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div>
              <div style="font-size:11.5px;color:var(--text-muted);font-weight:700;">ALICI AD SOYAD (HESAP SAHİBİ)</div>
              <div style="font-size:15px;font-weight:900;color:var(--text);">\${escapeHtml(s.ibanHolderName || 'Ev Lezzetlerimm')}</div>
            </div>
            <button type="button" class="btn btn-sm btn-outline" onclick="copyTextToClipboard('\${escapeHtml(s.ibanHolderName || 'Ev Lezzetlerimm')}', 'Alıcı Ad Soyad')">📋 Kopyala</button>
          </div>

          <div style="background:#fff;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div>
              <div style="font-size:11.5px;color:var(--text-muted);font-weight:700;">IBAN NUMARASI (\${escapeHtml(s.bankName || 'Banka / FAST')})</div>
              <div style="font-size:15px;font-weight:900;font-family:monospace;color:#7c2d12;letter-spacing:0.4px;">\${escapeHtml(s.ibanNumber || '')}</div>
            </div>
            <button type="button" class="btn btn-sm btn-primary" onclick="copyTextToClipboard('\${escapeHtml(s.ibanNumber || '')}', 'IBAN')">📋 IBAN Kopyala</button>
          </div>

          <div style="background:#fff;border:1px solid #fed7aa;border-radius:8px;padding:8px 12px;font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div><strong>Transfer Açıklaması (Dekont Notu):</strong> <code style="font-weight:900;color:#9a3412;">#\${escapeHtml(o.orderNumber)}</code></div>
            <button type="button" class="btn btn-sm btn-outline" onclick="copyTextToClipboard('#\${escapeHtml(o.orderNumber)}', 'Sipariş No')">📋 Kopyala</button>
          </div>
        </div>

        <div style="background:#eff6ff;border:1px solid #bfdbfe;padding:12px 14px;border-radius:10px;margin-bottom:12px;font-size:13px;color:#1e3a8a;line-height:1.5;">
          ℹ️ <strong>Bilgilendirme:</strong> Ücret IBAN hesabımıza yatırıldıktan ve aşağıdaki <strong>"Parayı Gönderdim / Ödemeyi Yaptım (Onayla)"</strong> butonuna tıkladıktan sonra firmamız ödemeyi kontrol edip siparişinizi <strong>"Sipariş Hazırlanıyor"</strong> aşamasına geçirecektir.
        </div>

        <div style="background:#fef2f2;border:1.5px solid #f87171;padding:12px 14px;border-radius:10px;margin-bottom:16px;font-size:13px;color:#991b1b;font-weight:700;line-height:1.5;">
          ⚠️ ÖNEMLİ UYARI: 1 gün (24 saat) içinde IBAN hesabına para yollamadıysanız siparişiniz otomatik olarak iptal olacaktır!
        </div>

        \${o.paymentNotified ? \`
          <div style="background:#dcfce7;border:1.5px solid #22c55e;padding:14px;border-radius:10px;text-align:center;color:#166534;font-weight:800;margin-bottom:12px;">
            ✅ Ödeme Bildiriminiz Alındı (Gönderen: \${escapeHtml(o.paymentSenderName || defaultSender)})<br/>
            <span style="font-size:12.5px;font-weight:600;">Firmamız IBAN kontrolünü yaptıktan hemen sonra siparişiniz "Sipariş Hazırlanıyor" olarak güncellenecektir.</span>
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <button type="button" class="btn btn-primary" onclick="closeModal('modal-iban-payment')">Tamam, Siparişlerime Git</button>
          </div>
        \` : \`
          <div style="background:var(--surface-alt);border:1px solid var(--border);padding:14px;border-radius:10px;">
            <div class="form-group" style="margin-bottom:10px;">
              <label>Havale / EFT Gönderen Ad Soyad *</label>
              <input type="text" id="iban-sender-name-input" class="form-control" value="\${escapeHtml(defaultSender)}" placeholder="Ödemeyi gönderen hesap sahibinin adı soyadı" />
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-outline" style="flex:1;" onclick="closeModal('modal-iban-payment')">Daha Sonra Göndereceğim</button>
              <button type="button" class="btn btn-success" style="flex:2;padding:12px;font-size:14.5px;" onclick="confirmOrderPayment('\${o.id}', true)">
                💸 Parayı Gönderdim / Ödemeyi Yaptım (Onayla)
              </button>
            </div>
          </div>
        \`}
      \`;
      document.getElementById('modal-iban-payment').classList.add('open');
    }

    async function confirmOrderPayment(orderId, fromModal = false) {
      let senderName = state.user ? state.user.fullName : '';
      const inputEl = document.getElementById('iban-sender-name-input');
      if (fromModal && inputEl && inputEl.value.trim()) {
        senderName = inputEl.value.trim();
      } else if (!fromModal) {
        const prompted = prompt('Havale/FAST işlemini gönderen hesap sahibinin Ad Soyad bilgisini giriniz:', senderName);
        if (prompted === null) return;
        senderName = prompted.trim() || senderName;
      }

      try {
        const res = await api(\`/api/orders/\${orderId}/payment-confirm\`, {
          method: 'POST',
          body: JSON.stringify({ senderName })
        });
        showToast('Ödeme bildiriminiz firmamıza iletildi! Kontrol sonrası siparişiniz hazırlanmaya başlanacaktır.', 'success');
        await loadMyOrders();
        if (fromModal) {
          openIbanPaymentModal(orderId, res.order);
        }
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

      const stageIdx = o.status === 'PAID' ? 0 : (o.status === 'PREPARING' ? 1 : (o.status === 'SHIPPED' ? 2 : (o.status === 'DELIVERED' ? 3 : -1)));
      const stepperHtml = stageIdx >= 0 ? \`
        <div class="order-stepper">
          <div class="order-step \${stageIdx > 0 ? 'done' : (stageIdx === 0 ? 'active' : '')}">1. 📥 Sipariş Alındı</div>
          <div class="order-step \${stageIdx > 1 ? 'done' : (stageIdx === 1 ? 'active' : '')}">2. 👨‍🍳 Sipariş Hazırlanıyor</div>
          <div class="order-step \${stageIdx > 2 ? 'done' : (stageIdx === 2 ? 'active' : '')}">3. 🚚 Kargoya Verildi</div>
          <div class="order-step \${stageIdx === 3 ? 'done' : ''}">4. ✅ Teslim Edildi</div>
        </div>
      \` : '';

      const s = state.storeSettings || {};
      let ibanInfoBoxHtml = '';
      if (o.status === 'PAID') {
        ibanInfoBoxHtml = \`
          <div style="margin-top:10px;background:#fff7ed;border:1.5px solid #f59e0b;border-radius:10px;padding:12px 14px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
              <strong style="color:#9a3412;">🏦 Firma IBAN & Ödeme Kontrol Aşaması ("Sipariş Alındı")</strong>
              \${o.paymentNotified
                ? \`<span class="status-badge status-DELIVERED">💸 Ödeme Bildirildi (\${escapeHtml(o.paymentSenderName || 'Müşteri')})</span>\`
                : \`<span class="status-badge status-PREPARING">⏳ IBAN Ödemesi / Müşteri Onayı Bekleniyor</span>\`
              }
            </div>
            <div style="color:#7c2d12;margin-bottom:6px;">
              <strong>Alıcı Ad Soyad:</strong> \${escapeHtml(s.ibanHolderName || 'Ev Lezzetlerimm')} &nbsp;|&nbsp;
              <strong>Banka:</strong> \${escapeHtml(s.bankName || 'Banka / FAST')} &nbsp;|&nbsp;
              <strong>IBAN:</strong> <code style="font-weight:900;">\${escapeHtml(s.ibanNumber || '')}</code>
              <button type="button" class="btn btn-sm btn-outline" style="padding:2px 8px;margin-left:6px;" onclick="copyTextToClipboard('\${escapeHtml(s.ibanNumber || '')}', 'IBAN')">📋 Kopyala</button>
            </div>
            <div style="font-size:12.5px;color:#1e3a8a;background:#eff6ff;padding:7px 10px;border-radius:6px;margin-bottom:6px;">
              ℹ️ <strong>Bilgi:</strong> Ücret IBAN hesabına yatırıldıktan ve müşteri ödeme onayını verdikten sonra firma kontrol edip siparişi <strong>"Sipariş Hazırlanıyor"</strong> durumuna geçirecektir.
            </div>
            <div style="font-size:12.5px;color:#991b1b;font-weight:800;">
              ⚠️ Uyarı: 1 gün (24 saat) içinde IBAN'a para yollanmazsa sipariş otomatik olarak iptal olacaktır.
            </div>
            \${!isAdminView ? \`
              <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-sm btn-primary" onclick="openIbanPaymentModal('\${o.id}')">🏦 IBAN & Ödeme Ekranını Aç</button>
                \${!o.paymentNotified ? \`
                  <button type="button" class="btn btn-sm btn-success" onclick="confirmOrderPayment('\${o.id}', false)">💸 Parayı Gönderdim / Ödemeyi Yaptım (Onayla)</button>
                \` : ''}
              </div>
            \` : \`
              <div style="margin-top:8px;font-size:12.5px;font-weight:800;color:\${o.paymentNotified ? '#166534' : '#b45309'};">
                \${o.paymentNotified
                  ? \`✅ MÜŞTERİ PARAYI GÖNDERDİĞİNİ ONAYLADI! (Gönderen: \${escapeHtml(o.paymentSenderName || '-')} • \${escapeHtml(o.paymentNotifiedAt || '')}) — Lütfen banka hesabınızı kontrol edip "Sipariş Hazırlanıyor Yap" butonuna basın.\`
                  : '⏳ Müşteri henüz "Parayı Gönderdim" butonuna basmadı.'
                }
              </div>
            \`}
          </div>
        \`;
      }

      let cargoBoxHtml = '';
      if (o.status === 'SHIPPED' || o.status === 'DELIVERED' || o.trackingCode) {
        cargoBoxHtml = \`
          <div style="margin-top:10px;background:#eef2ff;border:1.5px solid #a5b4fc;border-radius:10px;padding:12px 14px;font-size:13px;color:#1e1b4b;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
              <strong>🚚 Kargo Firması & Otomatik Teslimat Takibi</strong>
              <span class="status-badge status-\${o.status}">\${escapeHtml(o.statusLabel)}</span>
            </div>
            <div>
              <strong>Kargo Firması:</strong> \${escapeHtml(o.cargoCompany || 'Yurtiçi Kargo')} &nbsp;|&nbsp;
              <strong>Takip Kodu:</strong> <code style="font-weight:900;">\${escapeHtml(o.trackingCode || '-')}</code>
              \${o.cargoTrackingUrl ? \`<a href="\${escapeHtml(o.cargoTrackingUrl)}" target="_blank" rel="noopener noreferrer" style="margin-left:8px;font-weight:700;color:#3730a3;">🔗 Kargo Firması Sayfasında Gör ↗</a>\` : ''}
            </div>
            \${o.cargoStatusSummary ? \`<div style="margin-top:4px;font-size:12.5px;color:#312e81;">📡 <strong>Kargo Verisi:</strong> \${escapeHtml(o.cargoStatusSummary)}</div>\` : ''}
            \${o.status === 'SHIPPED' ? \`
              <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-sm btn-outline" onclick="syncCargoOrder('\${o.id}', false)">🔄 Kargo Firmasından Durumu Çek</button>
                <button type="button" class="btn btn-sm btn-success" onclick="syncCargoOrder('\${o.id}', true)">📦 Kargo Teslim Etti (Otomatik Teslim Edildi Güncelle)</button>
              </div>
            \` : ''}
          </div>
        \`;
      }

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
          actionsHtml += \`<button class="btn btn-sm btn-primary" onclick="adminChangeOrderStatus('\${o.id}', 'PREPARING')">👨‍🍳 Sipariş Hazırlanıyor Yap</button>\`;
        }
        if (o.status === 'PREPARING') {
          actionsHtml += \`<button class="btn btn-sm btn-primary" onclick="openCargoShipModal('\${o.id}')">🚚 Kargoya Verildi Yap (Kargo Kodu Gir)</button>\`;
          actionsHtml += \`<button class="btn btn-sm btn-success" onclick="adminChangeOrderStatus('\${o.id}', 'DELIVERED')">✅ Doğrudan Teslim Edildi Yap</button>\`;
        }
        if (o.status === 'SHIPPED') {
          actionsHtml += \`<button class="btn btn-sm btn-outline" onclick="syncCargoOrder('\${o.id}', false)">🔄 Kargo Firmasından Veriyi Çek</button>\`;
          actionsHtml += \`<button class="btn btn-sm btn-success" onclick="adminChangeOrderStatus('\${o.id}', 'DELIVERED')">✅ Teslim Edildi Yap</button>\`;
        }
        if (o.status !== 'REFUNDED') {
          actionsHtml += \`<button class="btn btn-sm btn-danger" onclick="adminChangeOrderStatus('\${o.id}', 'REFUNDED')">💸 İptal / İadeyi Onayla</button>\`;
        }
      }

      return \`
        <div style="border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;background:#fff;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px;padding-bottom:10px;border-bottom:1px solid var(--border);">
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
          \${stepperHtml}
          <table>
            <thead>
              <tr><th>Ürün (Snapshot)</th><th>Adet</th><th>Birim Fiyat</th><th>Toplam</th></tr>
            </thead>
            <tbody>\${itemsHtml}</tbody>
          </table>
          \${ibanInfoBoxHtml}
          \${cargoBoxHtml}
          \${o.status === 'REFUNDED' || o.status === 'REFUND_REQUESTED' ? \`
            <div style="margin-top:10px;background:#fef2f2;border:1px solid #fecaca;padding:10px 12px;border-radius:8px;font-size:13px;color:#991b1b;">
              <strong>İade / İptal Bilgisi:</strong> Durum: \${escapeHtml(o.statusLabel)} | İade Tutarı: <strong>\${o.refund ? o.refund.amountFormatted : o.totalAmountFormatted}</strong> | Neden: \${escapeHtml(o.refundReason || '-')}
              \${o.refund ? \` | Stok Geri Yüklendi: \${o.refund.stockRestored ? 'Evet' : 'Hayır'}\` : ''}
            </div>
          \` : ''}
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap;">
            \${actionsHtml}
          </div>
        </div>
      \`;
    }

    function openCargoShipModal(orderId) {
      document.getElementById('cargo-order-id').value = orderId;
      document.getElementById('cargo-tracking-code').value = '';
      document.getElementById('modal-cargo-ship').classList.add('open');
    }

    async function submitCargoShipForm(e) {
      e.preventDefault();
      const orderId = document.getElementById('cargo-order-id').value;
      const cargoCompany = document.getElementById('cargo-company').value;
      const trackingCode = document.getElementById('cargo-tracking-code').value.trim();
      try {
        await api(\`/api/admin/orders/\${orderId}/status\`, {
          method: 'POST',
          body: JSON.stringify({
            status: 'SHIPPED',
            cargoCompany,
            trackingCode,
            reason: \`Sipariş \${cargoCompany} (\${trackingCode}) ile kargoya verildi.\`
          })
        });
        closeModal('modal-cargo-ship');
        showToast(\`Sipariş 'Kargoya Verildi' olarak güncellendi (\${cargoCompany} - \${trackingCode})!\`, 'success');
        await loadAdminAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function syncCargoOrder(orderId, simulateDelivered = false) {
      try {
        const res = await api(\`/api/orders/\${orderId}/sync-cargo\`, {
          method: 'POST',
          body: JSON.stringify({ simulateDelivered })
        });
        if (res.autoDelivered) {
          showToast('🎉 Kargo firmasından teslimat verisi çekildi ve sipariş otomatik olarak "Teslim Edildi" durumuna güncellendi!', 'success');
        } else {
          showToast('📡 Kargo durumu sorgulandı: ' + (res.order.cargoStatusSummary || 'Taşıma aşamasında'), 'info');
        }
        if (state.currentView === 'admin') {
          await loadAdminAll();
        } else {
          await loadMyOrders();
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
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
      renderAdminSettings();
      if (!state.user || state.user.role !== 'ADMIN') {
        showToast('Yönetici paneline erişmek için Yönetici hesabı ile giriş yapmalısınız.', 'error');
        return;
      }
      const [statsRes, prdRes, ordRes, emlRes, audRes, cfgRes] = await Promise.all([
        api('/api/admin/stats').catch(() => null),
        api('/api/admin/products').catch(() => null),
        api('/api/admin/orders').catch(() => null),
        api('/api/emails').catch(() => null),
        api('/api/admin/audit-logs').catch(() => null),
        api('/api/admin/settings').catch(() => null)
      ]);

      if (prdRes && prdRes.products) state.adminProducts = prdRes.products;
      if (ordRes && ordRes.orders) state.adminOrders = ordRes.orders;
      if (emlRes && emlRes.emails) state.emails = emlRes.emails;
      if (audRes && audRes.logs) state.auditLogs = audRes.logs;
      if (cfgRes && cfgRes.settings) {
        state.adminSettings = cfgRes.settings;
        state.storeSettings = cfgRes.settings;
      }

      if (statsRes && statsRes.stats) {
        const s = statsRes.stats;
        document.getElementById('admin-stats-grid').innerHTML = \`
          <div class="stat-card"><div class="stat-label">Toplam Net Ciro</div><div class="stat-value" style="color:var(--accent);">\${s.netRevenueFormatted}</div></div>
          <div class="stat-card"><div class="stat-label">Toplam Sipariş</div><div class="stat-value">\${s.totalOrders}</div></div>
          <div class="stat-card"><div class="stat-label">İade Edilen Sipariş / Tutar</div><div class="stat-value" style="color:var(--danger);">\${s.refundedOrdersCount} (\${s.refundedAmountFormatted})</div></div>
          <div class="stat-card"><div class="stat-label">Aktif Ürün / Kritik Stok</div><div class="stat-value">\${s.activeProductsCount} / <span style="color:var(--primary);">\${s.lowStockCount}</span></div></div>
          <div class="stat-card"><div class="stat-label">Gönderilen E-Postalar</div><div class="stat-value">\${s.sentEmailsCount}</div></div>
        \`;
      }

      renderAdminProducts();
      renderAdminOrders();
      renderAdminSettings();
      renderEmailsTable(document.getElementById('admin-sub-outbox'), state.emails);
      renderAdminAuditLogs();
    }

    function switchAdminSubTab(tab) {
      if (tab === 'settings') {
        renderAdminSettings();
      }
      ['products', 'orders', 'settings', 'outbox', 'audit'].forEach(t => {
        const subEl = document.getElementById('admin-sub-' + t);
        if (subEl) subEl.style.display = t === tab ? 'block' : 'none';
        const tabEl = document.getElementById('adm-tab-' + t);
        if (tabEl) tabEl.classList.toggle('active', t === tab);
      });
    }

    function renderAdminSettings() {
      const wrap = document.getElementById('admin-sub-settings');
      if (!wrap) return;
      const cfg = state.adminSettings || state.storeSettings || {};
      wrap.innerHTML = \`
        <h3 style="font-size:18px;font-weight:900;margin-bottom:6px;color:var(--primary);">🏦 Firma IBAN, İletişim E-Postası ve Brevo Otomatik E-Posta Ayarları</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
          Buradan kaydettiğiniz IBAN ve Alıcı Ad Soyad bilgileri müşteriler sipariş geçtikten hemen sonra açılan ödeme ekranında, Siparişlerim sayfasında ve gönderilen otomatik e-postalarda yer alır.
        </p>

        <form onsubmit="submitAdminSettingsForm(event)">
          <div class="form-grid">
            <div class="form-group">
              <label>İletişim & Yönetici Bildirim E-Postası *</label>
              <input type="email" id="cfg-contact-email" class="form-control" required value="\${escapeHtml(cfg.contactEmail || 'evlezzetlerimm@gmail.com')}" />
            </div>
            <div class="form-group">
              <label>Banka Adı / Ödeme Yöntemi *</label>
              <input type="text" id="cfg-bank-name" class="form-control" required value="\${escapeHtml(cfg.bankName || 'Ziraat Bankası / FAST (7/24)')}" placeholder="Örn: Ziraat Bankası / Garanti BBVA" />
            </div>
            <div class="form-group">
              <label>IBAN Alıcı Ad Soyad (Firma / Hesap Sahibi) *</label>
              <input type="text" id="cfg-iban-holder" class="form-control" required value="\${escapeHtml(cfg.ibanHolderName || 'Ev Lezzetlerimm - Erdem İbo')}" placeholder="Örn: Erdem İbo" />
            </div>
            <div class="form-group">
              <label>Firma IBAN Numarası (TR...) *</label>
              <input type="text" id="cfg-iban-number" class="form-control" required value="\${escapeHtml(cfg.ibanNumber || 'TR00 0000 0000 0000 0000 0000 00')}" placeholder="TR00 0000 0000 0000 0000 0000 00" />
            </div>
            <div class="form-group">
              <label>Brevo Gönderici Adı</label>
              <input type="text" id="cfg-brevo-sender-name" class="form-control" value="\${escapeHtml(cfg.brevoSenderName || 'Ev Lezzetlerimm')}" />
            </div>
            <div class="form-group">
              <label>Brevo Gönderici E-Postası (Doğrulanmış Gönderici)</label>
              <input type="email" id="cfg-brevo-sender-email" class="form-control" value="\${escapeHtml(cfg.brevoSenderEmail || 'evlezzetlerimm@gmail.com')}" />
            </div>
            <div class="form-group full">
              <label>Brevo API Anahtarı (xkeysib-... ile başlayan anahtar — Günde 300 Gerçek E-Posta Ücretsiz)</label>
              <input type="password" id="cfg-brevo-api-key" class="form-control" value="\${escapeHtml(cfg.brevoApiKey || '')}" placeholder="xkeysib-..." />
            </div>
          </div>

          <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:12px 14px;border-radius:10px;margin:12px 0;font-size:13px;color:#166534;line-height:1.6;">
            <strong>✉️ Brevo Otomatik E-Posta Entegrasyonu Durumu:</strong>
            \${(cfg.brevoConfigured || cfg.brevoApiKey)
              ? '<span class="status-badge status-DELIVERED">✅ Brevo API Aktif — Gerçek E-Posta Gönderiliyor</span>'
              : '<span class="status-badge status-PREPARING">⚙️ Brevo API Anahtarı Bekleniyor (Şu an Site İçi E-Posta Kutusu Aktif)</span>'
            }
            <div style="margin-top:6px;">
              1️⃣ <strong>brevo.com</strong> adresinden ücretsiz hesap açıp gönderici adresinizi <em>Senders (Göndericiler)</em> kısmından doğrulayın.<br/>
              2️⃣ <strong>Çok Önemli (Bulut Sunucu İzni):</strong> <a href="https://app.brevo.com/security/authorised_ips" target="_blank" rel="noopener noreferrer" style="color:#15803d;font-weight:800;text-decoration:underline;">app.brevo.com/security/authorised_ips</a> adresine girip <strong>IP kısıtlamasını kapatın (Deactivate blocking)</strong>; böylece Vercel sunucuları her zaman e-posta gönderebilir.
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:10px;">
            <button type="submit" class="btn btn-primary" style="padding:11px 22px;">💾 IBAN ve Brevo E-Posta Ayarlarını Kaydet</button>
          </div>
        </form>
      \`;
    }

    async function submitAdminSettingsForm(e) {
      e.preventDefault();
      try {
        const payload = {
          contactEmail: document.getElementById('cfg-contact-email').value.trim(),
          bankName: document.getElementById('cfg-bank-name').value.trim(),
          ibanHolderName: document.getElementById('cfg-iban-holder').value.trim(),
          ibanNumber: document.getElementById('cfg-iban-number').value.trim(),
          brevoSenderName: document.getElementById('cfg-brevo-sender-name').value.trim(),
          brevoSenderEmail: document.getElementById('cfg-brevo-sender-email').value.trim(),
          brevoApiKey: document.getElementById('cfg-brevo-api-key').value.trim()
        };
        const res = await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        state.adminSettings = res.settings;
        state.storeSettings = res.settings;
        renderAdminSettings();
        showToast('Firma IBAN, Alıcı Ad Soyad ve Brevo e-posta ayarları başarıyla kaydedildi!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
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
