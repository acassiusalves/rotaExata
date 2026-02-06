# 🔍 Verificar Service Account Correto

## O Problema
A permissão precisa ser adicionada ao service account correto que as Cloud Functions Gen2 estão usando.

## Service Accounts Possíveis

Para Cloud Functions Gen2 na região southamerica-east1, o service account geralmente é:

### 1. Default Compute Service Account (MAIS PROVÁVEL ✅)
```
470233078453-compute@developer.gserviceaccount.com
```

### 2. App Engine Service Account
```
studio-7321304121-9aa4d@appspot.gserviceaccount.com
```

### 3. Cloud Functions Service Agent
```
service-470233078453@gcf-admin-robot.iam.gserviceaccount.com
```

## 🎯 Solução: Adicionar Permissão em TODOS os 3

Para garantir, adicione a role **"Service Account Token Creator"** nos 3 service accounts:

### Via Console (Recomendado):
1. Acesse: https://console.cloud.google.com/iam-admin/iam?project=studio-7321304121-9aa4d

2. **Para CADA um dos 3 service accounts listados acima:**
   - Encontre o service account na lista (use Ctrl+F para buscar)
   - Clique no ícone de **lápis (✏️)**
   - Clique em **"ADD ANOTHER ROLE"**
   - Busque e selecione: **"Service Account Token Creator"**
   - Clique em **"SAVE"**

3. Após adicionar nos 3, aguarde 1-2 minutos para propagar

## 🔄 Alternativa: Via Firebase Console

1. Acesse: https://console.firebase.google.com/project/studio-7321304121-9aa4d/settings/serviceaccounts/adminsdk

2. Clique em **"Manage service account permissions"**

3. Isso abrirá o Console do Google Cloud no lugar certo

## ✅ Como Testar Depois

Após adicionar as permissões:

1. Aguarde 1-2 minutos
2. Recarregue a página http://localhost:2000/drivers
3. Tente novamente "Testar como Motorista"

Se ainda não funcionar, tente fazer um novo deploy da função:
```bash
cd functions
firebase deploy --only functions:generateDriverImpersonationToken
```

## 🆘 Se Ainda Não Funcionar

Me avise e vou implementar uma solução alternativa que não precisa dessa permissão IAM!
