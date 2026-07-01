'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { Form, Campaign } from '@/lib/types'

interface Props {
  form: Form & { campaigns?: Campaign | null }
  campaign: Campaign | null
  trackingParams: {
    utm_source: string
    utm_medium: string
    utm_campaign: string
    ttclid: string
    fbclid: string
  }
}

// Script injected into the sandboxed iframe. It runs in an opaque origin
// (no allow-same-origin) so it cannot touch the parent page. It only
// intercepts form submits, collects every [name] input, and posts the
// values up to the parent via postMessage.
const BRIDGE_SCRIPT = `
<script>
(function () {
  function collect(form) {
    var data = {};
    var els = form.querySelectorAll('[name]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var name = el.getAttribute('name');
      if (!name) continue;
      var type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'checkbox') { data[name] = el.checked ? (el.value || 'true') : ''; }
      else if (type === 'radio') { if (el.checked) data[name] = el.value; }
      else { data[name] = el.value; }
    }
    return data;
  }
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = collect(e.target || document.querySelector('form') || document.body);
    parent.postMessage({ __rafeeq: true, type: 'submit', data: data }, '*');
  }, true);
  function reportHeight() {
    var h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    parent.postMessage({ __rafeeq: true, type: 'height', height: h }, '*');
  }
  window.addEventListener('load', reportHeight);
  window.addEventListener('resize', reportHeight);
  setTimeout(reportHeight, 300);
  window.addEventListener('message', function (e) {
    if (e.data && e.data.__rafeeqParent && e.data.type === 'submitted') {
      document.body.innerHTML =
        '<div style="font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;direction:rtl;text-align:center;padding:64px 20px;color:#16a34a;font-weight:700;font-size:1.25rem">شكراً لك! تم استلام بياناتك بنجاح.</div>';
      reportHeight();
    }
  });
})();
<\/script>
`

export default function HtmlFormView({ form, campaign, trackingParams }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(600)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      const iframe = iframeRef.current
      if (!iframe || e.source !== iframe.contentWindow) return
      const msg = e.data
      if (!msg || !msg.__rafeeq) return

      if (msg.type === 'height' && typeof msg.height === 'number') {
        setHeight(Math.max(300, Math.ceil(msg.height)))
        return
      }

      if (msg.type === 'submit') {
        try {
          const res = await fetch('/api/leads/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              form_id: form.id,
              campaign_id: form.campaign_id,
              tenant_id: form.tenant_id,
              data: msg.data || {},
              source: trackingParams.utm_source || campaign?.source || 'direct',
              ...trackingParams,
            }),
          })
          if (!res.ok) throw new Error('capture failed')
          iframe.contentWindow?.postMessage({ __rafeeqParent: true, type: 'submitted' }, '*')
          setSubmitted(true)
        } catch {
          setError('حدث خطأ ما. يرجى المحاولة مرة أخرى.')
        }
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [form.id, form.campaign_id, form.tenant_id, campaign, trackingParams])

  const srcDoc = (form.html || '') + BRIDGE_SCRIPT

  return (
    <div className="min-h-screen bg-surface2">
      {error && (
        <div className="fixed top-4 inset-x-4 z-50 mx-auto max-w-md badge-red rounded-xl text-sm px-4 py-2.5 text-center">
          {error}
        </div>
      )}
      {submitted && (
        <div className="fixed top-4 inset-x-4 z-50 mx-auto max-w-md flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
          <CheckCircle2 size={16} /> تم استلام بياناتك بنجاح
        </div>
      )}
      <iframe
        ref={iframeRef}
        title={form.name}
        srcDoc={srcDoc}
        className="w-full block border-0"
        style={{ height }}
        sandbox="allow-scripts allow-popups allow-forms allow-modals"
      />
    </div>
  )
}
