# DocFlow — AI Destekli Belge İşleme Pipeline'ı (Azure)

## Proje Sahibi Hakkında Bağlam

- 4. sınıf Yazılım Mühendisliği öğrencisi, Haziran 2027'de mezun oluyor.
- Odak alanı: backend development ve cloud architecture (API geliştirme, serverless mimari, veritabanı yönetimi).
- Mevcut portföy: 3 adet AWS serverless projesi (Lambda, DynamoDB, SQS/SNS/EventBridge, API Gateway, Cognito, CloudWatch/X-Ray). Event-driven serverless mimaride deneyimli.
- **Bu projenin amacı portföydeki şu boşlukları kapatmak:**
  1. Container tabanlı compute deneyimi yok (ECS/AKS/Container Apps hiç kullanmadı)
  2. Gerçek VPC/VNet, private subnet, network izolasyonu çalışması yok
  3. Streaming/queue-ağırlıklı derin bir iş akışı yok
- İkinci amaç: AWS bilgisini Azure'a taşıyarak "cloud-agnostic" bir profil oluşturmak. Her Azure servisini öğrenirken AWS muadiliyle karşılaştırmalı anlat (ör. "Service Bus ≈ SQS", "Cosmos DB ≈ DynamoDB").
- Bütçe: Azure for Students aboneliği, ~$100 kredi, 1 yıl geçerli. **Maliyet bilinci önemli** — her servis seçiminde ücretsiz tier / düşük maliyetli seçenekleri tercih et, kredi tüketen kaynakları (ör. sürekli çalışan container, provisioned throughput) minimumda tut.
- Süre: ~30-40 gün aktif geliştirme. Kapsam disiplini kritik — MVP dışına taşma.
- İletişim dili: Türkçe (teknik terimler İngilizce kalabilir). Öğretici bir ton kullan: kararların "neden"ini açıkla, çünkü bu proje aynı zamanda bir öğrenme projesi ve mülakatlarda savunulacak.

## Ürün Tanımı

