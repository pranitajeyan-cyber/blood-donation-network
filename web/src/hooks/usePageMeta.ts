import { useEffect } from 'react'

const SITE_NAME = 'Blood Donation Network'

function ensureMeta(selector: string, attr: 'name' | 'property', key: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(selector)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    document.head.appendChild(tag)
  }
  return tag
}

function ensureLink(rel: string) {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!tag) {
    tag = document.createElement('link')
    tag.rel = rel
    document.head.appendChild(tag)
  }
  return tag
}

/**
 * Per-route document metadata.
 *
 * This is a client-rendered SPA, so the crawler-visible title and description
 * are written at runtime. That keeps the tab honest and means a shared link
 * previews the page it actually points at instead of every route inheriting
 * the landing page's copy.
 *
 * Canonical and `og:url` are derived from `window.location.origin`, not from a
 * baked-in domain, so a deployment is correct on whatever host serves it.
 *
 * Console routes pass `noindex`: they sit behind a JWT and there is nothing
 * there worth returning in a search result.
 */
export function usePageMeta({
  title,
  description,
  noindex = false,
}: {
  title: string
  description: string
  noindex?: boolean
}) {
  useEffect(() => {
    const full = title === SITE_NAME ? title : `${title} — ${SITE_NAME}`
    const url = `${window.location.origin}${window.location.pathname}`
    const image = `${window.location.origin}/og.png`

    document.title = full

    ensureMeta('meta[name="description"]', 'name', 'description').content = description
    ensureMeta('meta[name="robots"]', 'name', 'robots').content = noindex
      ? 'noindex, nofollow'
      : 'index, follow'

    ensureMeta('meta[property="og:title"]', 'property', 'og:title').content = full
    ensureMeta('meta[property="og:description"]', 'property', 'og:description').content =
      description
    ensureMeta('meta[property="og:url"]', 'property', 'og:url').content = url
    ensureMeta('meta[property="og:image"]', 'property', 'og:image').content = image

    ensureMeta('meta[name="twitter:title"]', 'name', 'twitter:title').content = full
    ensureMeta(
      'meta[name="twitter:description"]',
      'name',
      'twitter:description',
    ).content = description
    ensureMeta('meta[name="twitter:image"]', 'name', 'twitter:image').content = image

    ensureLink('canonical').href = url
  }, [title, description, noindex])
}
