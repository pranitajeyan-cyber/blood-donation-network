import { useState } from 'react'

import { api } from '../api/client'
import type { InventoryItem } from '../api/types'
import { ConsoleFrame } from '../components/AppShell'
import { ErrorState, InlineNotice, LoadingState, RefreshingBar } from '../components/States'
import { Badge, Button, EmptyState, Panel, Stat } from '../components/ui'
import { useApi, useMutation } from '../hooks/useApi'
import { HOSPITAL_NAV } from './HospitalHome'
const LOW_THRESHOLD = 2

export default function HospitalInventory() {
  const inventory = useApi<InventoryItem[]>(() => api.inventory(), [])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)

  const setStock = useMutation((group: string, units: number) =>
    api.setInventory(group, units),
  )
  const adjust = useMutation((group: string, delta: number) =>
    api.adjustInventory({ blood_group: group as InventoryItem['blood_group'], delta }),
  )

  const stock = inventory.data ?? []
  const total = stock.reduce((sum, item) => sum + item.units_in_stock, 0)
  const low = stock.filter((item) => item.units_in_stock <= LOW_THRESHOLD)

  function draftValue(item: InventoryItem) {
    return drafts[item.blood_group] ?? String(item.units_in_stock)
  }

  async function commit(item: InventoryItem) {
    const raw = drafts[item.blood_group]
    if (raw === undefined) return
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setNotice(`"${raw}" is not a valid stock level.`)
      return
    }
    setNotice(null)
    const result = await setStock.mutate(item.blood_group, Math.round(parsed))
    if (result) {
      setNotice(`${result.blood_group} set to ${result.units_in_stock} units.`)
      setDrafts((current) => {
        const next = { ...current }
        delete next[item.blood_group]
        return next
      })
      await inventory.reload()
    }
  }

  async function nudge(item: InventoryItem, delta: number) {
    setNotice(null)
    const result = await adjust.mutate(item.blood_group, delta)
    if (result) {
      setNotice(
        `${result.blood_group} adjusted to ${result.units_in_stock} units.`,
      )
      setDrafts((current) => {
        const next = { ...current }
        delete next[item.blood_group]
        return next
      })
      await inventory.reload()
    }
  }

  return (
    <ConsoleFrame section="Blood bank console" nav={HOSPITAL_NAV}>
      <div className="console-grid console-grid--full">
        <div className="console-grid__main">
          <Panel
            eyebrow="Cold storage"
            title={`${total} units across ${stock.length} blood groups`}
            action={<RefreshingBar visible={inventory.refreshing} />}
          >
            {inventory.loading && <LoadingState label="Counting stock" rows={3} />}

            {inventory.error && (
              <ErrorState message={inventory.error} onRetry={() => void inventory.reload()} />
            )}

            {inventory.data && stock.length === 0 && (
              <EmptyState
                title="No inventory rows yet"
                body="Inventory rows are created with the hospital. If none exist, run the seed script or contact the platform admin."
              />
            )}

            {(setStock.error || adjust.error) && (
              <InlineNotice tone="danger">{setStock.error ?? adjust.error}</InlineNotice>
            )}
            {notice && <InlineNotice tone="ok">{notice}</InlineNotice>}

            {stock.length > 0 && (
              <>
                <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                  Adjusting by a delta moves stock the way a real fridge works — a unit
                  enters or leaves. Setting a value overwrites the shelf count after a
                  physical audit. Neither is allowed to take stock below zero.
                </p>

                <div className="inventory-grid">
                  {stock.map((item) => {
                    const isLow = item.units_in_stock <= LOW_THRESHOLD
                    const editing = drafts[item.blood_group] !== undefined
                    return (
                      <div className="inventory-card" key={item.blood_group}>
                        <div className="inventory-card__top">
                          <span className="inventory-card__group">{item.blood_group}</span>
                          <Badge tone={isLow ? 'warn' : 'cool'}>
                            {item.units_in_stock} u
                          </Badge>
                        </div>

                        <div className="stepper">
                          <button
                            type="button"
                            className="stepper__btn"
                            aria-label={`Remove one unit of ${item.blood_group}`}
                            disabled={item.units_in_stock === 0 || adjust.pending}
                            onClick={() => void nudge(item, -1)}
                          >
                            −
                          </button>

                          <input
                            className="stepper__input"
                            inputMode="numeric"
                            aria-label={`${item.blood_group} units in stock`}
                            value={draftValue(item)}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [item.blood_group]: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void commit(item)
                              if (event.key === 'Escape') {
                                setDrafts((current) => {
                                  const next = { ...current }
                                  delete next[item.blood_group]
                                  return next
                                })
                              }
                            }}
                          />

                          <button
                            type="button"
                            className="stepper__btn"
                            aria-label={`Add one unit of ${item.blood_group}`}
                            disabled={adjust.pending}
                            onClick={() => void nudge(item, 1)}
                          >
                            +
                          </button>
                        </div>

                        {editing && (
                          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                            <Button
                              size="sm"
                              variant="primary"
                              busy={setStock.pending}
                              onClick={() => void commit(item)}
                            >
                              Set
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setDrafts((current) => {
                                  const next = { ...current }
                                  delete next[item.blood_group]
                                  return next
                                })
                              }
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </Panel>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--s-5)' }}>
          <Panel eyebrow="Totals">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
              <Stat value={total} label="units on the shelf" />
              <Stat value={stock.length} label="blood groups tracked" />
              <Stat
                value={low.length}
                label={`groups at or below ${LOW_THRESHOLD} units`}
              />
            </div>
          </Panel>

          <Panel eyebrow="How forecast uses this">
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              The admin forecast compares this shelf count against the predicted draw for
              each group. A group is flagged high-risk when stock cannot cover the forecast —
              which is why keeping these numbers honest matters more than keeping them high.
            </p>
          </Panel>
        </div>
      </div>
    </ConsoleFrame>
  )
}
