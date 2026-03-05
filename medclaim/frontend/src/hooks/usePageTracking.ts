/**
 * usePageTracking — records a page view to /api/site-analytics/pageview
 * on every route change. Uses a persistent anonymous session ID stored in
 * localStorage so we can count unique visitors without cookies.
 */

import { useEffect } from "react"
import { useLocation } from "react-router-dom"

const BASE_URL = import.meta.env.VITE_API_URL ?? ""

function getSessionId(): string {
  const KEY = "mc_session_id"
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(KEY, id)
  }
  return id
}

export function usePageTracking() {
  const location = useLocation()

  useEffect(() => {
    // Fire-and-forget — don't block UI
    const token = localStorage.getItem("mc_token")
    fetch(`${BASE_URL}/api/site-analytics/pageview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        path: location.pathname,
        referrer: document.referrer || "",
        session_id: getSessionId(),
      }),
    }).catch(() => {
      // silently ignore errors — analytics should never break the app
    })
  }, [location.pathname])
}
