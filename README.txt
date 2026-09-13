PINK GLOSSY LOVE WEBSITE — DEPLOYMENT BUILD
============================================

THIS BUILD IS CONNECTED TO SUPABASE
- Public site content loads from Supabase.
- Wishlist items sync between devices.
- Wishlist photos are compressed and saved with the SQL record.
- Main website photos and music use the Supabase Storage bucket: gf-romance-media.
- The girlfriend-site data is isolated in tables prefixed with gf_.

FILES TO DEPLOY
- index.html
- styles.css
- script.js
- README.txt (optional; Vercel does not need it)

VERCEL
1. Upload/deploy the folder containing index.html, styles.css and script.js.
2. No site-data.json file is required anymore.
3. The normal public URL hides the Customize button.
4. To reveal Customize on the deployed site, add ?edit=1
   Example: https://your-site.vercel.app/?edit=1

CUSTOMIZE LOGIN
- Username: maxwill
- Password: use the password for the existing Supabase/IEM admin account connected to this project.
- The UI still shows only Username + Password; it does not expose the account email.
- Authentication is handled by Supabase Auth, not by a password written inside script.js.

CUSTOMIZE
- Basics: names, relationship date/time, hero title/message/caption.
- Photos: main photo + dynamic gallery. Use + Add photo for more memories.
- Gallery editor shows 5 cards per row on desktop.
- Love Cards: 4 clickable messages.
- Wishlist: opens the public shared Wishlist.
- Love Letter: greeting, body and signature.
- Music & Backup: upload music, export/import backup, reset.
- Save Changes publishes the main site to Supabase immediately.

OUR MEMORIES
- Gallery moves automatically.
- Mouse: click/hold and drag left/right.
- Mobile/tablet: hold and swipe left/right.
- Auto movement resumes after release.

WISHLIST
- Wishlist is shared online through Supabase SQL.
- She can add a photo, item name, note and optional product link.
- Photos are compressed before upload to reduce database size.
- A wish can be removed from the device that created it.
- An authenticated Customize admin can also remove wishlist items.

BACKUP
- Export Site Data downloads site-data-backup.json.
- Import loads that backup into the editor.
- Press Save Changes after importing to publish the imported settings.

SUPABASE RESOURCES USED
- public.gf_site_state
- public.gf_wishlist
- storage bucket: gf-romance-media

NOTES
- Main website media uploads require the authenticated admin account.
- Wishlist images are limited/compressed so the database remains lightweight.
- Music files should be 25 MB or smaller.
