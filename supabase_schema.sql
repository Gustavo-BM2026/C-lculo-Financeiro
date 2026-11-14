-- ============================================================================
-- SCRIPT DE CRIAÇÃO DO BANCO DE DADOS NO SUPABASE
-- Projeto: Gastei & Agora? (Cálculo Financeiro)
-- Copie e cole este código no SQL Editor do seu projeto Supabase e clique em RUN
-- ============================================================================

-- Habilitar extensão de UUID (geralmente já habilitada por padrão)
create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. TABELA DE PERFIS (PROFILES)
-- Complementa a tabela auth.users com dados públicos e preferências visuais
-- ============================================================================
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null check (char_length(trim(full_name)) > 0),
    theme_preference text not null default 'dark' check (theme_preference in ('dark', 'light')),
    privacy_mode boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- 2. TABELA DE REGISTROS FINANCEIROS (FINANCIAL_RECORDS)
-- Salário, tamanho da dívida, deadline e gastos essenciais
-- ============================================================================
create table if not exists public.financial_records (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    monthly_salary numeric(12, 2) not null default 0.00 check (monthly_salary >= 0),
    total_debt numeric(12, 2) not null default 0.00 check (total_debt >= 0),
    deadline date not null,
    essential_expenses numeric(12, 2) not null default 0.00 check (essential_expenses >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- 3. TABELA DE HISTÓRICO DO CHAT DA IA (CHAT_MESSAGES)
-- Histórico de conversas e diagnósticos com a FinAI
-- ============================================================================
create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    sender text not null check (sender in ('user', 'ai')),
    message text not null check (char_length(trim(message)) > 0),
    created_at timestamptz not null default now()
);

-- ============================================================================
-- 4. POLÍTICAS DE SEGURANÇA (ROW LEVEL SECURITY - RLS)
-- Garante que cada usuário só acesse e altere seus próprios dados
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.financial_records enable row level security;
alter table public.chat_messages enable row level security;

-- Políticas para public.profiles
drop policy if exists "Usuários podem ver seu próprio perfil" on public.profiles;
create policy "Usuários podem ver seu próprio perfil"
    on public.profiles for select
    using (auth.uid() = id);

drop policy if exists "Usuários podem atualizar seu próprio perfil" on public.profiles;
create policy "Usuários podem atualizar seu próprio perfil"
    on public.profiles for update
    using (auth.uid() = id);

drop policy if exists "Usuários podem inserir seu próprio perfil" on public.profiles;
create policy "Usuários podem inserir seu próprio perfil"
    on public.profiles for insert
    with check (auth.uid() = id);

-- Políticas para public.financial_records
drop policy if exists "Usuários podem ver suas próprias finanças" on public.financial_records;
create policy "Usuários podem ver suas próprias finanças"
    on public.financial_records for select
    using (auth.uid() = user_id);

drop policy if exists "Usuários podem criar suas próprias finanças" on public.financial_records;
create policy "Usuários podem criar suas próprias finanças"
    on public.financial_records for insert
    with check (auth.uid() = user_id);

drop policy if exists "Usuários podem atualizar suas próprias finanças" on public.financial_records;
create policy "Usuários podem atualizar suas próprias finanças"
    on public.financial_records for update
    using (auth.uid() = user_id);

-- Políticas para public.chat_messages
drop policy if exists "Usuários podem ver suas próprias mensagens" on public.chat_messages;
create policy "Usuários podem ver suas próprias mensagens"
    on public.chat_messages for select
    using (auth.uid() = user_id);

drop policy if exists "Usuários podem enviar suas mensagens" on public.chat_messages;
create policy "Usuários podem enviar suas mensagens"
    on public.chat_messages for insert
    with check (auth.uid() = user_id);

-- ============================================================================
-- 5. TRIGGER: CRIAR PERFIL AUTOMATICAMENTE NO CADASTRO DO USUÁRIO
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, full_name, theme_preference, privacy_mode)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', 'Guerreiro Financeiro'),
        'dark',
        false
    );
    return new;
end;
$$ language plpgsql security definer;

-- Remove o trigger antigo se existir para evitar duplicação
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
