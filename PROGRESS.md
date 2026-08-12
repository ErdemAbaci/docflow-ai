# DocFlow — İlerleme Kaydı

> Bu dosya, ROADMAP.md'deki plana göre neyin bitip neyin bitmediğini takip eder.
> Son güncelleme: **Hafta 2 tamamlandı** — hata yönetimi, worker unit testleri, managed identity + Key Vault bitti.

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

## Sırada (öncelik sırasıyla) — Hafta 3

1. **Azure'a tekrar deploy** — ACR + Container App'i aç, yeni image'ı (openai/storage-blob/document-intelligence/identity bağımlılıklarıyla) push et, managed identity'li Terraform'u uçtan uca Azure'da test et, sonra yine kapat
2. **Sorgu endpoint'leri** — `GET /documents` (tarih aralığı, tutar, belge tipi filtreleri), `GET /documents/{id}`
3. **Event Grid** — worker bitince `DocumentProcessed` event'i → webhook
4. **DLQ operasyon derinliği** — mesajı bilerek zehirle → 5 teslimattan sonra DLQ'ya düştüğünü gözlemle → yeniden işleyen küçük bir script/endpoint
5. **Auth (opsiyonel, 2 gün kuralı)** — Entra External ID; çözülmezse Function key ile geç
