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

# Managed identity geçişinden sonra worker'ın .env'inde artık key değil bu
# ikisi kullanılıyor — sır değiller, sadece hostname/URL.
output "storage_blob_endpoint" {
  value = azurerm_storage_account.documents.primary_blob_endpoint
}

output "servicebus_namespace_host" {
  value = "${azurerm_servicebus_namespace.main.name}.servicebus.windows.net"
}

output "eventgrid_topic_endpoint" {
  value = azurerm_eventgrid_topic.main.endpoint
}

# GitHub Actions OIDC secret'ları için — bunlar sır değil, sadece kimlik
# numaraları (client secret/şifre yok). GitHub repo: Settings > Secrets and
# variables > Actions altına AZURE_CLIENT_ID / AZURE_TENANT_ID /
# AZURE_SUBSCRIPTION_ID isimleriyle eklenecek.
output "ci_client_id" {
  value = azurerm_user_assigned_identity.ci.client_id
}

output "azure_tenant_id" {
  value = data.azurerm_client_config.current.tenant_id
}

output "azure_subscription_id" {
  value = data.azurerm_client_config.current.subscription_id
}