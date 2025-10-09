# Configuração do Keycloak para ERR_TOO_MANY_REDIRECTS

## 🔴 Problema

O loop de redirect acontece quando:

- JWT callback não é chamado (login não completa)
- Cookie de sessão não é criado
- NextAuth não consegue comunicar com Keycloak

## ✅ Checklist de Configuração no Keycloak

### 1. Client ID: `access-management`

Acesse: **Clients** → `access-management` → **Settings**

#### ✅ General Settings

- **Client ID**: `access-management`
- **Name**: Application Center (ou qualquer nome)
- **Enabled**: ON ✅

#### ✅ Access Settings

- **Root URL**: `https://igrp-application-center.up.railway.app`
- **Home URL**: `https://igrp-application-center.up.railway.app`
- **Valid Redirect URIs**:
  ```
  https://igrp-application-center.up.railway.app/*
  https://apisix.zingdevelopers.com/*
  http://localhost:3000/*
  ```
- **Valid Post Logout Redirect URIs**:
  ```
  https://igrp-application-center.up.railway.app/*
  https://apisix.zingdevelopers.com/*
  http://localhost:3000/*
  ```
- **Web Origins**:
  ```
  https://igrp-application-center.up.railway.app
  https://apisix.zingdevelopers.com
  http://localhost:3000
  ```

#### ✅ Capability Config

- **Client authentication**: ON ✅
- **Authorization**: OFF (não necessário)
- **Authentication flow**:
  - ✅ Standard flow
  - ✅ Direct access grants
  - ❌ Implicit flow (não recomendado)
  - ❌ Service accounts roles (não necessário)

#### ✅ Login Settings

- **Login theme**: (deixe padrão ou escolha um tema)
- **Consent required**: OFF
- **Display client on consent screen**: OFF

### 2. Credentials

Vá para **Clients** → `access-management` → **Credentials**

- **Client Authenticator**: Client Id and Secret
- **Client Secret**: Copie este valor! ⚠️

### 3. Variáveis de Ambiente no Railway

```bash
KEYCLOAK_CLIENT_ID=access-management
KEYCLOAK_CLIENT_SECRET=seu-secret-copiado-do-keycloak
KEYCLOAK_ISSUER=https://igrp-iam-keycloak-ztlw-staging-1.up.railway.app/realms/igrp
NEXTAUTH_URL=https://igrp-application-center.up.railway.app
NEXTAUTH_SECRET=gere-uma-chave-aleatoria-forte
IGRP_APP_BASE_PATH=
```

### 4. Como Gerar NEXTAUTH_SECRET

```bash
openssl rand -base64 32
```

### 5. Verificar Logs

Após deploy, verifique os logs do Railway. Você DEVE ver:

✅ **Logs esperados no login bem-sucedido:**

```
:: NEXTAUTH DEBUG :: session { ... }
:: JWT CALLBACK - NEW SIGN IN :: { hasUser: true, hasAccount: true }
:: JWT CALLBACK - Token created: { hasAccessToken: true }
:: SESSION CALLBACK :: { hasToken: true, hasUser: true }
```

❌ **Se você vê apenas:**

```
:: AUTH REDIRECT DEBUG :: { url: '...', baseUrl: '...' }
```

Repetindo → **O Keycloak não está completando o login**

## 🔍 Debugging

### Teste 1: Verificar Issuer URL

Abra no navegador:

```
https://igrp-iam-keycloak-ztlw-staging-1.up.railway.app/realms/igrp/.well-known/openid-configuration
```

Deve retornar JSON com configurações do OpenID Connect.

### Teste 2: Verificar Client Secret

No Keycloak:

1. Clients → access-management → Credentials
2. Clique em "Regenerate Secret" se necessário
3. Copie e atualize no Railway

### Teste 3: Logs Detalhados

Os logs vão mostrar erros como:

```
:: NEXTAUTH ERROR :: OAUTH_CALLBACK_ERROR
```

Se ver este erro, há problema na comunicação com Keycloak.

## 🚨 Problemas Comuns

### 1. Client Secret Inválido

**Sintoma**: Loop de redirect, sem logs de JWT
**Solução**: Regenerar secret no Keycloak e atualizar no Railway

### 2. Redirect URI não configurada

**Sintoma**: Erro "Invalid redirect_uri" no Keycloak
**Solução**: Adicionar URLs corretas em Valid Redirect URIs

### 3. NEXTAUTH_URL incorreta

**Sintoma**: Cookies não são salvos
**Solução**: Usar URL pública, não 0.0.0.0

### 4. NEXTAUTH_SECRET não definida

**Sintoma**: Erro "NEXTAUTH_SECRET must be provided"
**Solução**: Gerar e adicionar secret forte

## 📞 Se ainda tiver problemas

Envie os logs completos mostrando:

1. `:: AUTH OPTIONS -` (configuração inicial)
2. `:: NEXTAUTH ERROR ::` (se houver)
3. `:: JWT CALLBACK -` (se houver)
4. Captura de tela da configuração do cliente no Keycloak
