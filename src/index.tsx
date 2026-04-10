import { Hono } from 'hono'

type Bindings = {
  N8N_WEBHOOK_URL?: string
}

type LeadPayload = {
  client_id: string
  customer_name: string
  customer_phone: string
  zip_code: string
  preferred_window: string
  job_type?: string
  job_notes?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/api/health', (c) => {
  return c.json({ ok: true, service: 'leadhammer-webapp' })
})

app.post('/api/lead', async (c) => {
  const webhookUrl = c.env.N8N_WEBHOOK_URL

  if (!webhookUrl) {
    return c.json(
      {
        ok: false,
        error:
          'N8N webhook URL is not configured. Set N8N_WEBHOOK_URL in Cloudflare secrets or .dev.vars.'
      },
      503
    )
  }

  let body: Partial<LeadPayload>

  try {
    body = await c.req.json<Partial<LeadPayload>>()
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON payload.' }, 400)
  }

  const requiredFields: Array<keyof LeadPayload> = [
    'client_id',
    'customer_name',
    'customer_phone',
    'zip_code',
    'preferred_window'
  ]

  for (const field of requiredFields) {
    if (!body[field] || String(body[field]).trim().length === 0) {
      return c.json({ ok: false, error: `Missing required field: ${field}` }, 400)
    }
  }

  const payload = {
    ...body,
    source: 'leadhammer-landing-page',
    submitted_at: new Date().toISOString()
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const text = await response.text()

    if (!response.ok) {
      return c.json(
        {
          ok: false,
          error: 'Upstream n8n webhook returned an error.',
          status: response.status,
          detail: text.slice(0, 500)
        },
        502
      )
    }

    return c.json({ ok: true, message: 'Lead submitted successfully.', upstream: text })
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: 'Failed to reach n8n webhook.',
        detail: error instanceof Error ? error.message : 'Unknown error'
      },
      502
    )
  }
})