**Problem:** Şirketlere (muhasebe ofisleri, KOBİ'ler, hukuk büroları) her gün fatura, fiş, sözleşme, dekont gibi belgeler PDF/görsel olarak gelir. Bunlardan veri çıkarma işi elle yapılır: aç, oku, Excel'e gir.

**Çözüm:** Belge yükle → sistem async olarak işlesin (OCR + AI ile yapılandırılmış veri çıkarımı) → dakikalar içinde aranabilir, filtrelenebilir yapılandırılmış veri.

**Uçtan uca akış:**
1. Kullanıcı belgeyi API üzerinden yükler → Blob Storage'a yazılır
2. API hemen `202 Accepted` + tracking ID döner; iş Service Bus kuyruğuna düşer
3. Container worker mesajı alır: belgeden metin çıkarımı → AI çağrısı ile yapılandırılmış alan çıkarımı (belge tipi, tarih, tutar, taraflar, kısa özet)
4. Sonuç Cosmos DB'ye yazılır; işlem tamamlanınca Event Grid üzerinden bildirim tetiklenir (e-posta/webhook)
5. Kullanıcı API/panel üzerinden işlenmiş belgelerini sorgular ("Mart ayındaki 5000 TL üstü faturalar")

AI çağrısının kuyruğun arkasında olması bilinçli bir mimari karar: AI yavaş ve pahalı bir işlemdir, senkron API isteğinde bekletilmez.

## Hedef Mimari (Azure Servisleri ve Rolleri)

| Servis | Rol | AWS Muadili |
|---|---|---|
| Azure Functions (**Consumption**) | HTTP API katmanı (upload endpoint, sorgu endpoint'leri, status endpoint) | Lambda |
| Azure Container Apps | Belge işleme worker'ı (OCR + AI pipeline). AKS bilinçli olarak kullanılmıyor (fazla ağır) | ECS Fargate |
| Azure Container Registry (**Basic**) | Worker image deposu. ⚠️ **Sabit ~$5/ay — kullanım bazlı DEĞİL.** Bkz. Maliyet Disiplini | ECR |
| Blob Storage | Ham belge dosyaları | S3 |
| Cosmos DB (serverless mod) | İşlenmiş belge metadata'sı ve çıkarılan alanlar. Partition key tasarımına özen göster | DynamoDB |
| Service Bus (**Basic**) | İşleme kuyruğu (queue), dead-letter queue dahil | SQS + DLQ |
| Event Grid | "Belge işlendi" event'leri → bildirim akışı | EventBridge/SNS |
| Application Insights + Log Analytics | Logging, tracing, correlation ID'ler | CloudWatch + X-Ray |
| VNet + Private Endpoint | Worker ↔ Cosmos/Blob trafiğini private ağa alma (v1'in sonunda eklenecek, önce çalışan sistem). ⚠️ Endpoint başına ~$7-8/ay | VPC + VPC Endpoint |
| Entra External ID (**opsiyonel/v1 sonu**) | Kullanıcı auth. Azure AD B2C **kapandı** (Mayıs 2025, yeni müşterilere açık değil) — halefi budur. v1'de zaman kalırsa; kalmazsa Function key yeterli | Cognito |
| AI: dış API (Gemini Flash / Claude Haiku) | Yapılandırılmış veri çıkarımı. `Extractor` interface'i arkasına koy, sağlayıcı takas edilebilir olsun | — |

## Maliyet Disiplini (kredi: ~$100 / 1 yıl)

**Claude için kural:** Maliyet doğuran bir kaynak eklemeden **önce** uyar. Şunu söyle: tahmini aylık tutar, **kullanım bazlı mı yoksa sabit mi**, ve varsa **ücretsiz alternatifi**. Sabit ücretli (idle'da bile işleyen) bir kaynak ekliyorsan bunu ayrıca vurgula — kredinin asıl düşmanı bunlar, kullanım bazlı olanlar değil.

### Kaynak bazında durum

| Kaynak | Model | Beklenen | Ücretsiz/ucuz alternatif |
|---|---|---|---|
| Functions (Consumption) | Kullanım | ~$0 (ücretsiz grant) | — |
| Container Apps | Kullanım, **scale-to-zero** | ~$0 idle; ayda ~180K vCPU-sn ücretsiz | — |
| Cosmos DB serverless | Kullanım | ~$0 (düşük hacim) | — |
| Service Bus Basic | Kullanım | ~$0.05/milyon mesaj | — |
| Blob Storage | Kullanım | Sent'ler | — |
| App Insights / Log Analytics | Kullanım | ~$0 (ayda 5 GB ingest ücretsiz) | Log'ları gereksiz şişirme |
| Document Intelligence **F0** | Ücretsiz tier | $0 (500 sayfa/ay) | — |
| Event Grid | Kullanım | ~$0 (100K işlem/ay ücretsiz) | — |
| **ACR Basic** | **SABİT ~$5/ay** | Kullansan da kullanmasan da işler | **ghcr.io** (public image, $0) — Container Apps oradan da çekebilir |
| **Private Endpoint** | **SABİT ~$7-8/ay/adet** | Hafta 4'te eklenecek | Service endpoint / firewall kuralı (daha zayıf izolasyon ama $0) |
| LLM API (dış) | Kullanım | En büyük değişken kalem | Ucuz model seç (Gemini Flash / Haiku); **idempotency ile tekrar çağrıyı engelle** |

### ASLA kurulmayacaklar (kredi katilleri)

- **Functions Premium / EP1 plan (~$150/ay)** — VNet entegrasyonu için bile kurma. Gerekirse Flex Consumption'ı değerlendir.
- **Service Bus Premium (~$668/ay)** — private endpoint için gerekir; bu yüzden **Service Bus'a private endpoint yok**, Basic'te kal.
- **Cosmos DB provisioned throughput** — serverless dışına çıkma.
- **AKS** — zaten kapsam dışı.
- **APIM Developer/Standard tier** — sabit aylık ücretli.

### v1 bittikten sonra `terraform destroy` edilecekler

Çalıştığı belgelendikten (ekran görüntüsü + README) sonra kapatılacak sabit ücretli kaynaklar:
- Private Endpoint'ler (~$7-8/ay/adet)
- ACR (~$5/ay) — image'lar gerekirse ghcr.io'ya taşınır

### Güvenlik ağı

Azure Cost Management'ta **budget alert** ($20 / $50 / $80 eşiklerinde e-posta) kurulu olmalı — AWS Billing Alarm muadili. Yukarıdaki tüm disiplinin son savunma hattı budur.

## MVP Kapsamı (v1 — bunun dışına çıkma)

- Tek belge tipi ailesiyle başla: **fatura/fiş** (tarih, tutar, satıcı, belge no çıkarımı)
- Tek kullanıcılı düşünme ama multi-tenant'a uygun veri modeli kur (partition key'de userId/tenantId)
- Endpoint'ler: upload, status (tracking ID ile), belge listesi + basit filtreleme (tarih aralığı, tutar, belge tipi), belge detayı
- Bildirim: tek kanal yeterli (e-posta veya webhook, hangisi kolaysa)
- Frontend: v1'de YOK ya da en fazla minimal bir test arayüzü. Bu bir backend projesi.
- Testler: worker'ın iş mantığı ve API endpoint'leri için unit test; kritik akış için 1-2 integration test. **Sonraya bırakılmaz** — ilk test, `Extractor` interface'i yazıldığı gün (Hafta 2) gelir. Zaman daralınca ilk kesilen şey testler olur; bunu engellemek için kodla aynı anda yaz.

## Bilinçli Olarak Kapsam Dışı (v2+ fikirleri, v1'de yapma)

- **API Management (APIM)** — v1'den çıkarıldı. Gerekçe: projenin kapatmak istediği üç portföy boşluğunun (container, VNet, queue) **hiçbirine** hizmet etmiyor ve sahibin API Gateway deneyimi zaten var, yani öğrenme değeri düşük. Rate limiting ihtiyacı v1'de Function key + (gerekirse) kod içi basit throttle ile karşılanır. Yerine kazanılan zaman **DLQ/operasyon derinliğine** yatırıldı (aşağıya bak).
- Çoklu belge tipi (sözleşme, dekont analizi)
- RAG / belge içinde semantik arama (sahibin başka bir projesi zaten RAG odaklı)
- Gerçek zamanlı panel, websocket
- Ödeme/faturalandırma, gerçek SaaS operasyonları
- Kubernetes/AKS

## Öncelik Sırası (zaman daralırsa kesme sırası)

Üç portföy boşluğuna (container / VNet / queue) hizmet **etmeyen** işler önce kesilir:

1. **İlk kesilecek:** APIM (zaten çıkarıldı)
2. **Sonra:** Auth / Entra External ID → yerine Function key, README'de "auth v2" notu
3. **Asla kesilme:** Container Apps + KEDA, VNet + Private Endpoint, Service Bus derinliği (DLQ, idempotency, retry)

## Geliştirme İlkeleri

- **Önce çalışan uçtan uca iskelet** (upload → queue → worker stub → Cosmos'a yaz → sorgula), sonra adım adım derinleştir (önce OCR, sonra AI, sonra bildirim, en son VNet).
- **Idempotency baştan düşünülür.** Service Bus **at-least-once** teslimat yapar: worker Cosmos'a yazıp mesajı `complete` etmeden çökerse mesaj tekrar gelir. AI çağrısı devreye girdiğinde her tekrar teslimat = yeni LLM çağrısı = para (ve `max_delivery_count: 5` ile bu 5'e kadar çıkabilir). Worker, işe başlamadan kaydın durumunu kontrol etmeli (zaten `processed` ise atla). Bu aynı zamanda "queue derinliği" portföy boşluğunun mülakatta en çok sorulan parçası.
- IaC kullan: Bicep veya Terraform (sahibin Terraform deneyimi var, tercih onun). Portala tıklayarak kaynak oluşturma kalıcı olmasın.
- CI/CD: GitHub Actions (sahibi OIDC ile AWS'de kurmuştu, Azure'da da benzerini kur).
- Structured logging + correlation ID'ler baştan itibaren (sahibin AWS projelerindeki alışkanlığı).
- Secrets asla koda gömülmez: Key Vault veya en azından app settings.
- Her önemli mimari kararda kısa bir "neden" notu bırak (ADR tarzı, README'de bir bölüm yeter) — mülakat hazırlığının parçası.
- README İngilizce yazılacak (portföy görünürlüğü için); mimari diyagram içermeli.
