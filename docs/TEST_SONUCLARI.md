# Doğrulama sonuçları

- API entegrasyonu: 31 test geçti. Gerçek MongoDB, oturum, rol sınırları, stok rezervasyonu/iadesi, kullanıcı izolasyonu ve tasarım kayıtları denetlendi.
- iyzico adaptörü: taklit sağlayıcıyla başarısız ödeme, tutar uyuşmazlığı, başarılı ödeme ve başlatma hatasında stok iadesi denetlendi. Canlı sandbox servisi bu testlerde çağrılmadı.
- Tarayıcı: katalog/filtre/sepet ve mobil taşma; WebGL 3D çizim ve dönüş testleri geçti. Üyelik, JPEG/PNG fotoğraf seçme, yerleşim kaydı ve demo sipariş tamamlama testi de geçti. Toplam 3 tarayıcı testi.
- React üretim derlemesi başarılı.

**Yürütülmeyen kontroller:** Gerçek iyzico sandbox checkout (anahtarlar yok), tüm manuel 100 senaryo, gerçek mobil cihazlarda 5 saniye performans ölçümü, canlı dağıtım.

Bu dosya bir hata bulgusu listesi değildir. Manuel test planındaki bekleyen durumlar otomatik olarak geçti sayılmaz.

## Yayın hazırlığı kontrolleri

- İlk süper admin kurulumu: 6 test geçti; mevcut müşteriler yükseltilmiyor, şifre yeniden başlatmada değişmiyor. API testleriyle toplam 37 otomatik test başarılı.
- Üretim modunda HTTPS proxy arkasında Secure/HttpOnly oturum çerezi, Render kaynak adresi ve güçlü oturum anahtarı gereksinimi denetlendi.
- Üretim sunucusu yerel olarak başlatıldı; ana sayfanın derlenmiş JS dosyaları, ürün API, veritabanı sağlık kontrolü ve bahçe görseli HTTP istekleriyle doğrulandı.
- Render/Atlas üzerinde canlı deployment henüz yapılmadı; hosting hesapları ve Atlas bağlantısı gerekiyor.
