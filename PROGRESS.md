# DocFlow — İlerleme Kaydı

> Bu dosya, ROADMAP.md'deki plana göre neyin bitip neyin bitmediğini takip eder.
> Son güncelleme: Hafta 1, gün 1 sonu.

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

- [ ] **Application Insights** — henüz Terraform kaynağı yok. Şu anki structured log'lar sadece local terminal'de görünüyor, Azure'a gitmiyor. Eklenince API ve worker'daki `context.log`/`console.log` çağrıları merkezi olarak sorgulanabilir hale gelecek.
- [ ] **Worker'ı Container Apps'e deploy etmek** — şu an sadece lokal `ts-node` ile çalışıyor. Gereken: Dockerfile, Container Apps environment, `minReplicas: 0` + Service Bus KEDA scaler (ADR-2 — henüz yazılmadı).

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

1. Application Insights + Container Apps deploy ile **Hafta 1'i gerçekten kapatmak**
2. **Hafta 2** — Azure AI Document Intelligence (OCR) + AI ile yapılandırılmış veri çıkarımı, gerçek hata yönetimi/DLQ senaryosu, managed identity + Key Vault
