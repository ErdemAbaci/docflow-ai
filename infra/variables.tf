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
