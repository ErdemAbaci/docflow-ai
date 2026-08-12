data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "main" {
  name     = "rg-docflow-dev"
  location = "germanywestcentral"
}

# Worker'ın Azure kaynaklarına key/connection-string yerine kimlik (RBAC) ile
# erişmesi için kullanılan identity. User-assigned seçildi (system-assigned değil)
# çünkü aşağıdaki role assignment'lar bu identity'nin principal_id'sine ihtiyaç
# duyuyor — system-assigned kullansaydık identity, container app'in kendisiyle
# aynı anda oluşurdu ve "önce container app var olsun, sonra ona rol ata, ama
# container app'in secret'ı zaten o role ihtiyaç duyuyor" gibi bir döngüye
# girerdik. Ayrı bir kaynak olduğu için önce o, sonra rol atamaları, en son
# container app bu identity'yi referans alacak şekilde sırayla kurulabiliyor.
resource "azurerm_user_assigned_identity" "worker" {
  name                = "id-docflow-worker"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
}

resource "random_string" "storage_suffix" {
  length  = 6
  special = false
  upper   = false
}

resource "azurerm_storage_account" "documents" {
  name                     = "docflow${random_string.storage_suffix.result}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_storage_container" "documents" {
  name                  = "documents"
  storage_account_id    = azurerm_storage_account.documents.id
  container_access_type = "private"
}

resource "azurerm_servicebus_namespace" "main" {
  name                = "sb-docflow-${random_string.storage_suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
}

resource "azurerm_servicebus_queue" "document_processing" {
  name               = "document-processing"
  namespace_id       = azurerm_servicebus_namespace.main.id
  max_delivery_count = 5
}

resource "azurerm_cosmosdb_account" "main" {
  name                = "cosmos-docflow-${random_string.storage_suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  consistency_policy {
    consistency_level = "Session"
  }

  capabilities {
    name = "EnableServerless"
  }

  geo_location {
    location          = azurerm_resource_group.main.location
    failover_priority = 0
  }
}

resource "azurerm_cosmosdb_sql_database" "main" {
  name                = "docflow"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
}

resource "azurerm_cosmosdb_sql_container" "documents" {
  name                = "documents"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/tenantId"]
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-docflow-${random_string.storage_suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_application_insights" "main" {
  name                = "appi-docflow-${random_string.storage_suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "Node.JS"
}

resource "azurerm_container_registry" "main" {
  name                = "docflowacr${random_string.storage_suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = true
}

resource "azurerm_container_app_environment" "main" {
  name                       = "cae-docflow-${random_string.storage_suffix.result}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
}

resource "azurerm_container_app" "worker" {
  name                         = "ca-docflow-worker"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.worker.id]
  }

  # ACR'den image çekebilmek için kimlik bilgileri
  registry {
    server               = azurerm_container_registry.main.login_server
    username             = azurerm_container_registry.main.admin_username
    password_secret_name = "acr-password"
  }

  # Hassas değerler: şifreli saklanır, aşağıda isimle referans verilir
  secret {
    name  = "acr-password"
    value = azurerm_container_registry.main.admin_password
  }

  # Worker artık Cosmos/Storage/Document Intelligence'a managed identity ile
  # bağlanıyor (aşağıdaki env'lerde COSMOS_KEY vb. yok). "servicebus-connection"
  # sadece KEDA'nın kuyruk derinliğini ölçmesi için hâlâ gerekli — o ayrı bir
  # katman (Container Apps platformu), worker kodunun kendisi değil.
  secret {
    name  = "servicebus-connection"
    value = azurerm_servicebus_namespace.main.default_primary_connection_string
  }

  # Diğer secret'ların aksine bu, Azure kaynağı değil dış bir servisin sırrı —
  # RBAC'in koruyamayacağı bir değer. O yüzden doğrudan değer yerine Key Vault'a
  # referans veriyoruz; worker koduna hiçbir değişiklik gerekmiyor, Container
  # Apps değeri çalışma zamanında Key Vault'tan çekip aynı env var'a koyuyor.
  secret {
    name                = "nvidia-api-key"
    key_vault_secret_id = azurerm_key_vault_secret.nvidia_api_key.versionless_id
    identity            = azurerm_user_assigned_identity.worker.id
  }

  template {
    min_replicas = 0
    max_replicas = 3

    container {
      name   = "worker"
      image  = "${azurerm_container_registry.main.login_server}/docflow-worker:v1"
      cpu    = 0.25
      memory = "0.5Gi"

      # Managed identity hangi kimlik olduğunu bilsin diye — birden fazla
      # identity bağlanma ihtimaline karşı DefaultAzureCredential'ın doğru
      # user-assigned identity'yi seçmesini garantiliyor.
      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.worker.client_id
      }

      env {
        name  = "COSMOS_ENDPOINT"
        value = azurerm_cosmosdb_account.main.endpoint
      }

      env {
        name  = "COSMOS_DATABASE"
        value = azurerm_cosmosdb_sql_database.main.name
      }

      env {
        name  = "COSMOS_CONTAINER"
        value = azurerm_cosmosdb_sql_container.documents.name
      }

      env {
        name  = "SERVICEBUS_NAMESPACE"
        value = "${azurerm_servicebus_namespace.main.name}.servicebus.windows.net"
      }

      env {
        name  = "SERVICEBUS_QUEUE_NAME"
        value = azurerm_servicebus_queue.document_processing.name
      }

      env {
        name        = "NVIDIA_API_KEY"
        secret_name = "nvidia-api-key"
      }

      env {
        name  = "NVIDIA_API_URL"
        value = var.nvidia_api_url
      }

      env {
        name  = "DOCUMENT_INTELLIGENCE_ENDPOINT"
        value = azurerm_cognitive_account.document_intelligence.endpoint
      }

      env {
        name  = "DOCUMENTS_STORAGE_ACCOUNT_URL"
        value = azurerm_storage_account.documents.primary_blob_endpoint
      }

      env {
        name  = "DOCUMENTS_CONTAINER_NAME"
        value = azurerm_storage_container.documents.name
      }
    }

    # KEDA: kuyruktaki mesaj sayısına göre 0 ↔ 3 replica
    custom_scale_rule {
      name             = "servicebus-queue"
      custom_rule_type = "azure-servicebus"

      metadata = {
        queueName    = azurerm_servicebus_queue.document_processing.name
        messageCount = "1"
      }

      authentication {
        secret_name       = "servicebus-connection"
        trigger_parameter = "connection"
      }
    }
  }
}

