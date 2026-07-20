resource "azurerm_resource_group" "main" {
    name = "rg-docflow-dev"
    location = "germanywestcentral"
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
  name                = "document-processing"
  namespace_id        = azurerm_servicebus_namespace.main.id
  max_delivery_count  = 5
}