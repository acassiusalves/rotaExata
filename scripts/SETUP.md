# 🔧 Configuração Inicial para Scripts

## Obter Credenciais do Firebase Admin SDK

Para executar os scripts de migração, você precisa do arquivo `serviceAccountKey.json`.

### Passo a Passo:

1. **Acesse o Firebase Console:**
   - Vá para: https://console.firebase.google.com/
   - Selecione seu projeto

2. **Navegue até Service Accounts:**
   - Clique no ícone de engrenagem ⚙️ (Project Settings)
   - Clique na aba "Service Accounts"

3. **Gere uma Nova Chave Privada:**
   - Clique no botão "Generate New Private Key"
   - Confirme clicando em "Generate Key"
   - Um arquivo JSON será baixado automaticamente

4. **Mova o Arquivo para o Projeto:**
   ```bash
   # Renomeie o arquivo baixado para serviceAccountKey.json
   mv ~/Downloads/nome-do-projeto-firebase-adminsdk-xxxxx.json /Users/acassiusalves/rotaExata/serviceAccountKey.json
   ```

5. **Verifique o Arquivo:**
   ```bash
   ls -la /Users/acassiusalves/rotaExata/serviceAccountKey.json
   ```

### ⚠️ IMPORTANTE - Segurança

O arquivo `serviceAccountKey.json` contém credenciais sensíveis!

- ✅ **SIM:** Mantenha o arquivo na raiz do projeto (já está no `.gitignore`)
- ❌ **NÃO:** Nunca faça commit deste arquivo no Git
- ❌ **NÃO:** Nunca compartilhe este arquivo publicamente
- ❌ **NÃO:** Nunca envie este arquivo por email ou chat

### Verificar se está no .gitignore

Execute:
```bash
grep -q "serviceAccountKey.json" .gitignore && echo "✅ Protegido" || echo "❌ ADICIONE AO .gitignore!"
```

Se aparecer "❌ ADICIONE AO .gitignore!", execute:
```bash
echo "serviceAccountKey.json" >> .gitignore
```

## Após Configurar

Depois de ter o `serviceAccountKey.json` no lugar, você pode executar:

```bash
npx tsx scripts/update-driver-deliveries.ts
```
