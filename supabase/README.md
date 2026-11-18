# Configuração do Supabase — Chácara Inventário

## 1. Executar a Migração SQL
1. Acesse o painel do seu projeto em [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Abra o **SQL Editor** na barra lateral esquerda.
3. Copie todo o conteúdo do arquivo [`migrations/0001_inventory_management.sql`](./migrations/0001_inventory_management.sql) (ou copie diretamente pela aba **Banco & Nuvem** dentro do próprio aplicativo/APK) e clique em **Run**.

Isso criará automaticamente:
- Tabela `public.rooms` (Cômodos dinâmicos com proteção contra exclusão acidental `ON DELETE RESTRICT`)
- Tabela `public.inventory_categories` (Categorias dinâmicas `ON DELETE SET NULL`)
- Tipo enumerado `public.inventory_type_enum` (`'individual'`, `'quantity'`)
- Tabela `public.inventory_items` (Itens do inventário com validação de quantidade `expected_quantity > 0` e índice único para `identification_code`)
- Trigger automático de `updated_at` e normalização de código (`UPPER(TRIM(identification_code))`)
- Políticas de Row Level Security (RLS)
- Bucket do Supabase Storage `inventory-photos` e políticas de leitura/upload/exclusão de imagens

## 2. Conectar o Aplicativo / APK ao Supabase
Você pode configurar as credenciais de duas maneiras:
1. **Diretamente no Aplicativo / APK**: Toque no botão **Supabase / Nuvem** no topo do app, cole a **Project URL** e a **Anon Public Key** (encontradas em *Project Settings → API*), e clique em **Salvar e Testar Conexão**.
2. **Via arquivo `.env` (para build web/APK pré-configurado)**:
   Crie um arquivo `.env` na raiz do projeto com:
   ```env
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
   ```
