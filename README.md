# Woody Bambu

Nisa Nur Çakır ve Zeynep Ulusoy'un öneri raporuna göre geliştirilen, fotoğraf üzerinde 3D mobilya yerleştirmeli bahçe mobilyası e-ticaret uygulaması.

## Çalıştırma

Node.js 22+ ve Docker gerekir. MongoDB 7.0.24, Docker üzerinde çalışır; kayıtlar `.data/mongo-docker` dizininde kalıcıdır.

```bash
bash scripts/setup.sh
npm run dev
```

Uygulama 3000 portunda çalışır. Harici MongoDB kullanıyorsanız `MONGODB_URI` tanımlayın; Docker yerine kendi servisinizi başlatın ve `npm ci` çalıştırın. Testler ayrı, geçici isimli MongoDB veritabanını kullanır ve bitince yalnızca onu siler.

```bash
npm test                    # API entegrasyon testleri
npx playwright test         # çalışan uygulama üzerinde tarayıcı testleri
npm run build               # React üretim derlemesi
```

Tarayıcı testleri `/usr/bin/chromium` kullanır; farklı makinelerde `playwright.config.js` içindeki tarayıcı yolunu uyarlayın.

## Özellikler

- Türkçe ve mobil uyumlu katalog; kategori, arama, fiyat sıralaması, ürün detayı.
- Şifreleri bcrypt ile saklayan üyelik, MongoDB'de oturum, kullanıcı/admin/süper admin rolleri.
- Adet kontrollü sepet; sunucu taraflı fiyat hesaplama ve atomik stok ayırma.
- Demo ödeme ile sipariş oluşturma; iyzico sandbox checkout entegrasyonu ve sunucu taraflı ödeme sorgulama.
- Kullanıcıya ait siparişler; admin ürün düzenleme/ekleme, sipariş sevki; yalnızca süper admine rol yönetimi.
- Three.js ile ürüne göre üretilen temsili 3D mobilya; JPEG/PNG bahçe fotoğrafında sürükleme, döndürme ve boyutlandırma. Fotoğraf sunucuya gönderilmez. Yerleşim verileri kullanıcı hesabında kaydedilir.

## Süper admin oluşturma

Kendiliğinden admin hesabı açılmaz. Yerel terminalde e-posta ve şifreyi okuyun; şifre terminalde görünmez ve Git'e eklenmez:

```bash
read -r -p 'Admin e-posta: ' ADMIN_EMAIL
read -r -s -p 'Admin şifre (en az 12 karakter): ' ADMIN_PASSWORD
export ADMIN_EMAIL ADMIN_PASSWORD
node server/create-admin.js
unset ADMIN_EMAIL ADMIN_PASSWORD
```

Script mevcut hesapların rolünü veya şifresini değiştirmez. Oluşturduğunuz hesapla giriş yapıp Hesabım → Yönetim paneli yolunu kullanın. Admin ürün ve sipariş yönetir; süper admin ayrıca diğer kullanıcıların rolünü değiştirir.

## iyzico sandbox

`.env.example` alanlarını kendi `.env` dosyanıza doldurun ve `node --env-file=.env server/index.js` ile başlatın. Anahtarlar sohbet, Git veya iş planına yazılmamalıdır. Gerekli alanlar `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `APP_URL`. Servis yalnızca `https://sandbox-api.iyzipay.com` adresine bağlanır. `APP_URL` sandbox tarafından ulaşılabilen HTTPS uygulama adresi olmalıdır.

Sandbox örneği sabit test telefon/kimlik ve şehir verisi kullanır; gerçek kart veya kişisel kimlik bilgisi girmeyin. İki anahtar tanımlı değilse uygulama **demo ödeme** gösterir, gerçek para çekmez ve siparişi `demo_paid` olarak kaydeder. Demo işlem, iyzico üzerinden yapılmış ödeme değildir.

Ödeme başarılı sayfasına dönmek tek başına ödeme kanıtı değildir: API sağlayıcıdan `paymentStatus` ve tutarı kontrol eder. Giriş oturumunun korunmadığı dönüşte tekrar giriş yapıp Siparişlerim → Ödeme durumunu doğrula seçeneğini kullanın.

Sandbox anahtarları sağlanmadığı için sağlayıcıyla uçtan uca ödeme henüz doğrulanmadı. Bu bir ders projesi test entegrasyonudur; canlı ödeme kullanımına hazır olduğu iddia edilmez. iyzico ödemesi bekleyen siparişler stok ayırır; iptal/oturum süresi dolma ve sağlayıcı mutabakatı canlı kullanım öncesi ayrıca geliştirilmelidir. Demo sipariş iptali stokları geri ekler.

## Mimari ve ders teslimleri

- [Kod rehberi](docs/KOD_REHBERI.md): dosyalar, veri akışı ve canlı kodlama örnekleri.
- [İş planı](docs/IS_PLANI.md): 8 iş paketi, sorumlular, 8 hafta ve 3 sunum.
- [Test planı](docs/TEST_PLANI.md): 100 planlı test senaryosu; hata raporu değildir.
- [Hata raporu şablonu](docs/HATA_RAPORU.md): test ekibinin gerçek bulguları için.

Ürün görselleri/3D modeller temsilidir; üreticiye ait hassas ölçülü GLB dosyaları değildir. Fotoğraf üstündeki yerleştirme, öneride tarif edilen fotoğraf tabanlı önizlemedir; yüzey algılayan cihaz AR'si değildir. 5 saniye performans hedefi farklı cihazlarda ölçülmelidir.

Üretim için `SESSION_SECRET` zorunlu; `npm run build` ardından `npm start`. HTTPS sonlandırma, ödeme mutabakatı, yedekleme, sipariş rezervasyon süreleri ve yasal metinler canlı yayın öncesi hazırlanmalıdır. Hazırlanan bulut yapılandırması yayınlama işlemi değildir.

Görsel kaynakları: ana bahçe görseli bu proje için AI ile üretildi; ürün kartları projedeki Three.js modellerinden çizildi. Görseller `public/images` içinde yereldir; harici görsel/font servisine ihtiyaç yoktur.

## İnternette yayınlama

[Render + MongoDB Atlas yayınlama rehberi](docs/YAYINLAMA.md) ve `render.yaml` hazır. Render otomatik oturum anahtarı üretir; sizin yalnızca kendi Atlas bağlantı dizesini güvenli panelde girmeniz gerekir. Hosting hesabı/bağlantısı olmadan bu depo kendiliğinden yayınlanmaz.