resource "azurerm_cognitive_account" "document_intelligence" {
  name                = "docflow-di-${random_string.storage_suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  kind                = "FormRecognizer"
  sku_name            = "F0"
}

# --- Managed Identity + Key Vault ---
# Amaç: Azure kaynaklarına (Cosmos, Storage, ACR, Service Bus, Document
# Intelligence) worker'ın key/connection-string yerine yukarıdaki
# azurerm_user_assigned_identity ile, RBAC üzerinden erişmesi. Kullanım
# ücret bazlı, sabit maliyet yok.
#
# NOT: Aşağıdaki azurerm_role_assignment / azurerm_cosmosdb_sql_role_assignment
# kaynakları worker koduna kimlik tabanlı auth (DefaultAzureCredential) henüz
# eklenmediği için şu an "hazırlık" niteliğinde — worker hâlâ üstteki
# cosmos-key/servicebus-connection/storage-connection secret'larını kullanıyor.
# Kod tarafı değişince bu secret/env blokları kaldırılacak.

resource "azurerm_key_vault" "main" {
  name                       = "kv-docflow-${random_string.storage_suffix.result}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  purge_protection_enabled   = false # dev ortamı, aç/kapa disiplinine uysun diye kolay silinebilir olmalı
}

# Bu Terraform komutu hiçbir sır değerini okuyup başka bir dosyaya yazmıyor —
# sadece var.nvidia_api_key'i (terraform.tfvars'tan) Key Vault kaynağına
# referans veriyor; apply'ı hâlâ sen çalıştırıyorsun.
resource "azurerm_key_vault_secret" "nvidia_api_key" {
  name         = "nvidia-api-key"
  value        = var.nvidia_api_key
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.terraform_keyvault_admin]
}

# Terraform'u çalıştıran kullanıcı/servis principal'ının Key Vault'a secret
# yazabilmesi için (RBAC modunda access policy yok, rol ataması gerekiyor).
resource "azurerm_role_assignment" "terraform_keyvault_admin" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_role_assignment" "worker_keyvault_secrets" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.worker.principal_id
}

resource "azurerm_role_assignment" "worker_acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.worker.principal_id
}

# Aşağıdaki roller hem worker'ın gerçek (Azure'daki) kimliğine hem de
# Terraform'u çalıştıran senin kendi Azure AD kullanıcına veriliyor — ikincisi
# olmadan `az login` ile lokal test (npm run dev, e2e-test.ts) artık key
# olmadığı için kimlik doğrulayamaz ama yetkisiz kalırdı.
locals {
  worker_and_local_dev_principals = toset([
    azurerm_user_assigned_identity.worker.principal_id,
    data.azurerm_client_config.current.object_id,
  ])
}

resource "azurerm_role_assignment" "worker_storage_blob" {
  for_each             = local.worker_and_local_dev_principals
  scope                = azurerm_storage_account.documents.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = each.value
}

resource "azurerm_role_assignment" "worker_servicebus" {
  for_each             = local.worker_and_local_dev_principals
  scope                = azurerm_servicebus_namespace.main.id
  role_definition_name = "Azure Service Bus Data Receiver"
  principal_id         = each.value
}

resource "azurerm_role_assignment" "worker_document_intelligence" {
  for_each             = local.worker_and_local_dev_principals
  scope                = azurerm_cognitive_account.document_intelligence.id
  role_definition_name = "Cognitive Services User"
  principal_id         = each.value
}

# Cosmos DB'nin data-plane erişimi normal Azure RBAC'tan ayrı, kendi rol
# sistemini kullanır — bu yüzden azurerm_role_assignment değil, bu özel
# kaynak gerekiyor. "00000000-0000-0000-0000-000000000002" Azure'ın
# built-in "Cosmos DB Built-in Data Contributor" rolünün sabit ID'si.
resource "azurerm_cosmosdb_sql_role_assignment" "worker" {
  for_each            = local.worker_and_local_dev_principals
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  role_definition_id  = "${azurerm_cosmosdb_account.main.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  principal_id        = each.value
  scope               = azurerm_cosmosdb_account.main.id
}