-- Nashra 076: stockage MP4 public (ne pas utiliser pour des contenus sensibles).
-- Les envois Telegram restent contrôlés par le serveur et les quotas existants.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('nashra-announcement-videos','nashra-announcement-videos',true,20971520,array['video/mp4'])
on conflict(id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "nashra_videos_insert_owner_076" on storage.objects;
create policy "nashra_videos_insert_owner_076" on storage.objects for insert to authenticated
with check (bucket_id='nashra-announcement-videos'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.mp4$'));
