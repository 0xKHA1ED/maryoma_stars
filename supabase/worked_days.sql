create table public.worked_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  worked_on date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, worked_on)
);

alter table public.worked_days enable row level security;

drop policy if exists "Users can read their own worked days" on public.worked_days;
create policy "Users can read their own worked days"
on public.worked_days
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own worked days" on public.worked_days;
create policy "Users can insert their own worked days"
on public.worked_days
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own worked days" on public.worked_days;
create policy "Users can update their own worked days"
on public.worked_days
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own worked days" on public.worked_days;
create policy "Users can delete their own worked days"
on public.worked_days
for delete
using (auth.uid() = user_id);
