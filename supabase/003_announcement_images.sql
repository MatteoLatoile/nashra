-- Nashra V1.3 — stockage des photos d'annonces
-- Exécuter dans Supabase > SQL Editor (une fois ; script relançable).
-- ATTENTION : bucket public : toute personne ayant l'URL peut voir la photo.
-- Ne stockez pas de photos privées ou contenant des informations sensibles.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nashra-announcement-images',
  'nashra-announcement-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Chaque utilisateur peut ajouter des fichiers uniquement dans son propre dossier UUID.
-- Pas de permission d'écriture/modification/suppression des autres utilisateurs.
drop policy if exists "nashra_images_insert_owner" on storage.objects;
create policy "nashra_images_insert_owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'nashra-announcement-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Les images du bucket sont servies publiquement via getPublicUrl.
-- Une suppression depuis Nashra ne supprime pas encore physiquement les fichiers.