app.get('/', (c) => {
  return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LeadHammer | Stop Losing Jobs to a Slow Callback</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css"
    />
  </head>
  <body class="bg-slate-950 text-slate-100">
    <header class="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
      <div class="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <a href="#" class="flex items-center gap-2 text-xl font-bold tracking-tight">
          <span class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-sm">LH</span>
          LeadHammer
        </a>
        <a
          href="#lead-form"
          class="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >Get Started</a
        >
      </div>
    </header>

    <main>
      <section class="relative overflow-hidden border-b border-slate-800">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.35),_transparent_45%)]"></div>
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(245,158,11,0.2),_transparent_40%)]"></div>
        <div class="relative mx-auto grid w-full max-w-6xl gap-10 px-6 py-20 md:grid-cols-2 md:py-28">
          <div>
            <p class="mb-4 inline-block rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
              30-second speed-to-lead automation
            </p>
            <h1 class="text-4xl font-extrabold leading-tight text-white md:text-5xl">
              Stop Losing Jobs to a Slow Callback.
            </h1>
            <p class="mt-5 text-lg text-slate-300">
              We automate your speed-to-lead. When a homeowner requests a quote, our system texts
              them in 30 seconds—even while you're on a ladder.
            </p>
            <div class="mt-8 flex flex-wrap gap-3">
              <a
                href="#lead-form"
                class="rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold hover:bg-blue-500"
                >Start My 14-Day Trial</a
              >
              <a
                href="#how-it-works"
                class="rounded-md border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-200 hover:border-slate-400"
                >See How It Works</a
              >
            </div>
          </div>
          <div class="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 shadow-2xl shadow-blue-900/20">
            <h2 class="text-xl font-semibold text-white">Live Example Alert</h2>
            <div class="mt-4 space-y-3 text-sm text-slate-200">
              <p class="rounded-md border border-slate-700 bg-slate-800 p-3">
                <strong>Homeowner:</strong> "Need drywall repair in 11211."
              </p>
              <p class="rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
                <strong>LeadHammer SMS (23s):</strong> "Thanks! Do you prefer Tue morning or Wed
                afternoon for a quote?"
              </p>
              <p class="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                <strong>Handyman alert:</strong> "New lead: John, Wed afternoon. Reply YES to
                confirm or CALL to reschedule."
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="mx-auto w-full max-w-6xl px-6 py-16">
        <div class="grid gap-6 md:grid-cols-2">
          <article class="rounded-2xl border border-red-900/30 bg-slate-900 p-6">
            <h3 class="text-2xl font-bold text-white">The Old Way: The 4-Hour Delay</h3>
            <ul class="mt-4 space-y-3 text-slate-300">
              <li><i class="fa-regular fa-circle-xmark mr-2 text-red-400"></i>Missed calls while driving or on-site</li>
              <li><i class="fa-regular fa-circle-xmark mr-2 text-red-400"></i>Customers contact 2–3 competitors first</li>
              <li><i class="fa-regular fa-circle-xmark mr-2 text-red-400"></i>$500+ projects lost before you call back</li>
            </ul>
          </article>
          <article class="rounded-2xl border border-emerald-700/30 bg-slate-900 p-6">
            <h3 class="text-2xl font-bold text-white">The LeadHammer Way: 30-Second Response</h3>
            <ul class="mt-4 space-y-3 text-slate-300">
              <li><i class="fa-regular fa-circle-check mr-2 text-emerald-400"></i>Instant SMS auto-replies with your brand voice</li>
              <li><i class="fa-regular fa-circle-check mr-2 text-emerald-400"></i>Engages homeowners while intent is highest</li>
              <li><i class="fa-regular fa-circle-check mr-2 text-emerald-400"></i>Soft-booking windows for faster confirmations</li>
            </ul>
          </article>
        </div>
      </section>

      <section id="how-it-works" class="border-y border-slate-800 bg-slate-900/50">
        <div class="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 class="text-3xl font-bold text-white">How It Works</h2>
          <div class="mt-8 grid gap-5 md:grid-cols-3">
            <article class="rounded-xl border border-slate-700 bg-slate-900 p-5">
              <p class="text-sm font-semibold uppercase text-blue-400">1. Capture</p>
              <h3 class="mt-2 text-xl font-semibold text-white">High-Speed Lead Form</h3>
              <p class="mt-2 text-slate-300">A custom form captures key details instantly, including preferred service window.</p>
            </article>
            <article class="rounded-xl border border-slate-700 bg-slate-900 p-5">
              <p class="text-sm font-semibold uppercase text-blue-400">2. Connect</p>
              <h3 class="mt-2 text-xl font-semibold text-white">Immediate AI + SMS Response</h3>
              <p class="mt-2 text-slate-300">n8n triggers your personalized message in seconds through your configured automation stack.</p>
            </article>
            <article class="rounded-xl border border-slate-700 bg-slate-900 p-5">
              <p class="text-sm font-semibold uppercase text-blue-400">3. Convert</p>
              <h3 class="mt-2 text-xl font-semibold text-white">Double-Handshake Confirmation</h3>
              <p class="mt-2 text-slate-300">Lead picks a window, handyman confirms, and no one gets “ghost-booked.”</p>
            </article>
          </div>
        </div>
      </section>

      <section id="lead-form" class="mx-auto w-full max-w-4xl px-6 py-16">
        <div class="rounded-2xl border border-slate-700 bg-slate-900 p-6 md:p-8">
          <h2 class="text-3xl font-bold text-white">Ready to double your booking rate?</h2>
          <p class="mt-2 text-slate-300">Setup takes 10 minutes. No technical skills required.</p>

          <form id="bookingForm" class="mt-8 grid gap-4 md:grid-cols-2">
            <input type="hidden" id="client_id" name="client_id" />

            <label class="block">
              <span class="mb-1 block text-sm text-slate-300">Your Name</span>
              <input name="customer_name" required class="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2" />
            </label>

            <label class="block">
              <span class="mb-1 block text-sm text-slate-300">Phone Number</span>
              <input name="customer_phone" required class="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2" />
            </label>

            <label class="block">
              <span class="mb-1 block text-sm text-slate-300">ZIP Code</span>
              <input name="zip_code" required class="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2" />
            </label>

            <label class="block">
              <span class="mb-1 block text-sm text-slate-300">Preferred Service Window</span>
              <select name="preferred_window" required class="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2">
                <option value="">Select a window</option>
                <option>Tuesday Morning</option>
                <option>Tuesday Afternoon</option>
                <option>Wednesday Morning</option>
                <option>Wednesday Afternoon</option>
                <option>Thursday Morning</option>
                <option>Thursday Afternoon</option>
              </select>
            </label>

            <label class="block md:col-span-2">
              <span class="mb-1 block text-sm text-slate-300">Service Type</span>
              <input name="job_type" placeholder="e.g., Drywall repair" class="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2" />
            </label>

            <label class="block md:col-span-2">
              <span class="mb-1 block text-sm text-slate-300">Job Notes (optional)</span>
              <textarea name="job_notes" rows="4" class="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2"></textarea>
            </label>

            <button type="submit" class="md:col-span-2 rounded-md bg-amber-500 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-400">
              Submit Booking Request
            </button>
          </form>

          <p id="formMessage" class="mt-4 text-sm text-slate-300"></p>
        </div>
      </section>
    </main>

    <footer class="border-t border-slate-800 py-8 text-center text-sm text-slate-400">
      © <span id="year"></span> LeadHammer Automation — Powered for handymen who move fast.
    </footer>

    <script>
      const params = new URLSearchParams(window.location.search)
      const clientId = params.get('client_id') || 'demo-client'
      document.getElementById('client_id').value = clientId
      document.getElementById('year').textContent = new Date().getFullYear()

      const form = document.getElementById('bookingForm')
      const formMessage = document.getElementById('formMessage')

      form.addEventListener('submit', async (event) => {
        event.preventDefault()
        formMessage.textContent = 'Submitting...'

        const formData = new FormData(form)
        const payload = Object.fromEntries(formData.entries())

        try {
          const response = await fetch('/api/lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })

          const data = await response.json()

          if (!response.ok || !data.ok) {
            throw new Error(data.error || 'Submission failed.')
          }

          formMessage.textContent = 'Thanks! Your request was sent. We\'ll text you shortly.'
          form.reset()
          document.getElementById('client_id').value = clientId
        } catch (error) {
          formMessage.textContent = 'Submission failed: ' + (error.message || 'Unknown error')
        }
      })
    </script>
  </body>
</html>`)
})

export default app
