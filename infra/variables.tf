# Terraform kaynaklarından türetilemeyen dış sır — build.nvidia.com'dan alınan
# API key. terraform.tfvars'ta doldurulur (o dosya .gitignore'da).
variable "nvidia_api_key" {
  description = "NVIDIA NIM API key (LLM alan çıkarımı için, build.nvidia.com)"
  type        = string
  sensitive   = true
}

variable "nvidia_api_url" {
  description = "NVIDIA NIM OpenAI-compatible API base URL"
  type        = string
  default     = "https://integrate.api.nvidia.com/v1"
}

# Yerel geliştiricinin (senin) Azure AD object ID'si. RBAC atamalarında
# data.azurerm_client_config.current.object_id yerine bunu kullanıyoruz:
# o data source "Terraform'u şu an kim çalıştırıyorsa o" demek — CI (GitHub
# Actions) Terraform'u çalıştırmaya başladığında bu, senin kimliğin yerine
# CI'nın kimliğine kayar ve yerel npm run dev / DLQ script'lerin RBAC
# yetkisini kaybeder. Bul: az ad signed-in-user show --query id -o tsv
variable "local_dev_principal_id" {
  description = "Yerel geliştiricinin Azure AD object ID'si (terraform.tfvars'ta doldurulur)"
  type        = string
}
