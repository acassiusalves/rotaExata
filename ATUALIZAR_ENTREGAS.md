# 📊 Atualizar Total de Entregas dos Motoristas

## 🎯 Objetivo

Este guia explica como atualizar o contador de entregas (`totalDeliveries`) de todos os motoristas baseado no histórico de rotas já concluídas no sistema.

## ⚡ Execução Rápida

Se você já tem o arquivo `serviceAccountKey.json` configurado, execute primeiro a
auditoria em modo simulação:

```bash
npx tsx scripts/update-driver-deliveries.ts
```

Esse comando apenas lê as rotas e os usuários, lista as diferenças entre o
contador atual e o recalculado, e não grava nada. Depois de implantar a correção
e conferir os valores exibidos, aplique somente os ajustes revisados com a flag
explícita `--apply`:

```bash
npx tsx scripts/update-driver-deliveries.ts --apply
```

⚠️ `--apply` é a única opção que habilita escritas no Firestore. Nunca pule a
simulação nem use essa flag sem revisar a auditoria.

## 📋 Passo a Passo Completo

### 1️⃣ Baixar Credenciais do Firebase

1. Acesse: https://console.firebase.google.com/
2. Selecione seu projeto
3. Vá em **⚙️ Project Settings** → **Service Accounts**
4. Clique em **"Generate New Private Key"**
5. Baixe o arquivo JSON

### 2️⃣ Configurar o Arquivo de Credenciais

Renomeie e mova o arquivo baixado:

```bash
mv ~/Downloads/seu-projeto-firebase-*.json /Users/acassiusalves/rotaExata/serviceAccountKey.json
```

### 3️⃣ Executar o Script

Faça a simulação padrão e revise as diferenças:

```bash
npx tsx scripts/update-driver-deliveries.ts
```

Após a implantação da correção e a conferência da simulação, execute a aplicação
explicitamente:

```bash
npx tsx scripts/update-driver-deliveries.ts --apply
```

### 4️⃣ Verificar Resultados

Você verá uma saída como:

```
Modo: SIMULAÇÃO
🚀 Iniciando atualização de total de entregas dos motoristas...

📦 Buscando todas as rotas...
✅ Encontradas 45 rotas

📊 Contagem de entregas por motorista:
────────────────────────────────────────────────────────────
👤 João Silva (abc123): 28 entregas
👤 Maria Santos (def456): 15 entregas
👤 Pedro Costa (ghi789): 12 entregas
────────────────────────────────────────────────────────────

📝 Total de motoristas: 3

🔄 Conferindo documentos dos motoristas...

  João Silva: 20 -> 28
  Maria Santos: 15 (sem alteração)
  Pedro Costa: 12 (sem alteração)

SIMULAÇÃO: 1 motorista(s) precisariam de ajuste.
Execute novamente com --apply somente após revisar os valores.

🎉 Migração concluída!
```

### 5️⃣ Confirmar na Interface

1. Acesse: http://localhost:2000/drivers
2. Verifique a coluna "Total de Entregas"
3. Os números devem estar atualizados! 🎉

## 🔄 Comportamento Futuro

Após executar este script pela primeira vez:

- ✅ **Entregas antigas**: Já contabilizadas pelo script
- ✅ **Entregas novas**: Incrementadas automaticamente quando o motorista confirma entrega
- ✅ **Sistema automático**: Não precisa rodar o script novamente

## ❓ Perguntas Frequentes

### Posso executar o script múltiplas vezes?

✅ Sim! O script é idempotente. Ele sempre recalcula do zero, então executar novamente não causa duplicação.

### O script conta entregas falhadas?

❌ Não. Apenas entregas com status `completed` são contabilizadas.

### Preciso rodar o script toda vez que houver entregas novas?

❌ Não. O sistema agora incrementa automaticamente o contador quando o motorista confirma uma entrega.

### E se eu deletar uma rota?

⚠️ O contador não diminui automaticamente. Você precisaria rodar o script novamente para recalcular.

### É seguro executar em produção?

✅ O padrão é seguro para auditoria: sem `--apply`, o script não chama escritas
no Firestore e apenas lista diferenças. Depois de implantar a correção e revisar
a simulação, `--apply` atualiza somente `totalDeliveries` dos motoristas que
divergirem do valor recalculado.

## 🔒 Segurança

⚠️ **NUNCA compartilhe o arquivo `serviceAccountKey.json`**

- ✅ Arquivo já está no `.gitignore`
- ✅ Não será commitado no Git
- ❌ Não envie por email ou chat
- ❌ Não faça upload em lugares públicos

## 📚 Documentação Adicional

- Ver mais detalhes: [scripts/README.md](scripts/README.md)
- Configuração inicial: [scripts/SETUP.md](scripts/SETUP.md)
- Código do script: [scripts/update-driver-deliveries.ts](scripts/update-driver-deliveries.ts)

## 🆘 Suporte

Se encontrar problemas:

1. Verifique se o `serviceAccountKey.json` está configurado corretamente
2. Verifique se tem acesso ao Firebase do projeto
3. Verifique os logs do console para mensagens de erro
