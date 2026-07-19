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
| Azure Functions | HTTP API katmanı (upload endpoint, sorgu endpoint'leri, status endpoint) | Lambda |
| Azure Container Apps | Belge işleme worker'ı (OCR + AI pipeline). AKS bilinçli olarak kullanılmıyor (fazla ağır) | ECS Fargate |
| Blob Storage | Ham belge dosyaları | S3 |
| Cosmos DB (serverless mod) | İşlenmiş belge metadata'sı ve çıkarılan alanlar. Partition key tasarımına özen göster | DynamoDB |
| Service Bus | İşleme kuyruğu (queue), dead-letter queue dahil | SQS + DLQ |
| Event Grid | "Belge işlendi" event'leri → bildirim akışı | EventBridge/SNS |
| API Management (Consumption tier) | API gateway, rate limiting | API Gateway |
| Azure AD B2C | Kullanıcı auth | Cognito |
| Application Insights | Logging, tracing, correlation ID'ler | CloudWatch + X-Ray |
| VNet + Private Endpoint | Worker ↔ Cosmos/Blob trafiğini private ağa alma (v1'in sonunda eklenecek, önce çalışan sistem) | VPC + VPC Endpoint |
| AI: Azure OpenAI **veya** dış API (Gemini/Claude) | Yapılandırılmış veri çıkarımı. Seçim maliyete göre birlikte yapılacak | — |

## MVP Kapsamı (v1 — bunun dışına çıkma)

- Tek belge tipi ailesiyle başla: **fatura/fiş** (tarih, tutar, satıcı, belge no çıkarımı)
- Tek kullanıcılı düşünme ama multi-tenant'a uygun veri modeli kur (partition key'de userId/tenantId)
- Endpoint'ler: upload, status (tracking ID ile), belge listesi + basit filtreleme (tarih aralığı, tutar, belge tipi), belge detayı
- Bildirim: tek kanal yeterli (e-posta veya webhook, hangisi kolaysa)
- Frontend: v1'de YOK ya da en fazla minimal bir test arayüzü. Bu bir backend projesi.
- Testler: worker'ın iş mantığı ve API endpoint'leri için unit test; kritik akış için 1-2 integration test

## Bilinçli Olarak Kapsam Dışı (v2+ fikirleri, v1'de yapma)

- Çoklu belge tipi (sözleşme, dekont analizi)
- RAG / belge içinde semantik arama (sahibin başka bir projesi zaten RAG odaklı)
- Gerçek zamanlı panel, websocket
- Ödeme/faturalandırma, gerçek SaaS operasyonları
- Kubernetes/AKS

## Geliştirme İlkeleri

- **Önce çalışan uçtan uca iskelet** (upload → queue → worker stub → Cosmos'a yaz → sorgula), sonra adım adım derinleştir (önce OCR, sonra AI, sonra bildirim, en son VNet).
- IaC kullan: Bicep veya Terraform (sahibin Terraform deneyimi var, tercih onun). Portala tıklayarak kaynak oluşturma kalıcı olmasın.
- CI/CD: GitHub Actions (sahibi OIDC ile AWS'de kurmuştu, Azure'da da benzerini kur).
- Structured logging + correlation ID'ler baştan itibaren (sahibin AWS projelerindeki alışkanlığı).
- Secrets asla koda gömülmez: Key Vault veya en azından app settings.
- Her önemli mimari kararda kısa bir "neden" notu bırak (ADR tarzı, README'de bir bölüm yeter) — mülakat hazırlığının parçası.
- README İngilizce yazılacak (portföy görünürlüğü için); mimari diyagram içermeli.
