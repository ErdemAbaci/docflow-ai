# DocFlow — İlerleme Kaydı

> Bu dosya, ROADMAP.md'deki plana göre neyin bitip neyin bitmediğini takip eder.
> Son güncelleme: **Hafta 3 büyük ölçüde tamamlandı** — sorgu endpoint'leri, Event Grid yayınlama, DLQ operasyon derinliği bitti. Kalan: webhook aboneliği (Hafta 4'e bağımlı), auth (proje sonuna ertelendi), integration testler.

## Hafta 1 — Uçtan Uca İskelet: durum

### Tamamlanan

- [x] **Terraform temel kaynaklar** (`infra/main.tf`, gerçek Azure'da, `germanywestcentral`):
  - Resource Group (`rg-docflow-dev`)
  - Storage Account (Standard/LRS) + `documents` blob container (private)
  - Service Bus namespace (Basic SKU) + `document-processing` queue (max_delivery_count: 5, DLQ built-in)
  - Cosmos DB account (serverless capability) + `docflow` database + `documents` container
- [x] **Cosmos veri modeli kararı (ADR-1)** — partition key `/tenantId`. Plan mode'da tartışılıp karar verildi: MVP'de tek demo tenant olduğu için tüm belgeler aynı partition'a düşüyor (sorun değil, gerçek multi-tenant'a geçilince her tenant kendi partition'ını alır). Hiyerarşik key (`/tenantId + /documentType`) reddedildi, gereksiz karmaşıklık.
- [x] **Functions API** (`src/api`, TypeScript, v4 model):
  - `POST /documents` (`UploadDocument.ts`) — dosyayı Blob'a yazıyor, Cosmos'a `status: "queued"` kaydı atıyor, Service Bus'a mesaj bırakıyor, `202 + trackingId` dönüyor
  - `GET /documents/{id}/status` (`GetDocumentStatus.ts`) — Cosmos'tan point read, `200 + belge` ya da `404`
  - Structured logging (`correlationId` ile) her iki endpoint'te de var
- [x] **Worker** (`src/worker`, düz Node/TypeScript, henüz Azure Function değil):
  - Service Bus queue'dan `subscribe()` ile mesaj dinliyor
  - Her mesajda 2sn bekleyip (OCR/AI'nin yerini tutan stub) Cosmos kaydını `.patch()` ile `status: "processed"` yapıyor
  - Lokal olarak (`npm run dev`, ts-node) test edildi, uçtan uca çalıştığı Postman'de doğrulandı (`queued` → `processed`)

### Eksik (Hafta 1'i bitirmek için kalanlar)

- [x] **Application Insights altyapısı kuruldu** (Terraform, Azure'da apply edildi):
  - `azurerm_log_analytics_workspace` (asıl log deposu, PerGB2018, 30 gün retention) + `azurerm_application_insights` (workspace-based, `application_type = "Node.JS"`)
  - `application_insights_connection_string` output eklendi (sensitive)
  - **Kalan (kod bağlantısı):** connection string'i API'nin app setting'ine ve worker container'a bağlamak — Functions runtime'ı otomatik enstrümante eder, worker'da SDK/OpenTelemetry gerekecek. Container Apps adımıyla birlikte yapılacak.
- [x] **Dockerfile + lokal container testi** — worker artık container içinde çalışıyor:
  - `Dockerfile` (repo kökü, multi-stage): build aşaması `npm ci` + shared→worker sırasıyla derleme; runtime aşaması `npm ci --omit=dev` + sadece `dist/` kopyalama, `USER node`, exec-form `CMD` (scale-to-zero'da SIGTERM'in Node'a ulaşması için)
  - Build context = repo kökü (monorepo: worker `@docflow/shared`'a bağımlı)
  - `.dockerignore` — **secret'lar image'a girmiyor** (`**/.env`, `**/local.settings.json`), ayrıca host `node_modules` (yanlış platform binary'leri) hariç
  - ⚠️ Dosya adı `DockerFile` → `Dockerfile` olarak düzeltildi. macOS case-insensitive olduğu için lokalde sorun çıkarmıyordu ama Linux CI'da (`docker build`) kırılırdı.
  - Test edildi: image 310 MB, container `--env-file` ile çalıştı, API'den upload → container kuyruktan çekti → Cosmos `processed`. `correlationId` API ve container loglarında eşleşti.
- [x] **ACR + Container Apps deploy** — 💰 açıldı, test edildi, **sonra bilinçli olarak destroy edildi** (aç-dene-kapat disiplini):
  - `azurerm_container_registry` (Basic) + `azurerm_container_app_environment` + `azurerm_container_app.worker` (KEDA `custom_scale_rule`, Service Bus kuyruk uzunluğuna göre `min_replicas: 0, max_replicas: 3`)
  - Docker image amd64 platform sorunları (host arm64 → Azure amd64, attestation manifest hatası) çözüldü: `docker build --platform linux/amd64 --provenance=false`
  - Uçtan uca gerçek testte doğrulandı: API'ye upload → Azure'daki container işledi → Cosmos `processed` oldu
  - **Scale-to-zero kanıtlandı** — iş bitince Azure API'den `ScaledToZero`, 0 replika teyit edildi
  - `terraform destroy -target=azurerm_container_app.worker -target=azurerm_container_registry.main` ile kapatıldı, maliyet oluşmadığı doğrulandı. Terraform **kodu** `main.tf`'te duruyor — bir sonraki deploy'da tekrar `apply` yeterli.

## Hafta 2 — Gerçek İşleme: OCR + AI

- [x] **Idempotency** — worker işe başlamadan `getDocument()` ile kaydı okuyor, `status === "processed"` ise atlıyor. Service Bus'a elle duplicate mesaj basılarak test edildi, ikinci teslimatın gerçekten işlenmediği doğrulandı.
- [x] **OCR (Document Intelligence)** — `prebuilt-invoice` yerine bilinçli olarak **`prebuilt-read`** seçildi: `Extractor` sözleşmesini (`extract(text: string)`) net tutmak ve OCR/LLM sorumluluklarını ayrı tutmak için. `ocrService.ts` (`extractText`) + `blobService.ts` (`downloadDocument`) yazıldı, `@azure-rest/ai-document-intelligence` (yeni SDK, eski `@azure/ai-form-recognizer` değil) kullanıldı. F0 (ücretsiz) tier'da Terraform ile açıldı, `terraform plan -target` ile sadece bu kaynak açıldı — ACR/Container App tekrar açılmadı.
- [x] **LLM alan çıkarımı** — sağlayıcı: **NVIDIA NIM** (`build.nvidia.com`, ücretsiz endpoint, model: `nvidia/nemotron-3-nano-30b-a3b`, OpenAI-compatible API). `nvidiaExtractor.ts`, `Extractor` interface'ini (`@docflow/shared`) implemente ediyor. Gerçek API ile test edildi; ilk denemede `amount` alanı "ara toplam"ı seçmişti, sistem promptuna "vergiler dahil genel toplam" kuralı eklenince doğru tutarı (genel toplam) verdi.
- [x] **Uçtan uca bağlama** — `index.ts`: blob indir → OCR → LLM → `saveExtractedFields()` (Cosmos'a `documentType/issueDate/amount/currency/vendor/summary` yazan yeni fonksiyon, JSON Patch `"add"` — alanlar opsiyonel olduğu için `"replace"` ilk yazımda hata verirdi). Gerçek bir test PDF'iyle uçtan uca doğrulandı (blob yükle → indir → OCR → LLM → Cosmos'a yaz → geri oku → temizle).
- [x] **Terraform: Container App'e yeni secret/env'ler eklendi** — `NVIDIA_API_KEY/URL`, `DOCUMENT_INTELLIGENCE_ENDPOINT`, `DOCUMENTS_STORAGE_ACCOUNT_URL/CONTAINER_NAME`. `infra/variables.tf` + `infra/terraform.tfvars` (gitignore'da) eklendi — NVIDIA key Terraform kaynağından türetilemeyen tek dış sır. ACR/Container App'in kendisi hâlâ kapalı (deploy günü `apply` edilecek), ama bu blok artık managed identity'ye göre güncel.
- [x] **Hata yönetimi** — `messageHandler.ts`: zincirde bir adım (OCR/LLM/Cosmos yazımı) patlarsa `markFailed()` ile Cosmos'a `status: "failed"` + `errorReason` yazılıyor, sonra hata yeniden fırlatılıyor. Bilerek yutulmuyor — aksi halde Service Bus mesajı `complete` sayardı ve `max_delivery_count: 5` + DLQ mekanizması hiç devreye girmezdi. Her başarısız denemede `errorReason` en son hatayla güncelleniyor.
- [x] **Worker unit testleri** — iş mantığı `index.ts`'ten `messageHandler.ts`'e çıkarıldı (gerçek Azure client'larına dokunmadan test edilebilsin diye). `messageHandler.test.ts` (vitest): processed-skip, kayıt-yok-hata, başarılı-akış, hata-akışı (`markFailed` doğru `errorReason` ile çağrılıyor mu + hata yeniden fırlatılıyor mu) — 4/4 yeşil.
- [x] **Managed identity + Key Vault (ADR-4)** — worker artık Cosmos/Storage/Service Bus/Document Intelligence'a key/connection-string yerine `azurerm_user_assigned_identity` + RBAC (`azurerm_role_assignment`, Cosmos için ayrıca `azurerm_cosmosdb_sql_role_assignment`) ile bağlanıyor; kod tarafında `DefaultAzureCredential` (`@azure/identity`). NVIDIA API key (tek gerçek dış sır, RBAC'in koruyamayacağı) Key Vault'a taşındı, Container App `key_vault_secret_id` ile referans veriyor — worker koduna dokunmadan. `servicebus-connection` secret'ı istisna: KEDA'nın kuyruk derinliği ölçümü için hâlâ gerekli (worker kodu değil, Container Apps platform katmanı kullanıyor). Aynı roller lokal geliştirme için Terraform'u çalıştıran Azure AD kullanıcısına da verildi (`az login` ile test edilebilsin diye). Gerçek Azure'a karşı `e2e-test.ts` ile uçtan uca doğrulandı — key olmadan, sadece RBAC ile blob yükleme/indirme, OCR, Cosmos okuma/yazma çalıştı.

## Hafta 3 — Sorgu API'si, DLQ, Event Grid

- [x] **Sorgu endpoint'leri** — `GET /documents` (`ListDocuments.ts`) tarih aralığı/min-max tutar/belge tipi filtreleriyle, `GET /documents/{id}` (`GetDocument.ts`). `documentRepository.ts`'e eklenen `queryDocuments()`, Cosmos'un `partitionKey` sorgu seçeneğini kullanıyor — cross-partition fan-out'u asıl engelleyen bu, elle `WHERE c.tenantId = ...` yazmak değil. Gerçek Azure'a karşı test edildi: filtresiz liste, `amountMin/Max` yanlış tipte → `400`, olmayan id → `404`, ve (Event Grid testinden sonra) gerçek bir `amount` alanıyla filtreleme doğrulandı.
- [x] **Upload boyut limiti** — `UploadDocument.ts` artık 4MB üstü dosyayı `Content-Length` + gerçek buffer boyutu kontrolüyle erken reddediyor (`413`). Sebep: Document Intelligence F0 (ücretsiz) tier zaten dosya başına 4MB ile sınırlı ve çok sayfalı PDF'lerde sadece ilk 2 sayfayı işliyor; üstü zaten OCR'da patlayıp Service Bus'ı `max_delivery_count: 5` boyunca boşuna yeniden dener.
- [x] **DLQ operasyon derinliği** — üç script yazıldı (`src/worker/poison-dlq-demo.ts`, `list-dlq-demo.ts`, `redrive-dlq-demo.ts`) ve gerçek Azure Service Bus'a karşı uçtan uca çalıştırıldı:
  1. **Zehirle** — Cosmos'a var olmayan bir `blobPath`'e işaret eden sahte kayıt + Service Bus mesajı
  2. **Gözlemle** — worker 5 kez dener (`MaxDeliveryCount`), her denemede aynı hata, sonra Service Bus mesajı otomatik DLQ'ya taşıyor. `list-dlq-demo.ts` DLQ'daki mesajları `deadLetterReason` + Cosmos'taki `errorReason` ile yan yana gösteriyor.
  3. **Kurtar** — `redrive-dlq-demo.ts` DLQ'dan mesajı bulup, Cosmos'taki gerçek `blobPath`'e düzeltilmiş bir dosya yükleyip, mesajı ana kuyruğa geri gönderip DLQ'dan tamamlıyor. Worker mesajı tekrar alıp bu sefer başarıyla işledi (`status: processed`, alanlar doğru çıkarıldı).
  - **Yol boyunca bulunup düzeltilen 2 gerçek bug:** (1) `messageHandler.ts` — bazı Azure SDK hataları (`RestError`, Blob 404) `.message`'ı boş bırakıyor, `errorReason` boş kaydediliyordu; `describeError()` helper'ı `.name`/`.statusCode`'a fallback yapacak şekilde eklendi, yeni bir test yazıldı. (2) `redrive-dlq-demo.ts`'in ilk hali düzeltmeyi `trackingId` adlı bir blob'a yüklüyordu ama Cosmos'taki gerçek `blobPath` farklıydı; script Cosmos kaydını okuyup gerçek `blobPath`'i kullanacak şekilde düzeltildi.
  - **Terraform:** yerel geliştirme kimliğine (worker'ın kendisine değil — o prodüksiyonda hiç mesaj göndermiyor) Service Bus **Data Sender** rolü eklendi, bu script'lerin yerelden çalışabilmesi için.
- [x] **Event Grid — yayınlama** — `eventGridService.ts` (`EventGridPublisherClient`, `DefaultAzureCredential`, key yok) worker başarıyla işleyince `DocFlow.DocumentProcessed` event'i yayınlıyor. Yayınlama hatası ayrı bir `try/catch`'te yutulup sadece loglanıyor — belge zaten Cosmos'a yazıldı, bildirim hatası yüzünden Service Bus'ın mesajı tekrar teslim edip OCR+LLM'i boşuna tekrarlamasını istemiyoruz (worker unit testinde bu senaryo da test edildi). Terraform: `azurerm_eventgrid_topic` + worker/yerel kimliğe "EventGrid Data Sender" rolü. Gerçek Azure'a karşı uçtan uca doğrulandı (`document_processed_event_published` logu, Cosmos'ta doğru alanlar).
  - ⏸️ **Webhook aboneliği yok** — Event Grid'in event'i POST atabileceği internetten erişilebilir bir hedef gerekiyor, o da Function App'in Azure'a gerçekten deploy edilmesini gerektiriyor (Hafta 4). Şimdilik event "havaya" yayınlanıyor, kimse dinlemiyor — bu bilinçli bir ara durum.

## Maliyet güvenlik ağı

- [x] **Budget alert kuruldu** — `StudentCredit`, kapsam: Billing account, **aylık $10**, gerçekleşen + tahmini (forecast) uyarıları e-postaya gidiyor. Geçerlilik: 01.07.2026 – 30.06.2028.
  - Neden $10 doğru eşik: normal bir ay ~$0 (her şey kullanım bazlı/ücretsiz tier), ACR eklenince ~$5. Yani $10'a yaklaşmak "beklenmedik bir şey oluyor" demek. Hafta 4'te private endpoint'ler açıkken ~$20/ay olacağı için alarm çalacak — bu **istenen** davranış, o dönemin geçici olduğunu hatırlatır.
  - ⚠️ Budget alert **harcamayı durdurmaz**, sadece haber verir (AWS Budgets ile aynı). Sabit ücretli kaynakları destroy etme disiplini hâlâ senin sorumluluğunda.

## Refactor durumu (Seçenek C — sözleşmeyi paylaş)

Karar: paylaşılan pakette **sadece tipler** (`@docflow/shared`), servis implementasyonları her pakette ayrı. B (hiç paylaşma) ile C arasında C seçildi çünkü tipler runtime'da silindiği için ekstra maliyeti yok ama şema drift'ini derleyici seviyesinde önlüyor. A (tam paylaşılan repository) reddedildi — monorepo+Docker build karmaşıklığı bu ölçekte faydasından fazla.

- [x] **`@docflow/shared` paketi** — `DocumentRecord`, `DocumentStatus`, `DocumentQueueMessage` tipleri. Root workspaces'e eklendi, api+worker `"@docflow/shared": "*"` ile bağlı (npm symlink), `declaration: true` ile derleniyor.
- [x] **API refactor tamamlandı ve test edildi** (upload/status/404 davranışı korundu):
  - `src/api/src/config.ts` — env'i tek yerde okuyup doğruluyor (fail-fast), `process.env.X!` yalanları kalktı
  - `src/api/src/clients.ts` — Blob/Cosmos/Service Bus client'ları modül seviyesinde singleton
  - `src/api/src/services/documentRepository.ts` — `createDocument()`, `getDocument()`
  - `src/api/src/services/blobStorage.ts` — `uploadDocument()`
  - `src/api/src/services/queue.ts` — `enqueueDocument()` (singleton sender, artık her istekte close yok)
  - Handler'lar inceltildi: sadece HTTP tutkalı, SDK detayı yok
- [x] **Worker refactor tamamlandı ve test edildi** (queued → processed davranışı korundu):
  - `src/worker/src/config.ts` — env okuma (fail-fast), API'deki desenin aynısı
  - `src/worker/src/clients.ts` — Cosmos client + Service Bus `receiver` singleton
  - `src/worker/src/services/documentRepository.ts` — `updateStatus(trackingId, tenantId, status)` (kullanıcı yazdı, `status` parametresi hardcode yerine gerçekten kullanılacak şekilde düzeltildi)
  - `index.ts` inceldi: sadece `subscribe()` + `updateStatus()` çağrısı kaldı
  - Gerçek testte doğrulandı: upload → `correlationId` worker loglarında `trackingId` ile eşleşti, Cosmos kaydı `queued` → `processed`, `updatedAt` güncellendi

## Kalan Teknik Borç

- **`GetDocumentStatus`, Cosmos'un iç sistem alanlarını (`_rid`, `_self`, `_etag`, `_ts`) hâlâ sızdırıyor** — bir mapper/DTO ile temizlenecek. (Not: `getDocument` tipi `DocumentRecord` ama TS tipleri runtime şeklini değiştirmez, Cosmos alanları yine ekliyor.)
- **`tenantId: "demo-tenant"` her yerde hardcode** — gerçek auth (Entra External ID, Hafta 3) gelene kadar bilinçli bir sadeleştirme.
- ~~Connection string ile kimlik doğrulama~~ — çözüldü, bkz. Hafta 2 / Managed Identity + Key Vault (ADR-4).

## Sırada (öncelik sırasıyla)

1. **Worker Container App redeploy** — ACR + Container App'i aç, yeni image'ı (openai/storage-blob/document-intelligence/identity/eventgrid bağımlılıklarıyla, ve bu haftaki `messageHandler.ts`/DLQ/Event Grid değişiklikleriyle) push et, managed identity'li Terraform'u uçtan uca Azure'da test et, sonra yine kapat. Bağımsız bir iş, Hafta 4'ü beklemeden yapılabilir.
2. **Hafta 4** — VNet + Private Endpoint, GitHub Actions + OIDC (bu adımda Function App ilk kez gerçekten Azure'a deploy edilecek — o zaman Event Grid webhook aboneliği de buraya eklenecek), README (İngilizce, mimari diyagram + ADR'ler)
3. **Integration testler (1-2 tane)** — upload → poll → sonuç doğrulama, Hafta 3'ten kalan tek madde
4. **Auth (proje sonu)** — Entra External ID; kullanıcı kararıyla en sona ertelendi
