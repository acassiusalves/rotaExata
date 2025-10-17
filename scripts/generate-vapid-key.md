# Gerar VAPID Key para Firebase Cloud Messaging

## Passos para gerar a VAPID Key:

### 1. Acesse o Firebase Console
1. Vá para: https://console.firebase.google.com
2. Selecione seu projeto: **studio-7321304121-9aa4d**

### 2. Navegue até Cloud Messaging
1. No menu lateral, clique em **Configurações do projeto** (⚙️ ícone de engrenagem)
2. Vá para a aba **Cloud Messaging**

### 3. Gere o par de chaves da Web

Na seção "Configuração da Web", você verá:
- **Web Push certificates**
- Clique em **"Gerar par de chaves"** se não houver nenhuma chave

### 4. Copie a Chave

Copie a chave gerada (começa com algo como `BKxR8ZqVx...`)

### 5. Atualize o código

Cole a chave em:
- **Arquivo:** `src/hooks/use-fcm-token.tsx`
- **Linha:** ~24
- **Substitua a VAPID key placeholder:**

```typescript
const currentToken = await getToken(messaging, {
  vapidKey: 'SUA_CHAVE_VAPID_AQUI', // ← Cole aqui
});
```

## Exemplo:

```typescript
const currentToken = await getToken(messaging, {
  vapidKey: 'BKxR8ZqVxJxJYx8wZ3YqJ_VxKp6TFqJ0J9x6ZqVxJxJYx8wZ3YqJ_VxKp6TFqJ0J9',
});
```

## ⚠️ IMPORTANTE:
- Mantenha esta chave privada
- Não compartilhe publicamente
- É usada para autenticar seu app com FCM

## Próximo passo:
Após adicionar a VAPID key, faça o build e deploy:
```bash
npm run build
firebase deploy --only functions:notifyRouteChanges
```
