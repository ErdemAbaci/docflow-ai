output "storage_connection_string" {
  value     = azurerm_storage_account.documents.primary_connection_string
  sensitive = true
}

output "cosmos_endpoint" {
  value = azurerm_cosmosdb_account.main.endpoint
}

output "cosmos_primary_key" {
  value     = azurerm_cosmosdb_account.main.primary_key
  sensitive = true
}

output "servicebus_connection_string" {
  value     = azurerm_servicebus_namespace.main.default_primary_connection_string
  sensitive = true
}

output "application_insights_connection_string" {
  value     = azurerm_application_insights.main.connection_string
  sensitive = true
}

output "acr_login_server" {
  value = azurerm_container_registry.main.login_server
}

output "document_intelligence_endpoint" {
  value = azurerm_cognitive_account.document_intelligence.endpoint
}

output "document_intelligence_key" {
  value     = azurerm_cognitive_account.document_intelligence.primary_access_key
  sensitive = true
}