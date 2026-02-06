# 🔐 Instruções para Adicionar Permissão IAM

## Problema
A Firebase Function `generateDriverImpersonationToken` precisa de permissão para criar custom tokens.

## Solução: Adicionar Permissão via Google Cloud Console

### Passo 1: Acessar IAM & Admin
🔗 **Link direto**: https://console.cloud.google.com/iam-admin/iam?project=studio-7321304121-9aa4d

### Passo 2: Encontrar o Service Account
Procure por este service account na lista:
```
studio-7321304121-9aa4d@appspot.gserviceaccount.com
```

**Dica**: Use Ctrl+F (ou Cmd+F no Mac) para buscar

### Passo 3: Editar Permissões
1. Clique no **ícone de lápis (✏️)** ao lado do service account
2. Na janela que abrir, clique em **"ADD ANOTHER ROLE"**
3. No campo de busca, digite: `Service Account Token Creator`
4. Selecione: **Service Account Token Creator**
5. Clique em **"SAVE"**

### Passo 4: Verificar
Após salvar, o service account deve ter pelo menos estas roles:
- ✅ Firebase Admin SDK Administrator Service Agent
- ✅ **Service Account Token Creator** (novo!)

## Pronto! 🎉
Agora você pode testar a funcionalidade de "Login como Motorista" em:
http://localhost:2000/drivers

---

## Alternativa: Via gcloud CLI

Se você tiver o gcloud instalado, execute:

```bash
gcloud auth login
gcloud config set project studio-7321304121-9aa4d

gcloud projects add-iam-policy-binding studio-7321304121-9aa4d \
  --member="serviceAccount:studio-7321304121-9aa4d@appspot.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

## Verificar se funcionou

Após adicionar a permissão:
1. Acesse http://localhost:2000/drivers
2. Clique no menu "..." de um motorista
3. Selecione "Testar como Motorista"
4. Confirme no dialog

Se tudo estiver correto, uma nova aba abrirá com a interface do motorista! 🚗
