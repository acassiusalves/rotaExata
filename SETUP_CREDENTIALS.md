# 🔐 Como Configurar Credenciais do Firebase

## ⚠️ IMPORTANTE: Você precisa fazer isso para o app funcionar!

### **1️⃣ Obter Service Account do Firebase Admin SDK**

**Passo 1:** Acesse este link (você já está autenticado):
```
https://console.firebase.google.com/project/studio-7321304121-9aa4d/settings/serviceaccounts/adminsdk
```

**Passo 2:** Na página que abrir:
1. Clique no botão **"Generate new private key"** (Gerar nova chave privada)
2. Confirme clicando em **"Generate key"**
3. Um arquivo JSON será baixado (ex: `studio-7321304121-9aa4d-firebase-adminsdk-xxxxx.json`)

**Passo 3:** Abra o arquivo JSON baixado e copie os valores:

```json
{
  "project_id": "studio-7321304121-9aa4d",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@studio-7321304121-9aa4d.iam.gserviceaccount.com"
}
```

**Passo 4:** Cole esses valores no arquivo `.env.local`:
- `project_id` → `FIREBASE_PROJECT_ID`
- `client_email` → `FIREBASE_CLIENT_EMAIL`
- `private_key` → `FIREBASE_PRIVATE_KEY` (cole TODA a chave incluindo as quebras de linha `\n`)

---

### **2️⃣ Obter Chaves do Google Maps**

**Passo 1:** Acesse:
```
https://console.cloud.google.com/google/maps-apis/credentials?project=studio-7321304121-9aa4d
```

**Passo 2:** Você verá uma lista de API keys. Copie uma chave existente ou crie uma nova.

**Passo 3:** Cole no `.env.local`:
```bash
NEXT_PUBLIC_GMAPS_KEY="sua_chave_aqui"
GMAPS_SERVER_KEY="sua_chave_aqui"  # Pode ser a mesma
```

---

### **3️⃣ Obter VAPID Key (Cloud Messaging)**

**Passo 1:** Acesse:
```
https://console.firebase.google.com/project/studio-7321304121-9aa4d/settings/cloudmessaging
```

**Passo 2:** Role até a seção **"Web Push certificates"**

**Passo 3:** Copie o **"Key pair"** que aparece ali

**Passo 4:** Cole no `.env.local`:
```bash
NEXT_PUBLIC_VAPID_KEY="sua_vapid_key_aqui"
```

---

## 🚀 Após Configurar

1. **Reinicie o servidor de desenvolvimento:**
   ```bash
   # Pare o servidor (Ctrl+C no terminal onde está rodando)
   # Depois rode novamente:
   npm run dev
   ```

2. **Teste a página `/api` novamente:**
   - Acesse: http://localhost:9002/api
   - Tente salvar a chave do Google Maps
   - Deve funcionar agora! ✅

---

## 🆘 Precisa de Ajuda?

Se tiver dificuldade para encontrar alguma dessas credenciais, me avise que eu te ajudo!
