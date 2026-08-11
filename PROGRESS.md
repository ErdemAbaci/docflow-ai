# DocFlow — İlerleme Kaydı

> Bu dosya, ROADMAP.md'deki plana göre neyin bitip neyin bitmediğini takip eder.
> Son güncelleme: Hafta 2 — OCR + LLM alan çıkarımı bağlandı.

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
- [x] **Terraform: Container App'e yeni secret/env'ler eklendi** (henüz apply edilmedi, ACR/Container App şu an kapalı) — `NVIDIA_API_KEY/URL`, `DOCUMENT_INTELLIGENCE_ENDPOINT/KEY`, `DOCUMENTS_STORAGE_CONNECTION_STRING/CONTAINER_NAME`. `infra/variables.tf` + `infra/terraform.tfvars` (gitignore'da) eklendi — NVIDIA key Terraform kaynağından türetilemeyen tek dış sır.
- [ ] **Hata yönetimi** — LLM/OCR hatası şu an sadece `processError`'a düşüyor, `status: "failed"` yazılmıyor. Henüz yapılmadı.
- [ ] Worker unit testleri (LLM mock'lu)
- [ ] Managed identity + Key Vault (ADR-4)

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
- **Connection string ile kimlik doğrulama** — Hafta 2'de managed identity'ye geçilecek (ADR-4, CLAUDE.md'nin "secrets Key Vault'a" ilkesi).

## Sırada (öncelik sırasıyla)

1. **Hata yönetimi** — LLM/OCR hatasında `status: "failed"` + neden Cosmos'a; max delivery count dolunca DLQ davranışını gözlemlemek
2. **Worker unit testleri** — `Extractor` mock'lanarak, gerçek API'ye para/istek harcamadan
3. **Managed identity + Key Vault** (ADR-4) — connection string/admin key yerine identity
4. **Azure'a tekrar deploy** — ACR + Container App'i aç, yeni image'ı (openai/storage-blob/document-intelligence bağımlılıklarıyla) push et, uçtan uca Azure'da test et, sonra yine kapat
