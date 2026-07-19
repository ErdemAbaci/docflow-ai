# DocFlow — MVP Geliştirme Yol Haritası

> Süre hedefi: ~1 ay (4 hafta + tampon). İlke: **önce uçtan uca çalışan iskelet, sonra adım adım derinleştirme.**
> Dil: **TypeScript** (hem Functions API hem Container Apps worker). Azure for Students aboneliği aktif (~$100 kredi).

## Karar Kaydı (Özet)

| Karar | Seçim | Neden |
|---|---|---|
| Dil | TypeScript | API + worker tek dil, tek toolchain; Node.js Azure Functions'ta birinci sınıf destekli |
| IaC | Terraform | Mevcut deneyim var; cloud-agnostic profil hedefine uygun (aynı HCL bilgisi AWS+Azure) |
| Worker compute | Container Apps (AKS değil) | KEDA ile scale-to-zero; AKS bu ölçek için fazla ağır ve pahalı |
| Cosmos DB modu | Serverless | RU provision etmez, kullanım bazlı ödeme (DynamoDB on-demand muadili) |
| AI sağlayıcı | Dış API (Gemini Flash / Claude Haiku) ile başla | Azure OpenAI erişim onayı gerektirebilir ve krediden yer; soyut arayüz arkasına koy, sonradan takas edilebilir |
| Bildirim kanalı | Webhook | E-posta (ACS) kurulumu MVP için fazla uğraş |
| Auth | Entra External ID (B2C kapandı) | Microsoft B2C'yi yeni müşterilere kapattı (Mayıs 2025); External ID ilk 50K MAU ücretsiz |

---

## Hafta 0 — Hazırlık (1-2 gün)

- [ ] Azure Cost Management'ta **budget alert** kur ($20 / $50 / $80 eşiklerinde e-posta) — AWS Billing Alarm muadili
- [ ] GitHub repo aç (`git init` + remote), temel dizin yapısı:
  ```
  /infra          → Terraform
  /src/api        → Azure Functions (TypeScript)
  /src/worker     → Container Apps worker (TypeScript + Docker)
  /tests          → unit + integration
  ```
- [ ] Araçlar: Azure CLI, Azure Functions Core Tools v4, Terraform, Docker, Node.js LTS
- [ ] TypeScript ortak ayarları: root'ta paylaşılan `tsconfig`, ESLint; API ve worker ayrı package (npm workspaces yeterli, monorepo aracı gerekmez)

## Hafta 1 — Uçtan Uca İskelet (AI'sız, "walking skeleton")

Amaç: upload → queue → worker (stub) → Cosmos → sorgu zinciri sahte veriyle bile olsa çalışsın.

- [ ] **Terraform çekirdek kaynaklar:** Resource Group, Blob Storage, Service Bus (queue; DLQ built-in gelir), Cosmos DB serverless, Application Insights
- [ ] **Cosmos veri modeli:** partition key `/tenantId`, id `documentId`. Sorguların çoğu "bu kullanıcının belgeleri" olacağı için tenant bazlı partition doğru seçim (DynamoDB PK/SK düşüncesinin aynısı). → README'ye **ADR-1** olarak yaz
- [ ] **Functions API** (Consumption plan — Lambda gibi, kullanmadıkça bedava):
  - `POST /documents` → Blob'a yaz, Cosmos'a `status: "queued"` kaydı, Service Bus'a mesaj, `202 + trackingId` dön
  - `GET /documents/{id}/status`
