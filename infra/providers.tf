terraform {
  required_version = ">= 1.9.0"

  # State'i artık lokalde değil, ayrı bir (main uygulama kaynaklarından
  # bağımsız, hiç destroy edilmeyen) resource group'taki Storage Account'ta
  # tutuyoruz. Amaç: hem sen hem GitHub Actions (CI) aynı state'i görsün.
  # use_azuread_auth = true -> storage account key değil, RBAC (Azure AD
  # kimliği) ile erişim; storage account'ta key auth zaten tamamen kapalı.
  backend "azurerm" {
    resource_group_name  = "rg-docflow-tfstate"
    storage_account_name = "stdocflowtfstate2a04b3"
    container_name       = "tfstate"
    key                  = "docflow.tfstate"
    use_azuread_auth     = true
  }

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }

  }
}

provider "azurerm" {
  resource_provider_registrations = "none"
  features {}
}