import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import moldsJson from './data/molds.json'
import logo from './assets/img-logo.jpg'
import './App.css'

type Material = 'Alüminyum' | 'Bakır'

interface Mold {
  sheetName: string
  material: string | null
  kalipNo: number | null
  anmaOlculsuA: number | string | null
  anmaOlculsuB: number | string | null
  kalipOlculsu: number | string | null
}

interface MoldsFile {
  source: { fileName: string }
  molds: Mold[]
}

interface MoldRecord {
  key: string
  material: Material
  kalipNo: number
  a: number
  b: number
  kalipOlculsu: number | string | null
}

interface MatchedMold {
  record: MoldRecord
  deltaA: number
  deltaB: number
}

interface SearchResult {
  status: 'exact' | 'near' | 'empty'
  matches: MatchedMold[]
  swapped: boolean
  query: { material: Material; a: number; b: number }
}

const MATERIALS: Material[] = ['Alüminyum', 'Bakır']
const TOLERANCE = 0.011
const NEAR_LIMIT = 1
const NEAR_RESULT_LIMIT = 6

const numberFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })
const countFormat = new Intl.NumberFormat('tr-TR')

const allMolds: Mold[] = (moldsJson as MoldsFile).molds ?? []

function isMaterial(value: string | null): value is Material {
  return value === 'Alüminyum' || value === 'Bakır'
}

function toMeasure(value: number | string | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value
}

function parseMeasure(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) && value > 0 ? value : null
}

function formatMeasure(value: number): string {
  return numberFormat.format(Number(value.toFixed(2)))
}

function formatDelta(delta: number): string {
  if (Math.abs(delta) < 0.005) return '0'
  return `${delta > 0 ? '+' : '−'}${formatMeasure(Math.abs(delta))}`
}

const records: MoldRecord[] = allMolds.flatMap((mold, index) => {
  const a = toMeasure(mold.anmaOlculsuA)
  const b = toMeasure(mold.anmaOlculsuB)
  if (!isMaterial(mold.material) || mold.kalipNo === null || a === null || b === null) {
    return []
  }
  return [
    {
      key: `${mold.material}-${mold.kalipNo}-${index}`,
      material: mold.material,
      kalipNo: mold.kalipNo,
      a,
      b,
      kalipOlculsu: mold.kalipOlculsu,
    },
  ]
})

const counts: Record<Material, number> = {
  Alüminyum: records.filter((record) => record.material === 'Alüminyum').length,
  Bakır: records.filter((record) => record.material === 'Bakır').length,
}

function searchMolds(material: Material, a: number, b: number): SearchResult {
  const pool = records.filter((record) => record.material === material)
  const findExact = (x: number, y: number) =>
    pool.filter(
      (record) => Math.abs(record.a - x) <= TOLERANCE && Math.abs(record.b - y) <= TOLERANCE,
    )

  let exact = findExact(a, b)
  let swapped = false

  if (exact.length === 0 && Math.abs(a - b) > TOLERANCE) {
    const reversed = findExact(b, a)
    if (reversed.length > 0) {
      exact = reversed
      swapped = true
    }
  }

  if (exact.length > 0) {
    return {
      status: 'exact',
      swapped,
      query: { material, a, b },
      matches: exact
        .map((record) => ({
          record,
          deltaA: record.a - a,
          deltaB: record.b - b,
        }))
        .sort((x, y) => x.record.kalipNo - y.record.kalipNo),
    }
  }

  const nearest = pool
    .map((record) => ({
      record,
      deltaA: record.a - a,
      deltaB: record.b - b,
      distance: Math.hypot(record.a - a, record.b - b),
    }))
    .filter((match) => match.distance <= NEAR_LIMIT)
    .sort((x, y) => x.distance - y.distance || x.record.kalipNo - y.record.kalipNo)
    .slice(0, NEAR_RESULT_LIMIT)

  return {
    status: nearest.length > 0 ? 'near' : 'empty',
    swapped: false,
    query: { material, a, b },
    matches: nearest.map(({ record, deltaA, deltaB }) => ({ record, deltaA, deltaB })),
  }
}

function resultTitle(result: SearchResult): { headline: string; detail: string } {
  const count = result.matches.length
  if (result.status === 'exact') {
    return {
      headline: count === 1 ? 'Kalıp bulundu' : `${count} kalıp bulundu`,
      detail: `${result.query.material} · A ${formatMeasure(result.query.a)} × B ${formatMeasure(result.query.b)} mm`,
    }
  }
  if (result.status === 'near') {
    return {
      headline: 'Tam eşleşme bulunamadı',
      detail: `En yakın ${count} kalıp listeleniyor · A ${formatMeasure(result.query.a)} × B ${formatMeasure(result.query.b)} mm`,
    }
  }
  return {
    headline: 'Kalıp bulunamadı',
    detail: `${result.query.material} listesinde bu ölçülere yakın bir kayıt yok`,
  }
}

