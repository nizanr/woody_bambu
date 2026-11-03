import React, { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
const Studio = lazy(() => import("./Studio"));
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./style.css";

/* ─── Scroll Reveal Hook ─── */
function useScrollReveal() {
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(el => el.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    const targets = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
    targets.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  });
}

/* ─── Parallax Hook ─── */
function useParallax() {
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    const hero = document.querySelector('.hero-image');
    if (!hero) return;
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          hero.style.transform = `scale(1.03) translateY(${scrollY * 0.25}px)`;
          ticking = false;
        });
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });
}

/* ─── Navbar Scroll Hook ─── */
function useNavbarScroll() {
  useEffect(() => {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          if (window.scrollY > 60) {
            navbar.classList.add('scrolled');
          } else {
            navbar.classList.remove('scrolled');
          }
          ticking = false;
        });
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });
}

/* ─── Live Visitor Count Hook (SSE) ─── */
function useVisitorCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let es;
    try {
      es = new EventSource('/api/visitors/stream');
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (Number.isInteger(data.count)) setCount(data.count);
        } catch {}
      };
      es.onerror = () => {
        es.close();
        // fallback: poll once
        fetch('/api/visitors/count').then(r => r.json()).then(d => {
          if (Number.isInteger(d.count)) setCount(d.count);
        }).catch(() => {});
      };
    } catch {
      fetch('/api/visitors/count').then(r => r.json()).then(d => {
        if (Number.isInteger(d.count)) setCount(d.count);
      }).catch(() => {});
    }
    return () => es?.close();
  }, []);
  return count;
}