- [ ] **Worker stub:** Service Bus'tan mesaj al, 2 sn bekle, kaydı `status: "processed"` + sahte alanlarla güncelle. Önce lokal Docker'da Service Bus'a bağlanarak çalıştır
- [ ] **Container Apps deploy** — kritik maliyet ayarı: `minReplicas: 0` + Service Bus KEDA scaler. Kuyruk boşken container hiç çalışmaz, kredi yanmaz. (ECS Fargate'te kolay olmayan bir şey; mülakat hikâyesi) → **ADR-2**

**Hafta sonu kontrol:** `curl` ile PDF yükle → birkaç saniye sonra status endpoint'i `processed` dönsün.

## Hafta 2 — Gerçek İşleme: OCR + AI

- [ ] **Metin çıkarımı:** Azure AI Document Intelligence (Textract muadili), **F0 ücretsiz tier** (500 sayfa/ay). `prebuilt-invoice` modeli fatura alanlarını (tarih, tutar, satıcı) zaten yapılandırılmış döner
- [ ] **AI alan çıkarımı/normalizasyon:** Document Intelligence çıktısını LLM'e ver → hedef JSON şeması (belge tipi, tarih, tutar, taraflar, kısa özet). TypeScript'te `Extractor` interface'i arkasına koy; sağlayıcı (Gemini/Claude) takas edilebilir olsun → **ADR-3** (neden AI kuyruğun arkasında + neden dış API)
- [ ] **Hata yönetimi:** başarısız işleme → `status: "failed"` + neden Cosmos'a; max delivery count dolunca mesaj DLQ'ya (Service Bus'ta DLQ built-in, SQS'teki gibi ayrı kuyruk kurmak gerekmez)
- [ ] **Secrets:** API anahtarları Key Vault'a; Container Apps'e **managed identity** ile bağla (IAM role muadili) → **ADR-4** (connection string yerine identity)
- [ ] Worker iş mantığı unit testleri (LLM çağrısı mock'lu — vitest/jest)

## Hafta 3 — Sorgu API'si, Bildirim, Auth

- [ ] **Sorgu endpoint'leri:** `GET /documents` (tarih aralığı, min/max tutar, belge tipi filtreleri), `GET /documents/{id}`. Cosmos sorgularında partition key her zaman filtrede olsun — cross-partition query, DynamoDB Scan gibi pahalı
- [ ] **Event Grid:** worker bitince `DocumentProcessed` event'i → webhook tüketici (EventBridge/SNS muadili)
- [ ] **Auth — Entra External ID:** ücretsiz tier (ilk 50K MAU). ⚠️ **2 gün kuralı:** çözülmezse v1'i APIM subscription key ile koru, gerçek auth'u Hafta 4 tamponuna at
- [ ] **API Management (Consumption tier):** çağrı başına ücret, idle maliyeti yok; rate limiting policy ekle
- [ ] Kritik akış için 1-2 integration test (upload → poll → sonuç doğrula)

## Hafta 4 — Ağ İzolasyonu, CI/CD, Cila

- [ ] **VNet + Private Endpoint** (portföy boşluğu, atlanmaz): Container Apps environment'ı VNet'e al; Cosmos ve Blob'a Private Endpoint, public access kapalı. Private DNS zone'ları burada öğren (Route 53 private hosted zone benzeri). ⚠️ Private Endpoint saatlik ücretli (~$7-8/ay/endpoint) — kur, çalıştığını belgele (ekran görüntüsü), sonra istersen `terraform destroy` ile kapat, README'de anlat → **ADR-5**
- [ ] **GitHub Actions + OIDC:** federated credentials ile `azure/login` (AWS OIDC kurulumunun muadili). Terraform plan/apply + Functions deploy + container image build/push
- [ ] **README (İngilizce):** mimari diyagram, ADR bölümü (5 ADR), kurulum adımları
- [ ] Tampon: geciken işler buraya taşar (muhtemel aday: auth)

---

## Maliyet Notları

Sürekli para yakan kaynak yok — hepsi kullanım bazlı ya da ücretsiz tier:

| Kaynak | Model | Beklenen maliyet |
|---|---|---|
| Functions | Consumption | ~$0 (ücretsiz grant) |
| Cosmos DB | Serverless | ~$0 (düşük hacim) |
| Container Apps | Scale-to-zero | ~$0 idle; işleme sırasında saniye bazlı |
| Service Bus | Basic | ~$0.05/milyon mesaj |
| Document Intelligence | F0 | Ücretsiz (500 sayfa/ay) |
| APIM | Consumption | Çağrı başına, ücretsiz grant var |
| Private Endpoint | Saatlik | ~$7-8/ay/endpoint — geçici tut |
| LLM API | Kullanım bazlı | En büyük değişken kalem; ucuz model seç |

## En Riskli Üç Nokta

1. **Entra External ID / auth** — dokümantasyon karışık; 2 gün kuralını uygula.
2. **Container Apps + KEDA + managed identity** üçlüsü — ilk kurulum uğraştırır; Hafta 1'de stub ile erkenden yüzleş.
3. **Kapsam kayması** — prebuilt-invoice iyi sonuç verince "başka belge tipi ekleyeyim" isteği gelecek. Gelme; v2 listesinde.
