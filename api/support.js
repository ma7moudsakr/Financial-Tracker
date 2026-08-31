alter table public.transactions 
  add column if not exists receipt_url text,
  add column if not exists member_id text default 'me';

create table if not exists public.expense_trips (
  id text primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null, destination text, start_date date, end_date date,
  currency text default 'AED', per_diem numeric default 0,
  purpose text, expenses jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);
alter table public.expense_trips enable row level security;
create policy "Users manage own trips" on public.expense_trips
  for all using (auth.uid() = user_id);
