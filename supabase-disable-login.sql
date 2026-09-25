drop policy if exists "teacher can manage own settings" on public.app_settings;
drop policy if exists "teacher can manage own courses" on public.courses;
drop policy if exists "teacher can manage own students" on public.students;

drop policy if exists "app can manage one teacher settings without login" on public.app_settings;
drop policy if exists "app can manage one teacher courses without login" on public.courses;
drop policy if exists "app can manage one teacher students without login" on public.students;

create policy "app can manage one teacher settings without login"
on public.app_settings
for all
to anon
using (user_id = '5fc8ef74-a81c-48cb-8ae2-9ad69ffede38'::uuid)
with check (user_id = '5fc8ef74-a81c-48cb-8ae2-9ad69ffede38'::uuid);

create policy "app can manage one teacher courses without login"
on public.courses
for all
to anon
using (user_id = '5fc8ef74-a81c-48cb-8ae2-9ad69ffede38'::uuid)
with check (user_id = '5fc8ef74-a81c-48cb-8ae2-9ad69ffede38'::uuid);

create policy "app can manage one teacher students without login"
on public.students
for all
to anon
using (user_id = '5fc8ef74-a81c-48cb-8ae2-9ad69ffede38'::uuid)
with check (user_id = '5fc8ef74-a81c-48cb-8ae2-9ad69ffede38'::uuid);
