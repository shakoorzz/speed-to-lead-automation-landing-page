import { Hono } from 'hono'

type Bindings = {
  N8N_WEBHOOK_URL?: string
}

type LeadPayload = {
  full_name: string
  email_address: string
  phone_number: string
  service_area_zips: string[] | string
  standard_availability: string[]
  primary_service_category: string
  custom_sms_intro: string
  daily_lead_limit: number | string
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
    'full_name',
    'email_address',
    'phone_number',
    'service_area_zips',
    'standard_availability',
    'primary_service_category',
    'custom_sms_intro',
    'daily_lead_limit'
  ]

  for (const field of requiredFields) {
    if (!body[field] || String(body[field]).trim().length === 0) {
      return c.json({ ok: false, error: `Missing required field: ${field}` }, 400)
    }
  }

  const fullName = String(body.full_name || '').trim()
  if (fullName.length === 0) {
    return c.json({ ok: false, error: 'Full name is required.' }, 400)
  }

  const email = String(body.email_address || '').trim()
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return c.json({ ok: false, error: 'Invalid email format.' }, 400)
  }

  const phoneNumber = String(body.phone_number || '').trim()
  if (phoneNumber.length === 0) {
    return c.json({ ok: false, error: 'Phone number is required.' }, 400)
  }

  const zipInputs = Array.isArray(body.service_area_zips)
    ? body.service_area_zips.map((value) => String(value))
    : [String(body.service_area_zips || '')]

  const zipList = zipInputs
    .flatMap((value) => value.split(/[,\n]/))
    .map((zip) => zip.replace(/\s+/g, ''))
    .filter(Boolean)

  if (zipList.length === 0) {
    return c.json({ ok: false, error: 'Provide at least one Service Area ZIP.' }, 400)
  }

  if (zipList.some((zip) => !/^\d{5}$/.test(zip))) {
    return c.json({ ok: false, error: 'Please enter valid 5-digit ZIP codes only.' }, 400)
  }

  const primaryServiceCategory = String(body.primary_service_category || '').trim()
  const allowedServiceCategories = new Set([
    'plumbing',
    'electrical',
    'drywall_painting',
    'carpentry',
    'general_handyman',
    'hvac',
    'landscaping',
    'other'
  ])

  if (!allowedServiceCategories.has(primaryServiceCategory)) {
    return c.json({ ok: false, error: 'Please select your primary service category to configure the automation.' }, 400)
  }

  const customSmsIntro = String(body.custom_sms_intro || '').trim()
  if (customSmsIntro.length < 20) {
    return c.json({ ok: false, error: 'Custom SMS Intro must be at least 20 characters.' }, 400)
  }

  const dailyLeadLimit = Number.parseInt(String(body.daily_lead_limit || ''), 10)
  if (Number.isNaN(dailyLeadLimit) || dailyLeadLimit < 1 || dailyLeadLimit > 50) {
    return c.json({ ok: false, error: 'Daily Lead Limit must be a number between 1 and 50.' }, 400)
  }

  const standardAvailabilityRaw = body.standard_availability
  const standardAvailability = Array.isArray(standardAvailabilityRaw)
    ? standardAvailabilityRaw.map((value) => String(value).trim()).filter(Boolean)
    : typeof standardAvailabilityRaw === 'string' && standardAvailabilityRaw.trim().length > 0
      ? [standardAvailabilityRaw.trim()]
      : []

  if (standardAvailability.length === 0) {
    return c.json({ ok: false, error: 'Select at least one Standard Availability window.' }, 400)
  }

  const allowedAvailability = new Set(['morning_8_12', 'afternoon_1_5', 'evening_5_8'])
  if (standardAvailability.some((value) => !allowedAvailability.has(value))) {
    return c.json({ ok: false, error: 'Invalid Standard Availability option received.' }, 400)
  }

  const payload = {
    full_name: fullName,
    email_address: email,
    phone_number: phoneNumber,
    service_area_zips: zipList,
    standard_availability: standardAvailability,
    primary_service_category: primaryServiceCategory,
    custom_sms_intro: customSmsIntro,
    daily_lead_limit: dailyLeadLimit
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const text = await response.text()

    if (response.status !== 200) {
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
  <body class="bg-slate-950 text-slate-100 antialiased">
    <header class="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
      <div class="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
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
        <div class="relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 md:grid-cols-2 md:py-28">
          <div>
            <p class="mb-4 inline-block rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
              30-second speed-to-lead automation
            </p>
            <h1 class="text-3xl font-extrabold leading-tight text-white sm:text-4xl md:text-5xl">
              Stop Losing Jobs to a Slow Callback.
            </h1>
            <p class="mt-5 text-base text-slate-300 sm:text-lg">
              We automate your speed-to-lead. When a homeowner requests a quote, our system texts
              them in 30 seconds—even while you're on a ladder.
            </p>
            <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href="#lead-form"
                class="w-full rounded-md bg-blue-600 px-6 py-3 text-center text-sm font-semibold hover:bg-blue-500 sm:w-auto"
                >Start My 14-Day Trial</a
              >
              <a
                href="#how-it-works"
                class="w-full rounded-md border border-slate-600 px-6 py-3 text-center text-sm font-semibold text-slate-200 hover:border-slate-400 sm:w-auto"
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

      <section class="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
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
        <div class="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
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

      <section id="lead-form" class="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <div class="rounded-2xl border border-slate-700 bg-slate-900 p-6 md:p-8">
          <h2 class="text-2xl font-bold text-white sm:text-3xl">Ready to double your booking rate?</h2>
          <p class="mt-2 text-slate-300">Setup takes 10 minutes. No technical skills required.</p>

          <form id="bookingForm" method="post" class="mt-8 grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm text-slate-300">Full Name</span>
              <input name="full_name" required class="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-base" />
            </label>

            <label class="block">
              <span class="mb-1 block text-sm text-slate-300">Email Address</span>
              <input type="email" name="email_address" required class="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-base" />
            </label>

            <label class="block">
              <span class="mb-1 block text-sm text-slate-300">Phone Number</span>
              <input name="phone_number" required class="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-base" />
            </label>

            <label class="block sm:col-span-2">
              <span class="mb-1 block text-sm text-slate-300">Service Area ZIPs</span>
              <textarea
                id="service_area_zips"
                name="service_area_zips"
                rows="3"
                placeholder="e.g., 11211, 11222, 11249"
                class="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              ></textarea>
              <span class="mt-1 block text-xs text-slate-400">Add one or multiple ZIP codes separated by commas or new lines.</span>
              <span id="serviceAreaZipsError" class="mt-1 block text-xs text-red-400"></span>
            </label>

            <fieldset class="block sm:col-span-2">
              <legend class="mb-2 block text-sm text-slate-300">Standard Availability</legend>
              <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <label class="cursor-pointer">
                  <input type="checkbox" name="standard_availability" value="morning_8_12" class="peer sr-only" />
                  <span class="block rounded-md border border-slate-600 bg-slate-950 p-3 transition hover:border-blue-500 peer-checked:border-blue-500 peer-checked:bg-blue-500/10">
                    <span class="block text-sm font-medium text-slate-100">Morning (8 AM - 12 PM)</span>
                    <span class="mt-1 block text-xs text-slate-400">Best for early service calls</span>
                  </span>
                </label>
                <label class="cursor-pointer">
                  <input type="checkbox" name="standard_availability" value="afternoon_1_5" class="peer sr-only" />
                  <span class="block rounded-md border border-slate-600 bg-slate-950 p-3 transition hover:border-blue-500 peer-checked:border-blue-500 peer-checked:bg-blue-500/10">
                    <span class="block text-sm font-medium text-slate-100">Afternoon (1 PM - 5 PM)</span>
                    <span class="mt-1 block text-xs text-slate-400">Most common homeowner preference</span>
                  </span>
                </label>
                <label class="cursor-pointer">
                  <input type="checkbox" name="standard_availability" value="evening_5_8" class="peer sr-only" />
                  <span class="block rounded-md border border-slate-600 bg-slate-950 p-3 transition hover:border-blue-500 peer-checked:border-blue-500 peer-checked:bg-blue-500/10">
                    <span class="block text-sm font-medium text-slate-100">Evening (5 PM - 8 PM)</span>
                    <span class="mt-1 block text-xs text-slate-400">Optional premium/after-hours window</span>
                  </span>
                </label>
              </div>
              <span class="mt-2 block text-xs text-slate-400">Select all windows you typically offer. At least one is required.</span>
            </fieldset>

            <label class="block sm:col-span-2">
              <span class="mb-1 block text-sm text-slate-300">Primary Service Category</span>
              <div class="relative">
                <select
                  id="primary_service_category"
                  name="primary_service_category"
                  required
                  class="w-full appearance-none rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Please select a category</option>
                  <option value="plumbing">Plumbing</option>
                  <option value="electrical">Electrical</option>
                  <option value="drywall_painting">Drywall & Painting</option>
                  <option value="carpentry">Carpentry & Framing</option>
                  <option value="general_handyman">General Handyman Repair</option>
                  <option value="hvac">HVAC</option>
                  <option value="landscaping">Landscaping & Exterior</option>
                  <option value="other">Other / Not Listed</option>
                </select>
                <i class="fa-solid fa-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"></i>
              </div>
              <span id="primaryServiceCategoryError" class="mt-1 block text-xs text-red-400"></span>
            </label>

            <label class="block sm:col-span-2">
              <span class="mb-1 block text-sm text-slate-300">Custom SMS Intro</span>
              <textarea
                id="custom_sms_intro"
                name="custom_sms_intro"
                required
                rows="4"
                placeholder="e.g., Hi, I'm [Name] from [Business]! I saw your request for [Service] and would love to help..."
                class="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              ></textarea>
              <span class="mt-1 block text-xs text-slate-400">This is the very first message your leads will receive via SMS. Make it personal and professional.</span>
              <span id="customSmsIntroError" class="mt-1 block text-xs text-red-400"></span>
            </label>

            <label class="block sm:col-span-2 md:w-1/2">
              <span class="mb-1 block text-sm text-slate-300">Daily Lead Limit</span>
              <input
                id="daily_lead_limit"
                type="number"
                name="daily_lead_limit"
                required
                min="1"
                max="50"
                value="5"
                class="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span class="mt-1 block text-xs text-slate-400">The maximum number of new leads the AI will process for you per day before pausing.</span>
              <span id="dailyLeadLimitError" class="mt-1 block text-xs text-red-400"></span>
            </label>

            <button
              id="submitButton"
              type="submit"
              class="sm:col-span-2 rounded-md bg-amber-500 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Activate My Automation
            </button>
          </form>

          <div id="successState" class="mt-8 hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-emerald-100">
            <div class="flex items-start gap-4">
              <div class="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-3xl">✅</div>
              <div class="space-y-2">
                <p class="text-xl font-bold">🎉 Success! Your LeadHammer automation is being configured. Check your phone for a test alert.</p>
                <span class="inline-flex rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">Configuration Verified</span>
              </div>
            </div>
          </div>

          <p id="formMessage" class="mt-4 min-h-5 text-sm text-slate-300" role="status" aria-live="polite"></p>
          <div id="formToast" class="pointer-events-none fixed right-4 top-4 z-50 hidden rounded-md border px-4 py-3 text-sm shadow-lg backdrop-blur"></div>
        </div>
      </section>
    </main>

    <footer class="border-t border-slate-800 py-8 text-center text-sm text-slate-400">
      © <span id="year"></span> LeadHammer Automation — Powered for handymen who move fast.
    </footer>

    <script>
      document.getElementById('year').textContent = new Date().getFullYear()
      if (window.location.search) {
        window.history.replaceState({}, '', window.location.pathname + window.location.hash)
      }

      const form = document.getElementById('bookingForm')
      const formMessage = document.getElementById('formMessage')
      const formToast = document.getElementById('formToast')
      const successState = document.getElementById('successState')
      const submitButton = document.getElementById('submitButton')
      let isSubmitted = false
      const defaultSubmitLabel = submitButton.textContent
      const serviceAreaZipsError = document.getElementById('serviceAreaZipsError')
      const primaryServiceCategoryError = document.getElementById('primaryServiceCategoryError')
      const customSmsIntroError = document.getElementById('customSmsIntroError')
      const dailyLeadLimitError = document.getElementById('dailyLeadLimitError')

      const showToast = (message, type = 'error') => {
        formToast.textContent = message
        formToast.className =
          'pointer-events-none fixed right-4 top-4 z-50 rounded-md border px-4 py-3 text-sm shadow-lg backdrop-blur ' +
          (type === 'success'
            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100'
            : 'border-red-500/40 bg-red-500/15 text-red-100')
        formToast.classList.remove('hidden')
        window.setTimeout(() => formToast.classList.add('hidden'), 5000)
      }

      const setFormMessage = (message, type = 'default') => {
        formMessage.textContent = message
        formMessage.className =
          'mt-4 min-h-5 text-sm ' +
          (type === 'success'
            ? 'text-emerald-300'
            : type === 'error'
              ? 'text-red-300'
              : 'text-slate-300')
      }

      const setSubmitting = (isSubmitting) => {
        submitButton.disabled = isSubmitting
        submitButton.textContent = isSubmitting ? 'Connecting to n8n...' : defaultSubmitLabel
      }

      const renderSubmissionState = () => {
        if (isSubmitted) {
          form.classList.add('hidden')
          formMessage.classList.add('hidden')
          successState.classList.remove('hidden')
          return
        }

        form.classList.remove('hidden')
        formMessage.classList.remove('hidden')
        successState.classList.add('hidden')
      }

      const hasValidPayloadShape = (payload) => {
        return (
          typeof payload.full_name === 'string' &&
          typeof payload.email_address === 'string' &&
          typeof payload.phone_number === 'string' &&
          Array.isArray(payload.service_area_zips) &&
          payload.service_area_zips.every((zip) => typeof zip === 'string') &&
          Array.isArray(payload.standard_availability) &&
          payload.standard_availability.every((slot) => typeof slot === 'string') &&
          typeof payload.primary_service_category === 'string' &&
          typeof payload.custom_sms_intro === 'string' &&
          typeof payload.daily_lead_limit === 'number'
        )
      }

      const handleFormSubmit = async () => {
        console.log('Submitting to n8n...')
        setFormMessage('')

        const formData = new FormData(form)
        serviceAreaZipsError.textContent = ''
        primaryServiceCategoryError.textContent = ''
        customSmsIntroError.textContent = ''
        dailyLeadLimitError.textContent = ''

        const serviceAreaZips = String(formData.get('service_area_zips') || '')
          .split(/[,\\n]/)
          .map((zip) => zip.replace(/\\s+/g, ''))
          .filter(Boolean)

        if (serviceAreaZips.length === 0) {
          serviceAreaZipsError.textContent = 'Please enter at least one 5-digit ZIP code.'
          return
        }

        if (serviceAreaZips.some((zip) => !/^\\d{5}$/.test(zip))) {
          serviceAreaZipsError.textContent = 'Please enter valid 5-digit ZIP codes only.'
          return
        }

        const primaryServiceCategory = String(formData.get('primary_service_category') || '').trim()
        if (!primaryServiceCategory) {
          primaryServiceCategoryError.textContent = 'Please select your primary service category to configure the automation.'
          return
        }

        const customSmsIntro = String(formData.get('custom_sms_intro') || '').trim()
        if (customSmsIntro.length < 20) {
          customSmsIntroError.textContent = 'Please enter at least 20 characters for your Custom SMS Intro.'
          return
        }

        const dailyLeadLimit = Number.parseInt(String(formData.get('daily_lead_limit') || ''), 10)
        if (Number.isNaN(dailyLeadLimit) || dailyLeadLimit < 1 || dailyLeadLimit > 50) {
          dailyLeadLimitError.textContent = 'Please enter a Daily Lead Limit between 1 and 50.'
          return
        }

        const standardAvailability = formData
          .getAll('standard_availability')
          .map((value) => String(value).trim())
          .filter(Boolean)

        if (standardAvailability.length === 0) {
          setFormMessage('Please select at least one Standard Availability window.', 'error')
          return
        }

        const payload = {
          full_name: String(formData.get('full_name') || '').trim(),
          email_address: String(formData.get('email_address') || '').trim(),
          phone_number: String(formData.get('phone_number') || '').trim(),
          service_area_zips: serviceAreaZips,
          standard_availability: standardAvailability,
          primary_service_category: primaryServiceCategory,
          custom_sms_intro: customSmsIntro,
          daily_lead_limit: dailyLeadLimit
        }

        if (!hasValidPayloadShape(payload)) {
          setFormMessage('Connection error. Please try again or contact support.', 'error')
          showToast('Connection error. Please try again or contact support.', 'error')
          return
        }

        setSubmitting(true)
        setFormMessage('Connecting to n8n...')

        try {
          const response = await fetch('/api/lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
          console.log('n8n Response Received:', response)

          if (!response.ok) {
            setFormMessage('Connection error. Please try again or contact support.', 'error')
            showToast('Connection error. Please try again or contact support.', 'error')
            return
          }

          const data = await response.json()
          if (!data.ok) {
            setFormMessage('Connection error. Please try again or contact support.', 'error')
            showToast('Connection error. Please try again or contact support.', 'error')
            return
          }

          isSubmitted = true
          renderSubmissionState()
          window.history.replaceState({}, document.title, '/')
          showToast('Automation connected successfully.', 'success')
          form.reset()
        } catch {
          setFormMessage('Connection error. Please try again or contact support.', 'error')
          showToast('Connection error. Please try again or contact support.', 'error')
        } finally {
          setSubmitting(false)
        }
      }

      form.onsubmit = (event) => {
        event.preventDefault()
        handleFormSubmit()
      }

      renderSubmissionState()
    </script>
  </body>
</html>`)
})

export default app
