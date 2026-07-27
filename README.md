# Gündəlik Bakı platforması

Gündəlik Bakı üçün mövcud Home 6 görünüşünü saxlayan Azərbaycan dilli frontend və store/vendor scope-lu Node.js CMS platformasıdır. TVSHOP.AZ və SEEMOORG bu repository-də implementasiya edilməyib; yalnız gələcək inteqrasiya üçün store-aware sərhədlər nəzərə alınıb.

## Struktur

- `frontend/` — təmizlənmiş statik Home 6, lokal assetlər, SEO və CMS fallback bağlantısı
- `backend/src/` — Fastify API, auth/RBAC, katalog, inventar, sifariş, kontent, SEO, kampaniya, QR/loyalty
- `backend/admin/` — super admin, işçi və vendor rollarına görə menyusu dəyişən responsiv panel
- `backend/migrations/` — PostgreSQL 15+ sxemi; production compose PostgreSQL 18 istifadə edir
- `docs/` — tələblər, arxitektura və əməliyyat runbook-u

## Lokal başlatma

Node.js 24+, npm 11+ və PostgreSQL 15+ tələb olunur.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- sayt: `http://127.0.0.1:3000/`
- panel: `http://127.0.0.1:3000/admin/`
- API sənədi: `http://127.0.0.1:3000/documentation`
- hazırlıq: `http://127.0.0.1:3000/api/v1/ready`

Əsas işlək səhifələr: `/magaza/`, `/mehsul/:slug/`, `/endirimler/`, `/kampaniyalar/`, `/jurnal/`, `/jurnal/:slug/`, `/elanlar/`, `/baki-club/`, `/biznes/` və `/sebet/`. Mağaza, jurnal və elan səhifələri CMS/PostgreSQL məlumatından server tərəfində render olunur; səbət sifariş endpoint-inə bağlıdır.

Frontend ayrıca `npm run dev:frontend` ilə yalnız statik fallback rejimində açıla bilər.

## Yoxlama

```bash
npm run lint
npm run build
npm test
npm run test:routes # lokal server işləyərkən bütün daxili linkləri yoxlayır
```

Production qaydaları üçün [docs/OPERATIONS.md](docs/OPERATIONS.md), biznes tələbləri üçün [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) və texniki qərarlar üçün [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) sənədlərinə baxın.