const money = (n) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
async function api(url, opts) {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await r
    .json()
    .catch(() => ({ error: "Sunucu yanıtı alınamadı" }));
  if (!r.ok) throw Error(data.error || "İşlem başarısız");
  return data;
}
function App() {
  const [products, setProducts] = useState([]),
    [user, setUser] = useState(null),
    [page, setPage] = useState("home"),
    [category, setCategory] = useState("Tümü"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("featured"),
    [modal, setModal] = useState(null),
    [selected, setSelected] = useState(null),
    [toast, setToast] = useState(""),
    [toastHiding, setToastHiding] = useState(false),
    [orders, setOrders] = useState([]),
    [payment, setPayment] = useState(null),
    [busy, setBusy] = useState(false),
    [loadError, setLoadError] = useState(""),
    [pageKey, setPageKey] = useState(0);
  const visitorCount = useVisitorCount();
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const focusTimer = setTimeout(
      () => document.querySelector(".modal button, .modal input")?.focus(),
      150,
    );
    const keydown = (e) => {
      if (e.key === "Escape") {
        setModal(null);
        return;
      }
      if (e.key !== "Tab") return;
      const controls = [
        ...document.querySelectorAll(
          ".modal button:not(:disabled), .modal input, .modal select, .modal textarea, .modal a[href]",
        ),
      ].filter((el) => el.getClientRects().length);
      if (!controls.length) return;
      const first = controls[0],
        last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [modal]);
  const [cart, setCart] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem("bahce-cart") || "[]");
      return Array.isArray(v)
        ? v.filter(
            (i) =>
              typeof i.id === "string" &&
              Number.isInteger(i.quantity) &&
              i.quantity > 0,
          )
        : [];
    } catch {
      return [];
    }
  });
  const notify = (s) => { setToastHiding(false); setToast(s); };
  useEffect(() => {
    Promise.all([
      api("/api/products"),
      api("/api/me"),
      api("/api/payment-config"),
    ])
      .then(([p, u, c]) => {
        setProducts(p);
        setUser(u);
        setPayment(c);
      })
      .catch((e) => setLoadError(e.message));
    const id = new URLSearchParams(location.search).get("payment");
    if (id)
      api("/api/orders/" + id + "/pay", { method: "POST" })
        .then(() => {
          notify("Ödeme doğrulandı. Siparişlerinizden takip edebilirsiniz.");
          setCart([]);
          history.replaceState({}, "", "/");
        })
        .catch((e) => notify(e.message));
  }, []);
  useEffect(() => {
    localStorage.setItem("bahce-cart", JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => {
        setToastHiding(true);
        setTimeout(() => { setToast(""); setToastHiding(false); }, 350);
      }, 4650);
      return () => clearTimeout(t);
    }
  }, [toast]);
  /* Animation hooks */
  useScrollReveal();
  useParallax();
  useNavbarScroll();
  const add = (p) => {
    setCart((c) => {
      const old = c.find((i) => i.id === p._id);
      if ((old?.quantity || 0) >= p.stock) {
        notify("Stok sınırına ulaşıldı");
        return c;
      }
      return old
        ? c.map((i) =>
            i.id === p._id ? { ...i, quantity: i.quantity + 1 } : i,
          )
        : [...c, { id: p._id, quantity: 1 }];
    });
    notify("Ürün sepetinize eklendi");
  };
  const items = cart
    .map((i) => ({ ...i, product: products.find((p) => p._id === i.id) }))
    .filter((i) => i.product);
  const total = items.reduce((s, i) => s + i.quantity * i.product.price, 0);
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const openOrders = async () => {
    try {
      setOrders(await api("/api/orders"));
      setModal("orders");
    } catch (e) {
      notify(e.message);
      setModal("login");
    }
  };
  let shown = products.filter(
    (p) =>
      (category === "Tümü" || category === p.category) &&
      p.name.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr")),
  );
  if (sort === "low") shown.sort((a, b) => a.price - b.price);
  if (sort === "high") shown.sort((a, b) => b.price - a.price);
  const collection = () => {
    setPage("home");
    setPageKey(k => k + 1);
    setTimeout(
      () =>
        document
          .getElementById("collection")
          ?.scrollIntoView({ behavior: "smooth" }),
      30,
    );
  };
  return (
    <>
      <div className="announcement">
        Doğanın içinde, evinizin konforunda.{" "}
        <span>₺15.000 üzeri ücretsiz teslimat ↗</span>
      </div>
      <header className="navbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("home");
            window.scrollTo(0, 0);
          }}
        >
          <span className="brand-symbol">✳</span>
          <span>
            bahçeni<span className="brand-bottom">tasarla.</span>
          </span>
        </a>
        <nav>
          <button
            className={page === "home" ? "active" : ""}
            onClick={collection}
          >
            Koleksiyon
          </button>
          <button
            onClick={() => {
              setSelected(products[0]);
              setModal("studio");
            }}
          >
            Bahçeni Tasarla <span className="tiny-tag">3D</span>
          </button>
          <button
            onClick={() => {
              setPage("about");
              window.scrollTo(0, 0);
            }}
          >
            Hikâyemiz
          </button>
        </nav>
        <div className="nav-actions">
          <button
            className="icon search-icon"
            aria-label="Ürün ara"
            onClick={() => {
              collection();
              setTimeout(() => document.getElementById("search")?.focus(), 100);
            }}
          >
            ⌕
          </button>
          <button
            className="account"
            onClick={() => setModal(user ? "account" : "login")}
          >
            ♙ <span>{user ? user.name.split(" ")[0] : "Hesabım"}</span>
          </button>
          <button className="cart-btn" onClick={() => setModal("cart")}>
            Sepet <span>{count}</span>
          </button>
        </div>
      </header>
      {loadError && (
        <div className="error-banner">
          {loadError}{" "}
          <button onClick={() => location.reload()}>Tekrar dene</button>
        </div>
      )}
      {page === "admin" ? (
        <Admin
          user={user}
          api={api}
          notify={notify}
          refresh={() => api("/api/products").then(setProducts)}
        />
      ) : page === "about" ? (
        <main className="about page-transition" key={"about-" + pageKey}>
          <span className="eyebrow reveal">HİKÂYEMİZ</span>
          <h1 className="reveal">
            Bir bahçeden
            <br />
            çok daha fazlası.
          </h1>
          <p className="reveal">
            Bahçeni Tasarla, Nisa Nur Çakır ve Zeynep Ulusoy'un bahçe mobilyası
            alışverişini bir tasarım deneyimine dönüştüren web programlama
            projesidir.
          </p>
          <p className="reveal">
            Mobilyayı satın almadan önce kendi alanınızda deneyin. Bahçe
            fotoğrafınızı yükleyin, 3D modeli yerleştirin ve sizin için doğru
            düzeni bulun.
          </p>
          <button
            className="primary reveal"
            onClick={() => {
              setSelected(products[0]);
              setModal("studio");
            }}
          >
            Tasarım stüdyosunu keşfet ↗
          </button>
        </main>
      ) : (
        <main className="page-transition" key={"home-" + pageKey}>
          <section className="hero">
            <div className="hero-image" />
            <div className="hero-shade" />
            <div className="hero-content">
              <span className="eyebrow light">AÇIK HAVADA YAŞAM SANATI</span>
              <h1>
                Biraz doğa.
                <br />
                Biraz huzur.
                <br />
                <em>Tam senlik bir bahçe.</em>
              </h1>
              <p>
                Yaşam alanını dışarı taşı. Zamansız tasarımları keşfet,
                <br className="desktop" /> satın almadan önce kendi bahçende
                gör.
              </p>
              <div className="hero-buttons">
                <button className="cream-btn" onClick={collection}>
                  Koleksiyonu keşfet <span>↗</span>
                </button>
                <button
                  className="glass-btn"
                  onClick={() => {
                    setSelected(products[0]);
                    setModal("studio");
                  }}
                >
                  ◈ Bahçemde dene
                </button>
              </div>
              <div className="hero-bottom">
                <span>DOĞADAN İLHAM ALAN TASARIMLAR</span>
                <span>
                  01 <i /> 04
                </span>
              </div>
            </div>
            <div className="hero-label">
              <span>YENİ KOLEKSİYON</span>
              <strong>Dışarıda hayat var.</strong>
            </div>
            {visitorCount > 0 && (
              <div className="hero-visitor">
                <div className="visitor-counter">
                  <span className="pulse-dot" />
                  <span className="count">{visitorCount}</span>
                  <span>kişi şu an geziyor</span>
                </div>
              </div>
            )}
          </section>
          <section className="benefits">
            <div className="reveal">
              <span>♧</span>
              <p>
                Doğaya yakın tasarım
                <small>Doğal dokular, zamansız çizgiler</small>
              </p>
            </div>
            <div className="reveal">
              <span>◈</span>
              <p>
                Önce bahçende gör<small>Fotoğrafın üzerinde 3D deneyim</small>
              </p>
            </div>
            <div className="reveal">
              <span>♙</span>
              <p>
                Senin için burada
                <small>Kolay alışveriş, şeffaf sipariş takibi</small>
              </p>
            </div>
            <div className="reveal">
              <span>↗</span>
              <p>
                Kapına kadar<small>₺15.000 üzeri ücretsiz teslimat</small>
              </p>
            </div>
          </section>
          <section className="collection" id="collection">
            <div className="section-heading reveal">
              <div>
                <span className="eyebrow">BAHÇENİN YENİ FAVORİLERİ</span>
                <h2>Dışarıda güzel bir hayat.</h2>
              </div>
              <p>
                Küçük bir balkon ya da kocaman bir bahçe.
                <br />
                Her alan için, sana ait bir köşe.
              </p>
            </div>
            <div className="filters">
              <div className="tabs">
                {[
                  "Tümü",
                  "Oturma Grupları",
                  "Sandalyeler",
                  "Masalar",
                  "Şezlonglar",
                ].map((c) => (
                  <button
                    key={c}
                    className={c === category ? "selected" : ""}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="filter-controls">
                <input
                  id="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ürün ara…"
                  aria-label="Ürün ara"
                />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label="Sıralama"
                >
                  <option value="featured">Önerilen sıralama</option>
                  <option value="low">Fiyat: düşükten yükseğe</option>
                  <option value="high">Fiyat: yüksekten düşüğe</option>
                </select>
              </div>
            </div>
            <div className="product-grid reveal-stagger">
              {shown.map((p, i) => (
                <article className="product reveal" key={p._id}>
                  <div className="product-image">
                    <button
                      className="image-open"
                      onClick={() => {
                        setSelected(p);
                        setModal("detail");
                      }}
                      aria-label={p.name + " detayları"}
                    >
                      <img src={p.image} alt={p.name} loading="lazy" />
                    </button>
                    <span className="product-tag">
                      {i === 0 ? "ÇOK SEVİLEN" : "DOĞAL DOKULAR"}
                    </span>
                    <button
                      className="quick-add"
                      onClick={() => add(p)}
                      aria-label={p.name + " sepete ekle"}
                      disabled={!p.stock}
                    >
                      +
                    </button>
                    <button
                      className="try-btn"
                      onClick={() => {
                        setSelected(p);
                        setModal("studio");
                      }}
                    >
                      ◈ Bahçemde gör
                    </button>
                  </div>
                  <div className="product-meta">
                    <small>{p.category.toLocaleUpperCase("tr")}</small>
                    <h3>
                      <button
                        onClick={() => {
                          setSelected(p);
                          setModal("detail");
                        }}
                      >
                        {p.name}
                      </button>
                    </h3>
                    <div className="price-row">
                      <span>{money(p.price)}</span>
                      <span className="swatches">
                        <i style={{ background: p.color }} />
                        <i style={{ background: "#455147" }} />
                        <i style={{ background: "#dfd5c5" }} />
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!shown.length && (
              <p className="empty">Aramanıza uygun ürün bulunamadı.</p>
            )}
          </section>
          <section className="design-promo">
            <div className="promo-photo reveal-left">
              <span className="floating-pill">
                ◈ SENİN ALANIN, SENİN TASARIMIN
              </span>
            </div>
            <div className="promo-copy reveal-right">
              <span className="eyebrow">HAYAL ETMEKLE KALMA</span>
              <h2>
                Bahçende nasıl
                <br />
                duracağını <em>gör.</em>
              </h2>
              <p>
                Bir fotoğraf yükle, favori mobilyanı yerleştir.
                <br />
                Döndür, boyutlandır, hayalindeki köşeyi oluştur.
              </p>
              <button
                className="primary"
                onClick={() => {
                  setSelected(products[0]);
                  setModal("studio");
                }}
              >
                Bahçemi tasarlamaya başla ↗
              </button>
              <small>
                Ücretsiz · İndirme gerektirmez · Fotoğrafın sende kalır
              </small>
            </div>
          </section>
        </main>
      )}
      <footer>
        <div className="footer-top">
          <div>
            <a className="brand">
              <span className="brand-symbol">✳</span>
              <span>
                bahçeni<span className="brand-bottom">tasarla.</span>
              </span>
            </a>
            <p>Güzel anlar, açık havada başlar.</p>
          </div>
          <div>
            <strong>Keşfet</strong>
            <button onClick={collection}>Koleksiyon</button>
            <button
              onClick={() => {
                setSelected(products[0]);
                setModal("studio");
              }}
            >
              3D tasarım stüdyosu
            </button>
          </div>
          <div>
            <strong>Hesabın</strong>
            <button onClick={() => setModal(user ? "account" : "login")}>
              Giriş / Üyelik
            </button>
            <button onClick={openOrders}>Siparişlerim</button>
          </div>
          <div>
            <strong>Birlikte tasarlayalım.</strong>
            <p>Bahçen için yeni bir başlangıç.</p>
            <button onClick={() => setPage("about")}>
              Hikâyemizi keşfet ↗
            </button>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Bahçeni Tasarla</span>
          <span>Web Programlama Projesi · Nisa Nur Çakır & Zeynep Ulusoy</span>
        </div>
      </footer>
      {toast && (
        <div className={"toast" + (toastHiding ? " hiding" : "")} role="status">
          {toast}
          <button onClick={() => { setToastHiding(true); setTimeout(() => { setToast(""); setToastHiding(false); }, 350); }} aria-label="Bildirimi kapat">
            ×
          </button>
        </div>
      )}
      {modal === "studio" && selected && (
        <Suspense
          fallback={<div className="toast">3D stüdyo hazırlanıyor…</div>}
        >
          <Studio
            product={selected}
            user={user}
            api={api}
            notify={notify}
            onClose={() => setModal(null)}
          />
        </Suspense>
      )}
      {modal && modal !== "studio" && (
        <div className="overlay" onClick={() => setModal(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Hesap ve alışveriş penceresi"
            className={"modal " + (modal === "cart" ? "cart-modal" : "")}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close icon"
              onClick={() => setModal(null)}
              aria-label="Kapat"
            >
              ×
            </button>
            {["login", "register"].includes(modal) && (
              <>
                <span className="eyebrow">BAHÇENE HOŞ GELDİN</span>
                <h2>
                  {modal === "login"
                    ? "Yeniden merhaba."
                    : "Yeni bir başlangıç."}
                </h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      const u = await api("/api/auth/" + modal, {
                        method: "POST",
                        body: JSON.stringify(
                          Object.fromEntries(new FormData(e.target)),
                        ),
                      });
                      setUser(u);
                      setModal(null);
                      notify("Hoş geldin, " + u.name);
                    } catch (e) {
                      notify(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {modal === "register" && (
                    <label>
                      Ad soyad
                      <input
                        name="name"
                        required
                        maxLength="80"
                        autoComplete="name"
                      />
                    </label>
                  )}
                  <label>
                    E-posta
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    Şifre
                    <input
                      name="password"
                      type="password"
                      required
                      minLength="8"
                      maxLength="128"
                      autoComplete={
                        modal === "login" ? "current-password" : "new-password"
                      }
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    {busy
                      ? "Lütfen bekleyin…"
                      : modal === "login"
                        ? "Giriş yap"
                        : "Hesap oluştur"}
                  </button>
                </form>
                <button
                  className="text-btn"
                  onClick={() =>
                    setModal(modal === "login" ? "register" : "login")
                  }
                >
                  {modal === "login"
                    ? "Hesabın yok mu? Üye ol"
                    : "Hesabın var mı? Giriş yap"}
                </button>
              </>
            )}
            {modal === "account" && user && (
              <>
                <h2>Merhaba, {user.name}</h2>
                <p>{user.email}</p>
                <span className="badge">
                  {user.role === "superadmin"
                    ? "Süper admin"
                    : user.role === "admin"
                      ? "Admin"
                      : "Kullanıcı"}
                </span>
                <button className="primary" onClick={openOrders}>
                  Siparişlerim
                </button>
                {["admin", "superadmin"].includes(user.role) && (
                  <button
                    className="secondary"
                    onClick={() => {
                      setModal(null);
                      setPage("admin");
                    }}
                  >
                    Yönetim paneli
                  </button>
                )}
                <button
                  className="text-btn"
                  onClick={async () => {
                    await api("/api/logout", { method: "POST" });
                    setUser(null);
                    setModal(null);
                    setPage("home");
                  }}
                >
                  Çıkış yap
                </button>
              </>
            )}
            {modal === "detail" && selected && (
              <>
                <img
                  className="detail-image"
                  src={selected.image}
                  alt={selected.name}
                />
                <span className="eyebrow">{selected.category}</span>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
                <h3>{money(selected.price)}</h3>
                <p>
                  {selected.stock} adet stokta · Temsili 3D model ile önizleme
                </p>
                <button
                  className="primary"
                  onClick={() => add(selected)}
                  disabled={!selected.stock}
                >
                  Sepete ekle
                </button>
                <button
                  className="secondary"
                  onClick={() => setModal("studio")}
                >
                  ◈ Kendi bahçemde gör
                </button>
              </>
            )}
            {modal === "cart" && (
              <>
                <span className="eyebrow">SANA AİT BİR KÖŞE</span>
                <h2>
                  Sepetin <small>({count})</small>
                </h2>
                {!items.length ? (
                  <p className="empty">
                    Sepetin henüz boş. Bahçen için güzel bir şey seç.
                  </p>
                ) : (
                  <>
                    {items.map((i) => (
                      <div className="cart-item" key={i.id}>
                        <img src={i.product.image} alt="" />
                        <div>
                          <strong>{i.product.name}</strong>
                          <p>{money(i.product.price)}</p>
                          <div className="quantity">
                            <button
                              aria-label="Adedi azalt"
                              onClick={() =>
                                setCart((c) =>
                                  c
                                    .map((j) =>
                                      j.id === i.id
                                        ? { ...j, quantity: j.quantity - 1 }
                                        : j,
                                    )
                                    .filter((j) => j.quantity > 0),
                                )
                              }
                            >
                              −
                            </button>
                            <span>{i.quantity}</span>
                            <button
                              aria-label="Adedi artır"
                              disabled={i.quantity >= i.product.stock}
                              onClick={() =>
                                setCart((c) =>
                                  c.map((j) =>
                                    j.id === i.id
                                      ? { ...j, quantity: j.quantity + 1 }
                                      : j,
                                  ),
                                )
                              }
                            >
                              +
                            </button>
                            <button
                              onClick={() =>
                                setCart((c) => c.filter((j) => j.id !== i.id))
                              }
                            >
                              Kaldır
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="total">
                      <span>Toplam</span>
                      <strong>{money(total)}</strong>
                    </div>
                    <p className="muted">
                      {total >= 15000
                        ? "Ücretsiz teslimat"
                        : "Teslimat bedeli proje demosunda alınmaz."}
                    </p>
                    <div className="payment-note">
                      {payment?.label || "Ödeme bilgisi yükleniyor…"}
                      {payment?.provider === "iyzico" &&
                        " · Sandbox test bilgileri kullanılır. Gerçek kart veya kimlik bilgisi girmeyin."}
                    </div>
                    {!user ? (
                      <button
                        className="primary"
                        onClick={() => setModal("login")}
                      >
                        Devam etmek için giriş yap
                      </button>
                    ) : (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setBusy(true);
                          try {
                            const r = await api("/api/orders", {
                              method: "POST",
                              body: JSON.stringify({
                                items: cart,
                                address: new FormData(e.target).get("address"),
                              }),
                            });
                            if (r.url) {
                              location.href = r.url;
                              return;
                            }
                            await api("/api/orders/" + r.order._id + "/pay", {
                              method: "POST",
                            });
                            setCart([]);
                            notify(
                              "Demo sipariş oluşturuldu. Gerçek ödeme alınmadı.",
                            );
                            await openOrders();
                          } catch (e) {
                            notify(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <label>
                          Teslimat adresi
                          <textarea
                            name="address"
                            minLength="10"
                            maxLength="500"
                            required
                            placeholder="İl, ilçe, mahalle, sokak ve kapı numarası"
                          />
                        </label>
                        <button className="primary" disabled={busy}>
                          {busy
                            ? "İşleniyor…"
                            : payment?.provider === "iyzico"
                              ? "Güvenli ödemeye geç ↗"
                              : "Demo ödemeyi tamamla"}
                        </button>
                      </form>
                    )}
                  </>
                )}
              </>
            )}
            {modal === "orders" && (
              <>
                <h2>Siparişlerim</h2>
                {!orders.length ? (
                  <p>Henüz siparişin yok.</p>
                ) : (
                  orders.map((o) => (
                    <div className="order" key={o._id}>
                      <div>
                        <strong>#{o._id.slice(-8).toUpperCase()}</strong>
                        <span className="badge">
                          {
                            {
                              pending: "Ödeme bekliyor",
                              paid: "Ödendi",
                              demo_paid: "Demo ödeme",
                              preparing: "Hazırlanıyor",
                              shipped: "Kargoda",
                              delivered: "Teslim edildi",
                              cancelled: "İptal edildi",
                            }[o.status]
                          }
                        </span>
                      </div>
                      <p>
                        {o.items
                          .map((i) => `${i.name} × ${i.quantity}`)
                          .join(", ")}
                      </p>
                      <strong>{money(o.total)}</strong>
                      <small>
                        {new Date(o.createdAt).toLocaleDateString("tr-TR")}
                      </small>
                      {o.status === "pending" && (
                        <button
                          onClick={async () => {
                            try {
                              await api("/api/orders/" + o._id + "/cancel", {
                                method: "POST",
                              });
                              await openOrders();
                              setProducts(await api("/api/products"));
                              notify("Sipariş iptal edildi");
                            } catch (e) {
                              notify(e.message);
                            }
                          }}
                        >
                          Siparişi iptal et
                        </button>
                      )}
                      {o.status === "pending" && (
                        <button
                          className="secondary"
                          onClick={async () => {
                            try {
                              await api("/api/orders/" + o._id + "/pay", {
                                method: "POST",
                              });
                              await openOrders();
                              notify("Ödeme durumu güncellendi");
                            } catch (e) {
                              notify(e.message);
                            }
                          }}
                        >
                          Ödeme durumunu doğrula
                        </button>
                      )}
                    </div>
                  ))
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
function Admin({ user, api, notify, refresh }) {
  const [data, setData] = useState(null),
    [tab, setTab] = useState("products"),
    [editing, setEditing] = useState(null);
  const load = () =>
    api("/api/admin")
      .then(setData)
      .catch((e) => notify(e.message));
  useEffect(() => {
    load();
  }, []);
  if (!["admin", "superadmin"].includes(user?.role))
    return <main className="about">Yetkiniz yok.</main>;
  const action = async (url, body) => {
    try {
      await api(url, { method: "PATCH", body: JSON.stringify(body) });
      load();
      refresh();
      notify("Güncellendi");
    } catch (e) {
      notify(e.message);
    }
  };
  return (
    <main className="admin">
      <span className="eyebrow">YÖNETİM PANELİ</span>
      <h1>Her şey kontrolünde.</h1>
      <div className="tabs">
        {["products", "orders", "users"].map((t, i) => (
          <button
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
            key={t}
          >
            {["Ürünler", "Siparişler", "Kullanıcılar"][i]}
          </button>
        ))}
      </div>
      {!data ? (
        <p>Yükleniyor…</p>
      ) : (
        <>
          <div className="stats">
            <div>
              <small>ÜRÜNLER</small>
              <h2>{data.products.length}</h2>
            </div>
            <div>
              <small>SİPARİŞLER</small>
              <h2>{data.orders.length}</h2>
            </div>
            <div>
              <small>KULLANICILAR</small>
              <h2>{data.users.length}</h2>
            </div>
          </div>
          {tab === "products" && (
            <>
              <h2>{editing ? "Ürünü düzenle" : "Yeni ürün ekle"}</h2>
              <form
                key={editing?._id || "new"}
                className="admin-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.target));
                  f.price = +f.price;
                  f.stock = +f.stock;
                  try {
                    await api(
                      "/api/admin/products" +
                        (editing ? "/" + editing._id : ""),
                      {
                        method: editing ? "PATCH" : "POST",
                        body: JSON.stringify(f),
                      },
                    );
                    setEditing(null);
                    e.target.reset();
                    load();
                    refresh();
                    notify("Ürün kaydedildi");
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                <label>
                  Ürün adı
                  <input name="name" required defaultValue={editing?.name} />
                </label>
                <label>
                  Kategori
                  <select name="category" defaultValue={editing?.category}>
                    {[
                      "Oturma Grupları",
                      "Sandalyeler",
                      "Masalar",
                      "Şezlonglar",
                    ].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Fiyat (TL)
                  <input
                    name="price"
                    type="number"
                    min="1"
                    required
                    defaultValue={editing?.price}
                  />
                </label>
                <label>
                  Stok
                  <input
                    name="stock"
                    type="number"
                    min="0"
                    required
                    defaultValue={editing?.stock}
                  />
                </label>
                <label>
                  Görsel HTTPS adresi
                  <input
                    name="image"
                    type="text"
                    required
                    defaultValue={editing?.image}
                  />
                </label>
                <label>
                  Model rengi
                  <input
                    name="color"
                    type="color"
                    defaultValue={editing?.color || "#b79b77"}
                  />
                </label>
                <label>
                  Açıklama
                  <input
                    name="description"
                    defaultValue={editing?.description}
                  />
                </label>
                <button className="primary">Kaydet</button>
                {editing && (
                  <button type="button" onClick={() => setEditing(null)}>
                    Vazgeç
                  </button>
                )}
              </form>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th>Fiyat</th>
                      <th>Stok</th>
                      <th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p) => (
                      <tr key={p._id}>
                        <td>{p.name}</td>
                        <td>{money(p.price)}</td>
                        <td>{p.stock}</td>
                        <td>
                          <button onClick={() => setEditing(p)}>Düzenle</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "orders" &&
            data.orders.map((o) => (
              <div className="order" key={o._id}>
                <strong>
                  #{o._id.slice(-8)} · {money(o.total)}
                </strong>
                <p>
                  {o.items.map((i) => i.name + " × " + i.quantity).join(", ")}
                </p>
                <p>{o.address}</p>
                <label>
                  Durum
                  <select
                    value={o.status}
                    onChange={(e) =>
                      action("/api/admin/orders/" + o._id, {
                        status: e.target.value,
                      })
                    }
                  >
                    {[
                      "pending",
                      "paid",
                      "demo_paid",
                      "preparing",
                      "shipped",
                      "delivered",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          {tab === "users" && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ad</th>
                    <th>E-posta</th>
                    <th>Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u._id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>
                        {user.role === "superadmin" && u._id !== user.id ? (
                          <select
                            value={u.role}
                            onChange={(e) =>
                              action("/api/admin/users/" + u._id, {
                                role: e.target.value,
                              })
                            }
                          >
                            {["user", "admin", "superadmin"].map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        ) : (
                          u.role
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
