# Gündəlik Bakı production əməliyyatları

## Buraxılış

1. `.env.example` əsasında serverdə `.env` yaradın. JWT, cookie, PostgreSQL və bootstrap admin şifrələri bir-birindən fərqli, minimum 32 bayt təsadüfi dəyərlər olmalıdır.
2. `PUBLIC_ORIGIN=https://gundelikbaki.az` və `DOMAIN=gundelikbaki.az` təyin edin.
3. `docker compose up -d --build` başladın. Konteyner hər startda checksum-lı, dəyişdirilməz migrasiyaları tətbiq edir və sistem rollarını idempotent seed edir.
4. `/api/v1/ready`, `/documentation`, `/admin/`, əsas səhifə və sitemap-ı yoxlayın.
5. İlk girişdən dərhal sonra bootstrap şifrəsini dəyişin və seed şifrəsini secret manager-dən rotasiya edin.

## Backup və bərpa

- PostgreSQL üçün hər gün şifrəli `pg_dump -Fc` backup, obyekt/upload qovluğu üçün ayrıca snapshot yaradın.
- Gündəlik backup saxlanması: 14 gün; həftəlik: 8 həftə; aylıq: 12 ay.
- Rübdə ən azı bir dəfə təmiz mühitdə bərpa testi aparın. Backup yalnız uğurlu restore testi ilə etibarlı sayılır.
- Bərpa zamanı tətbiqi maintenance rejiminə alın, DB və upload snapshot-larını eyni zaman nöqtəsindən bərpa edin, sonra `/ready` və sifariş inventar bütövlüyünü yoxlayın.

## Monitorinq

- `/api/v1/health` proses, `/api/v1/ready` verilənlər bazası hazırlığını göstərir.
- JSON loglarda `requestId` saxlanır; auth header, cookie və şifrələr redaktə olunur.
- 5xx faizi, login bloklanmaları, outbox backlog, aşağı stok, uğursuz ödəniş və QR sui-istifadə limiti üçün alert qurulmalıdır.
- DB yalnız private şəbəkədə qalır; internetə port açılmır.

## Təhlükəsizlik buraxılış siyahısı

- TLS/HSTS, təhlükəsiz cookie, CSRF/origin yoxlaması və CORS production origin ilə sınanır.
- Admin URL-i `noindex`; sitemap yalnız public published kontenti ehtiva edir.
- Vendor hesabı ilə başqa vendor ID-lərinə sorğu testləri mütləq aparılır.
- Refund, ödəniş provider webhook-u, e-poçt/SMS və obyekt storage adapterləri real provider seçilmədən aktiv hesab edilmir.
