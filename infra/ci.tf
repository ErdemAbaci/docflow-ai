# --- CI/CD kimliği (GitHub Actions için OIDC) ---
# Amaç: GitHub Actions'ın Azure'a uzun ömürlü bir secret (client secret/şifre)
# saklamadan girebilmesi. Bunun yerine GitHub her workflow çalışmasında kısa
# ömürlü bir OIDC token üretir; Azure bu token'ı aşağıdaki federated
# credential'daki koşulla (hangi repo/branch) eşleştirip doğrular ve geçici
# erişim verir. AWS'deki iam_openid_connect_provider + IAM Role trust policy
# (token.actions.githubusercontent.com:sub koşulu) ikilisinin Azure karşılığı.
resource "azurerm_user_assigned_identity" "ci" {
  name                = "id-docflow-ci"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
}

resource "azurerm_federated_identity_credential" "ci_github_main" {
  name                = "github-main-branch"
  resource_group_name = azurerm_resource_group.main.name
  parent_id           = azurerm_user_assigned_identity.ci.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = "https://token.actions.githubusercontent.com"
  # Sadece main branch'e push'ta bu kimliğe girilebilir — başka repo/branch
  # bu token'ı kullanamaz. Format klasik "repo:owner/repo:ref:..." değil,
  # çünkü GitHub bu repo için varsayılan olarak subject'e immutable ID'leri
  # de ekliyor (repo silinip aynı isimle yeniden oluşturulursa eski
  # federated credential'ın yeni repoyu kabul etmemesi için). Doğrulama:
  # gh api repos/ErdemAbaci/docflow-ai/actions/oidc/customization/sub
  subject = "repo:ErdemAbaci@147172631/docflow-ai@1305849848:ref:refs/heads/main"
}

# Terraform'un kendi kodu role assignment / cosmos sql role assignment
# oluşturduğu için CI'ya sadece Contributor yetmiyor — kaynaklar üzerinde rol
# atayabilmesi için User Access Administrator da gerekiyor. Blast radius'u
# sınırlamak için subscription değil, sadece bu projenin resource group'u
# scope'unda.
resource "azurerm_role_assignment" "ci_contributor" {
  scope                = azurerm_resource_group.main.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.ci.principal_id
}

resource "azurerm_role_assignment" "ci_user_access_admin" {
  scope                = azurerm_resource_group.main.id
  role_definition_name = "User Access Administrator"
  principal_id         = azurerm_user_assigned_identity.ci.principal_id
}

# Sadece okuma: Terraform "plan" sırasında Key Vault'taki mevcut secret
# değerini gerçek değerle karşılaştırabilmek için okuma erişimine ihtiyaç
# duyuyor (apply/yazma değil — CI şu an hiçbir şeyi apply etmiyor).
resource "azurerm_role_assignment" "ci_keyvault_secrets_reader" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.ci.principal_id
}
