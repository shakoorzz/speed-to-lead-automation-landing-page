# webapp

## Project Overview
- **Name**: LeadHammer Speed-to-Lead Landing + Intake API
- **Goal**: Convert handyman traffic into qualified leads with fast response and soft-booking intake.
- **Core Approach**: No Tally embed. Use a maintainable direct form -> `/api/lead` -> n8n production webhook pipeline.

## Completed Features
1. Professional LeadHammer landing page (single route: `/`) with:
   - Sticky navigation + hero + pain/solution section
   - 3-step “How It Works” section
   - Final CTA with embedded booking-request form
2. “Soft-booking” lead form fields:
   - customer name, email, phone, service area ZIPs, preferred service window, service type, notes
3. Multi-tenant routing support:
   - `client_id` captured from URL query parameter (fallback: `demo-client`)
4. Server-side secure relay endpoint:
   - `POST /api/lead` validates payload and forwards to n8n webhook via secret env var
5. Health endpoint:
   - `GET /api/health`
6. PM2 sandbox startup config:
   - `ecosystem.config.cjs` for `wrangler pages dev dist --port 3000`

## Functional Entry URIs (Paths + Parameters)
### Frontend
- `GET /`
  - Optional query param: `client_id`
  - Example: `/?client_id=abc-123`

### API
- `GET /api/health`
  - Returns status JSON

- `POST /api/lead`
  - Content-Type: `application/json`
  - Required fields:
    - `client_id`
    - `customer_name`
    - `customer_email`
    - `customer_phone`
    - `service_area_zips`
    - `preferred_window`
  - Optional fields:
    - `job_type`
    - `job_notes`

## Data Architecture
- **Current storage**: No DB connected yet (webhook relay mode)
- **Source of truth**: n8n workflow (and downstream systems like Supabase)
- **Data flow**:
  1. Browser form submission
  2. Hono API validation (`/api/lead`)
  3. Forward to `N8N_WEBHOOK_URL`
  4. n8n handles tenant-specific automation and notifications

## Environment Variables
Set this in local `.dev.vars` and Cloudflare secrets:

```bash
N8N_WEBHOOK_URL=https://your-n8n-domain/webhook/your-production-id
```

## Local Development
```bash
npm install
npm run build
npm run clean-port
pm2 start ecosystem.config.cjs
curl http://localhost:3000/api/health
```

## Deployment (Cloudflare Pages)
```bash
npm run build
npx wrangler pages deploy dist --project-name webapp
```

## Not Yet Implemented
1. Direct Supabase writes from Worker (currently delegated to n8n)
2. Cloudflare Turnstile anti-bot protection
3. Advanced rate limiting and abuse controls
4. Analytics dashboard + conversion tracking
5. Full onboarding/admin UI for handyman client configuration

## Recommended Next Steps
1. Provide your **n8n production webhook URL** so I can wire/test full live flow.
2. Add Turnstile verification in form + API endpoint.
3. Add Supabase schema + D1/KV strategy for local fallback logging.
4. Add a lightweight admin page for tenant onboarding (`client_id`, templates, windows).

## Tech Stack
- Hono (Cloudflare Pages)
- TypeScript
- Tailwind CDN (frontend styling)
- Font Awesome CDN (icons)

## Deployment Status
- **Platform**: Cloudflare Pages
- **Status**: ⚙️ Ready for deployment
- **Last Updated**: 2026-04-10
