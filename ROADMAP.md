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
| Image registry | ACR Basic (~$5/ay **sabit**) | Azure-native yol; managed identity ile pull senaryosu ADR-4'e bağlanıyor. Ücretsiz alternatif ghcr.io ama Azure öğrenmesi kaybolur. **v1 sonunda destroy edilecek** |
| API Gateway katmanı | **APIM kullanılmıyor** | Üç portföy boşluğunun hiçbirine hizmet etmiyor + API Gateway deneyimi zaten var (öğrenme değeri düşük). Rate limit gerekirse Function key / kod içi throttle. Kazanılan zaman DLQ-operasyon derinliğine gitti |
| Auth | Entra External ID — **opsiyonel, tampona alındı** | B2C kapandı (Mayıs 2025); External ID ilk 50K MAU ücretsiz ama dokümantasyonu karışık ve Cognito deneyimi zaten var. v1'de Function key yeterli |

---

## Hafta 0 — Hazırlık (1-2 gün)

- [ ] 🔴 **YAPILMADI — ÖNCELİKLİ:** Azure Cost Management'ta **budget alert** kur ($20 / $50 / $80 eşiklerinde e-posta) — AWS Billing Alarm muadili. 5 dakikalık iş, tüm maliyet disiplininin son savunma hattı. Sabit ücretli kaynaklar (ACR, private endpoint) girmeden önce kurulmalı.
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
  - Gerekenler sırayla: Dockerfile (multi-stage, monorepo `@docflow/shared` yüzünden build context = repo kökü) → **ACR Basic** (💰 sabit ~$5/ay, budget alert'ten sonra kur) → Container Apps Environment → Container App + KEDA scaler
  - App Insights connection string'ini worker'a burada bağla (altyapısı hazır, kod bağlantısı eksik)

**Hafta sonu kontrol:** `curl` ile PDF yükle → birkaç saniye sonra status endpoint'i `processed` dönsün.

## Hafta 2 — Gerçek İşleme: OCR + AI

- [x] **Metin çıkarımı:** Azure AI Document Intelligence (Textract muadili), **F0 ücretsiz tier** (500 sayfa/ay). `prebuilt-invoice` yerine bilinçli olarak **`prebuilt-read`** seçildi (düz OCR): alan çıkarımını LLM katmanının yapması sözleşmeyi (`Extractor.extract(text: string)`) net tutuyor, iki katmanın işi çakışmıyor. `ocrService.ts` + `blobService.ts` yazıldı, gerçek bir PDF ile blob→OCR akışı uçtan uca test edildi.
- [x] **AI alan çıkarımı/normalizasyon:** Sağlayıcı olarak **NVIDIA NIM** (`build.nvidia.com`, ücretsiz endpoint, `nvidia/nemotron-3-nano-30b-a3b`, OpenAI-compatible) seçildi — Gemini/Claude'a hiç dokunmadan `Extractor` interface'i (`@docflow/shared`) arkasında, `nvidiaExtractor.ts` olarak yazıldı. Gerçek API çağrısıyla test edildi; ilk denemede `amount` alanı yanlış rakamı (ara toplam) seçtiği görüldü, sistem promptuna "vergiler dahil genel toplam" kuralı eklenince düzeldi. `index.ts`'e bağlandı: blob indir → OCR → LLM → Cosmos'a yaz zinciri uçtan uca (gerçek bir test faturasıyla) doğrulandı → **ADR-3** (neden AI kuyruğun arkasında + neden dış API + neden prebuilt-read)
- [x] 💰 **Idempotency (LLM çağrısından ÖNCE yapıldı):** Worker artık işe başlamadan `getDocument()` ile kaydı okuyor, `status === "processed"` ise atlayıp erken çıkıyor (LLM/stub'a hiç girmiyor). Service Bus'a elle duplicate mesaj basılarak test edildi: `document_processing_skipped_already_processed` logu geldi, Cosmos `updatedAt` değişmedi — ikinci teslimat gerçekten işlenmedi.
- [ ] **Hata yönetimi:** başarısız işleme → `status: "failed"` + neden Cosmos'a; max delivery count dolunca mesaj DLQ'ya (Service Bus'ta DLQ built-in, SQS'teki gibi ayrı kuyruk kurmak gerekmez)
- [ ] **Secrets:** API anahtarları Key Vault'a; Container Apps'e **managed identity** ile bağla (IAM role muadili) → **ADR-4** (connection string yerine identity)
- [ ] Worker iş mantığı unit testleri (LLM çağrısı mock'lu — vitest/jest). ⚠️ `Extractor` interface'ini yazdığın **gün** ilk testi de yaz; sonraya bırakılan test yazılmayan testtir

## Hafta 3 — Sorgu API'si, Bildirim, Auth

- [ ] **Sorgu endpoint'leri:** `GET /documents` (tarih aralığı, min/max tutar, belge tipi filtreleri), `GET /documents/{id}`. Cosmos sorgularında partition key her zaman filtrede olsun — cross-partition query, DynamoDB Scan gibi pahalı
- [ ] **Event Grid:** worker bitince `DocumentProcessed` event'i → webhook tüketici (EventBridge/SNS muadili)
- [ ] **DLQ operasyon derinliği** (APIM'den boşalan zaman buraya): mesajı bilerek zehirle → 5 teslimattan sonra DLQ'ya düştüğünü gözlemle → DLQ'daki mesajları listeleyip yeniden işleyen küçük bir operasyon script'i/endpoint'i yaz. Bu, "queue-ağırlıklı derin iş akışı" portföy boşluğunun tam merkezi ve APIM'den çok daha iyi bir mülakat hikâyesi. Maliyeti $0.
- [ ] **Auth — Entra External ID (opsiyonel):** ücretsiz tier (ilk 50K MAU). ⚠️ **2 gün kuralı:** çözülmezse v1'i **Function key** ile koru (`authLevel: 'function'` — anonymous'tan çıkar), README'ye "auth v2" notu düş ve geç. Portföy boşluklarından hiçbirine dokunmadığı için burada inat etmeye değmez.
- [ ] Kritik akış için 1-2 integration test (upload → poll → sonuç doğrula)

> **APIM neden yok:** Karar kaydına bakın — üç portföy boşluğunun hiçbirine hizmet etmiyor, API Gateway deneyimi zaten mevcut, ve Hafta 3 zaten dolu. Rate limiting v1'de Function key ile karşılanıyor.

## Hafta 4 — Ağ İzolasyonu, CI/CD, Cila

- [ ] **VNet + Private Endpoint** (portföy boşluğu, atlanmaz): Container Apps environment'ı VNet'e al; Cosmos ve Blob'a Private Endpoint. Private DNS zone'ları burada öğren (Route 53 private hosted zone benzeri). 💰 Private Endpoint **sabit ~$7-8/ay/adet** — kur, çalıştığını belgele (ekran görüntüsü), sonra `terraform destroy` ile kapat, README'de anlat → **ADR-5**
  - 🔴 **ÇÖZÜLECEK ÇELİŞKİ — ADR-5'in asıl konusu:** Cosmos/Blob'un public erişimini tamamen kapatırsan **Functions API de dışarıda kalır ve upload endpoint'i çöker** (API de Cosmos'a ve Blob'a yazıyor). Functions **Consumption planı VNet entegrasyonunu desteklemez**; Premium/EP1 ise ~$150/ay — **kurma**. Seçenekler: (a) Functions'ı Flex Consumption planına taşı (VNet destekli + kullanım bazlı), (b) public access'i kapatmak yerine firewall/service endpoint ile kısıtla, (c) private endpoint'i sadece worker→Cosmos yolunda göster, API yolunu belgelenmiş istisna bırak. **Bu bir mimari karar — o noktada yüksek model/effort ile tartış.**
  - ⚠️ **Service Bus'a private endpoint YOK:** Basic SKU desteklemiyor, gerektirdiği Premium SKU ~$668/ay. Basic'te kal.
- [ ] **GitHub Actions + OIDC:** federated credentials ile `azure/login` (AWS OIDC kurulumunun muadili). Terraform plan/apply + Functions deploy + container image build/push
- [ ] **README (İngilizce):** mimari diyagram, ADR bölümü (5 ADR), kurulum adımları
- [ ] Tampon: geciken işler buraya taşar (muhtemel aday: auth)

---

## Maliyet Notları

Kaynakların çoğu kullanım bazlı, **ama ikisi sabit** — kredinin asıl düşmanı bunlar. Ayrımı net tut:

### Kullanım bazlı (idle'da ~$0)

| Kaynak | Model | Beklenen maliyet |
|---|---|---|
| Functions | Consumption | ~$0 (ücretsiz grant) |
| Cosmos DB | Serverless | ~$0 (düşük hacim) |
| Container Apps | Scale-to-zero | ~$0 idle; ayda ~180K vCPU-sn ücretsiz |
| Service Bus | Basic | ~$0.05/milyon mesaj |
| Blob Storage | Kullanım | Sent'ler |
| App Insights / Log Analytics | Kullanım | ~$0 (5 GB/ay ingest ücretsiz) |
| Event Grid | Kullanım | ~$0 (100K işlem/ay ücretsiz) |
| Document Intelligence | F0 | Ücretsiz (500 sayfa/ay) |
| LLM API | Kullanım bazlı | En büyük değişken kalem; ucuz model + idempotency |

### 💰 SABİT ücretli (kullanmasan da işler)

| Kaynak | Maliyet | Yıllık etkisi | Ücretsiz alternatif |
|---|---|---|---|
| **ACR Basic** | ~$5/ay | Açık unutulursa **~$60/yıl** = kredinin %60'ı | ghcr.io (public image, $0) |
| **Private Endpoint** | ~$7-8/ay/adet | 2 endpoint × 6 ay ≈ $90 | Service endpoint / firewall (zayıf izolasyon, $0) |

**Kural:** İkisi de "kur → çalıştığını belgele (ekran görüntüsü + README) → `terraform destroy`". Portföyde kanıt kalır, kredi yanmaz.

### ASLA kurma (kredi katilleri)

| Kaynak | Neden gündeme gelir | Maliyet |
|---|---|---|
| Functions Premium / EP1 | VNet entegrasyonu için (Hafta 4) | **~$150/ay** — yerine Flex Consumption |
| Service Bus Premium | Private endpoint için | **~$668/ay** — Basic'te kal, SB'ye PE yok |
| Cosmos provisioned throughput | Yanlışlıkla serverless dışına çıkmak | Saatlik sabit |
| APIM Developer/Standard | Gateway ihtiyacı | Sabit aylık — zaten kapsam dışı |
| AKS | "Kubernetes öğreneyim" | Node havuzu sürekli açık |

## En Riskli Dört Nokta

1. **Hafta 4 private endpoint ↔ Functions çelişkisi** — Cosmos/Blob public erişimi kapanınca Consumption planındaki API kırılır; çözümü ~$150/ay tuzağına girmeden bulmak gerek (bkz. Hafta 4, ADR-5). Zaman baskısı altında keşfedilecek türden, o yüzden şimdiden not edildi.
2. **Container Apps + KEDA + managed identity** üçlüsü — ilk kurulum uğraştırır; Hafta 1'de stub ile erkenden yüzleş.
3. **Kapsam kayması** — prebuilt-invoice iyi sonuç verince "başka belge tipi ekleyeyim" isteği gelecek. Gelme; v2 listesinde.
4. **Sabit ücretli kaynağı açık unutmak** — ACR + private endpoint birlikte ~$20/ay; fark edilmezse kredinin çoğunu sessizce yer. Budget alert + destroy disiplini bunun içindir.

## Zaman Daralırsa Kesme Sırası

Üç portföy boşluğuna (container / VNet / queue) hizmet **etmeyen** işler önce gider:

1. ~~APIM~~ (zaten çıkarıldı)
2. Auth / Entra External ID → Function key + "auth v2" notu
3. Event Grid bildirim akışı (queue'dan farklı bir pattern olduğu için son çare)

**Asla kesilmez:** Container Apps + KEDA scale-to-zero, VNet + Private Endpoint, Service Bus derinliği (DLQ + idempotency + retry).