export default function App() {
  const [material, setMaterial] = useState<Material>('Alüminyum')
  const [aInput, setAInput] = useState('')
  const [bInput, setBInput] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)

  const aRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLElement>(null)

  useEffect(() => {
    aRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!result) return
    const timer = window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 60)
    return () => window.clearTimeout(timer)
  }, [result])

  const materialOptions = useMemo(
    () =>
      MATERIALS.map((option) => ({
        value: option,
        label: option,
        count: counts[option],
      })),
    [],
  )

  function chooseMaterial(next: Material) {
    if (next === material) return
    setMaterial(next)
    setError('')
    setResult(null)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const a = parseMeasure(aInput)
    const b = parseMeasure(bInput)

    if (a === null || b === null) {
      setError('A ve B ölçülerini 0’dan büyük sayı olarak girin (örn. 12,4).')
      return
    }

    setError('')
    setResult(searchMolds(material, a, b))
  }

  function handleReset() {
    setAInput('')
    setBInput('')
    setError('')
    setResult(null)
    aRef.current?.focus()
  }

  const title = result ? resultTitle(result) : null

  return (
    <div className={`app${material === 'Bakır' ? ' is-copper' : ''}`}>
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark">
            <img src={logo} alt="IMG" className="brand-logo" />
          </span>
          <div>
            <h1>Kalıp Arama</h1>
            <p className="subtitle">Cu-Al Kalıp Listesi · ölçüye göre kalıp numarası bulma</p>
          </div>
        </div>
        <span className="record-badge">{countFormat.format(records.length)} kayıt</span>
      </header>

      <form className="search-card" onSubmit={handleSubmit} noValidate>
        <div className="search-field">
          <span className="section-label">Malzeme</span>
          <div className="material-options" role="radiogroup" aria-label="Malzeme">
            {materialOptions.map((option) => (
              <label
                key={option.value}
                className={`material-option${material === option.value ? ' selected' : ''}`}
              >
                <input
                  type="radio"
                  name="material"
                  value={option.value}
                  checked={material === option.value}
                  onChange={() => chooseMaterial(option.value)}
                />
                <span className="material-dot" aria-hidden="true" />
                <span className="material-text">
                  <span className="material-name">{option.label}</span>
                  <span className="material-count">
                    {countFormat.format(option.count)} kalıp
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="search-field">
          <span className="section-label">Ölçüler</span>
          <div className="dimension-grid">
            <div className="field">
              <label htmlFor="measure-a">A ölçüsü</label>
              <div className="input-wrap">
                <input
                  ref={aRef}
                  id="measure-a"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={7}
                  placeholder="0,00"
                  value={aInput}
                  aria-invalid={error !== ''}
                  onChange={(event) => setAInput(event.target.value)}
                />
                <span className="unit">mm</span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="measure-b">B ölçüsü</label>
              <div className="input-wrap">
                <input
                  id="measure-b"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={7}
                  placeholder="0,00"
                  value={bInput}
                  aria-invalid={error !== ''}
                  onChange={(event) => setBInput(event.target.value)}
                />
                <span className="unit">mm</span>
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="search-actions">
          <button type="submit" className="search-btn">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.4-3.4" />
            </svg>
            Ara
          </button>
          {aInput || bInput || result ? (
            <button type="button" className="ghost-btn" onClick={handleReset}>
              Temizle
            </button>
          ) : null}
        </div>
      </form>

      {result ? (
        <section className="results" ref={resultsRef} aria-live="polite">
          <div className="results-head">
            <div>
              <h2 className="result-headline">{title?.headline}</h2>
              <p className="result-detail">{title?.detail}</p>
            </div>
            <span className={`status-pill status-${result.status}`}>
              {result.status === 'exact'
                ? 'Eşleşme'
                : result.status === 'near'
                  ? 'En yakın'
                  : 'Sonuç yok'}
            </span>
          </div>

          {result.swapped ? (
            <p className="notice">A ve B ölçüleri ters girilmiş olabilir; sonuç buna göre eşleştirildi.</p>
          ) : null}

          {result.matches.length > 0 ? (
            <div className="mold-cards">
              {result.matches.map((match) => (
                <article className="mold-card" key={match.record.key}>
                  <span className="mold-card-label">Kalıp No</span>
                  <p className="mold-card-no">{match.record.kalipNo}</p>
                  <div className="mold-card-dims">
                    <span>
                      A {formatMeasure(match.record.a)} × B {formatMeasure(match.record.b)} mm
                    </span>
                    {match.record.kalipOlculsu !== null ? (
                      <span className="mold-card-kalip">
                        Kalıp ölçüsü: {String(match.record.kalipOlculsu)}
                      </span>
                    ) : null}
                  </div>
                  {result.status === 'near' ? (
                    <div className="delta-row">
                      <span className="delta-chip">A {formatDelta(match.deltaA)}</span>
                      <span className="delta-chip">B {formatDelta(match.deltaB)}</span>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-copy">
              Ölçüleri kontrol edip tekrar deneyin. Ondalık ayırıcı olarak virgül veya nokta
              kullanabilirsiniz.
            </p>
          )}
        </section>
      ) : null}

      <footer className="site-footer">
        <span>Cu-Al Kalıp Listesi</span>
        <span>{countFormat.format(records.length)} geçerli ölçü kaydı</span>
      </footer>
    </div>
  )
}
