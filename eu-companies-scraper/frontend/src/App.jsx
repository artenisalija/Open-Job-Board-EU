import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === 'true'
const COMPANIES_DATA_URL = import.meta.env.VITE_COMPANIES_URL || ''
const SOURCE_HEALTH_URL = import.meta.env.VITE_SOURCE_HEALTH_URL || ''
const CARD_TITLE_MAX_CHARS = 70
const COUNTRY_TO_ISO = {
  austria: 'at',
  belgium: 'be',
  bulgaria: 'bg',
  croatia: 'hr',
  cyprus: 'cy',
  czechia: 'cz',
  'czech republic': 'cz',
  denmark: 'dk',
  estonia: 'ee',
  finland: 'fi',
  france: 'fr',
  germany: 'de',
  greece: 'gr',
  hungary: 'hu',
  ireland: 'ie',
  italy: 'it',
  latvia: 'lv',
  lithuania: 'lt',
  luxembourg: 'lu',
  malta: 'mt',
  netherlands: 'nl',
  poland: 'pl',
  portugal: 'pt',
  romania: 'ro',
  slovakia: 'sk',
  slovenia: 'si',
  spain: 'es',
  sweden: 'se',
  switzerland: 'ch',
  turkey: 'tr',
  'united kingdom': 'gb',
  russia: 'ru',
  norway: 'no',
}

const SOURCE_LOGO = {
  wikipedia: 'https://upload.wikimedia.org/wikipedia/commons/6/63/Wikipedia-logo.png',
  wikipedia_global: 'https://upload.wikimedia.org/wikipedia/commons/6/63/Wikipedia-logo.png',
  eu_startups: 'https://www.eu-startups.com/wp-content/uploads/2022/03/eu-startups-logo-2022.png',
  clutch: 'https://clutch.co/favicon.ico',
  themanifest: 'https://themanifest.com/favicon.ico',
}

function toggleInList(list, value) {
  if (list.includes(value)) {
    return list.filter((item) => item !== value)
  }
  return [...list, value]
}

function countryFlagUrl(country) {
  const key = (country || '').toLowerCase().trim()
  const iso = COUNTRY_TO_ISO[key]
  return iso ? `https://flagcdn.com/w40/${iso}.png` : ''
}

function sourceLogoUrl(source) {
  return SOURCE_LOGO[source] || ''
}

function companyLogoUrl(website) {
  if (!website) {
    return ''
  }
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(website)}`
}

function truncateText(value, maxChars) {
  if (!value) {
    return ''
  }
  if (value.length <= maxChars) {
    return value
  }
  return `${value.slice(0, maxChars - 1).trimEnd()}...`
}

function buildStatsFromCompanies(companies) {
  const companiesWithJobsCount = companies.filter((company) => (company.jobs || []).length > 0).length
  const totalJobsCount = companies.reduce((sum, company) => sum + (company.jobs || []).length, 0)
  return {
    companies_count: companies.length,
    companies_with_jobs_count: companiesWithJobsCount,
    total_jobs_count: totalJobsCount,
  }
}

function App() {
  const MOBILE_BREAKPOINT = 992
  const [companies, setCompanies] = useState([])
  const [stats, setStats] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [companyListSearch, setCompanyListSearch] = useState('')
  const [expanded, setExpanded] = useState({
    country: false,
    source: false,
    company: false,
    hasJobs: true,
  })
  const [selectedCountries, setSelectedCountries] = useState([])
  const [selectedSources, setSelectedSources] = useState([])
  const [selectedCompanies, setSelectedCompanies] = useState([])
  const [selectedHasJobs, setSelectedHasJobs] = useState(['with_jobs'])
  const [sortBy, setSortBy] = useState('company')
  const [sortOrder, setSortOrder] = useState('asc')
  const [selectedJobKey, setSelectedJobKey] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT)
  const [showMobileDetail, setShowMobileDetail] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError('')
      try {
        if (STATIC_MODE) {
          if (!COMPANIES_DATA_URL) {
            throw new Error('Static mode is enabled but VITE_COMPANIES_URL is not configured.')
          }
          const companiesRes = await fetch(COMPANIES_DATA_URL)
          if (!companiesRes.ok) {
            throw new Error(`Failed to load companies data (${companiesRes.status})`)
          }
          const companiesPayload = await companiesRes.json()
          const safeCompanies = Array.isArray(companiesPayload) ? companiesPayload : []
          setCompanies(safeCompanies)
          setStats(buildStatsFromCompanies(safeCompanies))

          if (SOURCE_HEALTH_URL) {
            try {
              const healthRes = await fetch(SOURCE_HEALTH_URL)
              if (healthRes.ok) {
                await healthRes.json()
              }
            } catch {
              // Ignore source health fetch failures in static mode.
            }
          }
        } else {
          const [companiesRes, statsRes] = await Promise.all([
            fetch(`${API_BASE}/companies`),
            fetch(`${API_BASE}/debug/stats`),
          ])
          if (!companiesRes.ok) {
            throw new Error(`Failed to load companies (${companiesRes.status})`)
          }
          const companiesPayload = await companiesRes.json()
          setCompanies(companiesPayload)
          if (statsRes.ok) {
            setStats(await statsRes.json())
          } else {
            setStats(buildStatsFromCompanies(companiesPayload))
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unexpected error.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const countryOptions = useMemo(
    () => [...new Set(companies.map((company) => company.country_of_origin))].filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [companies]
  )

  const sourceOptions = useMemo(
    () => [...new Set(companies.map((company) => company.source))].filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [companies]
  )

  const companyOptions = useMemo(
    () => [...new Set(companies.map((company) => company.name))].filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [companies]
  )

  const filteredCompanyOptions = useMemo(() => {
    const query = companyListSearch.trim().toLowerCase()
    if (!query) {
      return companyOptions
    }
    return companyOptions.filter((name) => name.toLowerCase().includes(query))
  }, [companyListSearch, companyOptions])

  const visibleCompanies = useMemo(() => {
    let list = [...companies]
    const q = searchTerm.trim().toLowerCase()

    if (selectedCountries.length > 0) {
      const set = new Set(selectedCountries)
      list = list.filter((company) => set.has(company.country_of_origin))
    }
    if (selectedSources.length > 0) {
      const set = new Set(selectedSources)
      list = list.filter((company) => set.has(company.source))
    }
    if (selectedCompanies.length > 0) {
      const set = new Set(selectedCompanies)
      list = list.filter((company) => set.has(company.name))
    }
    if (selectedHasJobs.length === 1) {
      if (selectedHasJobs[0] === 'with_jobs') {
        list = list.filter((company) => (company.jobs || []).length > 0)
      } else if (selectedHasJobs[0] === 'without_jobs') {
        list = list.filter((company) => (company.jobs || []).length === 0)
      }
    }
    if (q) {
      list = list.filter((company) => {
        const inCompany = company.name.toLowerCase().includes(q)
        const inCountry = company.country_of_origin.toLowerCase().includes(q)
        const inSource = company.source.toLowerCase().includes(q)
        const inJobs = (company.jobs || []).some(
          (job) => (job.title || '').toLowerCase().includes(q) || (job.url || '').toLowerCase().includes(q)
        )
        return inCompany || inCountry || inSource || inJobs
      })
    }

    const reverse = sortOrder === 'desc'
    if (sortBy === 'country') {
      list.sort((a, b) => a.country_of_origin.localeCompare(b.country_of_origin))
    } else if (sortBy === 'source') {
      list.sort((a, b) => a.source.localeCompare(b.source))
    } else if (sortBy === 'jobs_count') {
      list.sort((a, b) => (a.jobs?.length || 0) - (b.jobs?.length || 0))
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    if (reverse) {
      list.reverse()
    }
    return list
  }, [companies, searchTerm, selectedCountries, selectedSources, selectedCompanies, selectedHasJobs, sortBy, sortOrder])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCountries, selectedSources, selectedCompanies, selectedHasJobs, sortBy, sortOrder])

  const jobCards = useMemo(() => {
    const cards = []
    for (const company of visibleCompanies) {
      for (const job of company.jobs || []) {
        const key = `${company.name}::${job.url || job.title}`
        cards.push({
          key,
          title: job.title || 'Untitled role',
          url: job.url || '',
          company_name: company.name,
          company_website: company.website,
          career_page_url: company.career_page_url,
          country_of_origin: company.country_of_origin,
          source: company.source,
        })
      }
    }
    return cards
  }, [visibleCompanies])

  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(jobCards.length / pageSize))
  const paginatedJobCards = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return jobCards.slice(start, start + pageSize)
  }, [jobCards, currentPage])
  const pageNumbers = useMemo(() => {
    const pages = []
    const start = Math.max(1, currentPage - 2)
    const end = Math.min(totalPages, currentPage + 2)
    for (let i = start; i <= end; i += 1) {
      pages.push(i)
    }
    return pages
  }, [currentPage, totalPages])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!isMobile) {
      setShowMobileDetail(false)
    }
  }, [isMobile])

  useEffect(() => {
    if (paginatedJobCards.length === 0) {
      setSelectedJobKey('')
      setShowMobileDetail(false)
      return
    }
    if (!paginatedJobCards.some((job) => job.key === selectedJobKey)) {
      setSelectedJobKey(paginatedJobCards[0].key)
    }
  }, [paginatedJobCards, selectedJobKey])

  const selectedJob = useMemo(
    () => paginatedJobCards.find((job) => job.key === selectedJobKey) || null,
    [paginatedJobCards, selectedJobKey]
  )
  const showListColumn = !isMobile || !showMobileDetail
  const showDetailColumn = !isMobile || showMobileDetail

  function resetAllFilters() {
    setSearchTerm('')
    setCompanyListSearch('')
    setSelectedCountries([])
    setSelectedSources([])
    setSelectedCompanies([])
    setSelectedHasJobs([])
    setSortBy('company')
    setSortOrder('asc')
    setCurrentPage(1)
  }

  function toggleSection(section) {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  function sectionHeader(label, section) {
    const isOpen = expanded[section]
    return (
      <button type="button" className="list-expand-btn" onClick={() => toggleSection(section)}>
        <span className="plus-mark">{isOpen ? '-' : '+'}</span>
        <span>{label}</span>
      </button>
    )
  }

  function renderPaginator(extraClass = '') {
    return (
      <div className={`pagination-wrap ${extraClass}`}>
        <div className="small text-muted">
          Page {currentPage} of {totalPages}
        </div>
        <nav aria-label="Job results pages">
          <ul className="pagination pagination-sm mb-0">
            <li className={`page-item ${currentPage <= 1 ? 'disabled' : ''}`}>
              <button
                type="button"
                className="page-link"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
            </li>

            {pageNumbers[0] > 1 && (
              <>
                <li className="page-item">
                  <button type="button" className="page-link" onClick={() => setCurrentPage(1)}>
                    1
                  </button>
                </li>
                {pageNumbers[0] > 2 && (
                  <li className="page-item disabled">
                    <span className="page-link">...</span>
                  </li>
                )}
              </>
            )}

            {pageNumbers.map((page) => (
              <li key={page} className={`page-item ${page === currentPage ? 'active' : ''}`}>
                <button type="button" className="page-link" onClick={() => setCurrentPage(page)}>
                  {page}
                </button>
              </li>
            ))}

            {pageNumbers[pageNumbers.length - 1] < totalPages && (
              <>
                {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
                  <li className="page-item disabled">
                    <span className="page-link">...</span>
                  </li>
                )}
                <li className="page-item">
                  <button type="button" className="page-link" onClick={() => setCurrentPage(totalPages)}>
                    {totalPages}
                  </button>
                </li>
              </>
            )}

            <li className={`page-item ${currentPage >= totalPages ? 'disabled' : ''}`}>
              <button
                type="button"
                className="page-link"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </li>
          </ul>
        </nav>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <nav className="navbar navbar-expand-lg shadow-sm app-navbar">
        <div className="container">
          <span className="navbar-brand fw-bold text-primary">Open Job Board EU</span>
          <span className="badge text-bg-light border d-inline-flex align-items-center gap-2">
            <img className="inline-icon" src="https://flagcdn.com/w40/eu.png" alt="EU" />
            EU Jobs
          </span>
        </div>
      </nav>

      <main className="container py-4 fixed-main">
        <div className="search-row mb-3">
          <button
            type="button"
            className="btn btn-primary filter-open-btn"
            onClick={() => setShowFilters(true)}
            aria-label="Open filters"
            title="Open filters"
          >
            &#9776;
          </button>
          <input
            className="form-control search-input"
            placeholder="Search jobs, company, country or source..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {showFilters && <div className="filter-backdrop" onClick={() => setShowFilters(false)} />}
        <aside className={`filter-drawer ${showFilters ? 'open' : ''}`}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="h5 mb-0">Filter Lists</h2>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowFilters(false)}>
              Close
            </button>
          </div>

          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body">
              <label className="form-label">Sort By</label>
              <select className="form-select mb-2" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="company">Company</option>
                <option value="country">Country</option>
                <option value="source">Source</option>
                <option value="jobs_count">Jobs Count</option>
              </select>
              <label className="form-label">Order</label>
              <select className="form-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
              <div className="d-flex gap-2 mt-3">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={resetAllFilters}>
                  Reset all
                </button>
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body">
              {sectionHeader('Country', 'country')}
              {expanded.country && (
                <div className="checkbox-list mt-2">
                  {countryOptions.map((country) => (
                    <div key={country} className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`country-${country}`}
                        checked={selectedCountries.includes(country)}
                        onChange={() => setSelectedCountries((prev) => toggleInList(prev, country))}
                      />
                      <label className="form-check-label small" htmlFor={`country-${country}`}>
                        {country}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body">
              {sectionHeader('Source', 'source')}
              {expanded.source && (
                <div className="checkbox-list mt-2">
                  {sourceOptions.map((source) => (
                    <div key={source} className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`source-${source}`}
                        checked={selectedSources.includes(source)}
                        onChange={() => setSelectedSources((prev) => toggleInList(prev, source))}
                      />
                      <label className="form-check-label small" htmlFor={`source-${source}`}>
                        {source}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body">
              {sectionHeader('Company', 'company')}
              {expanded.company && (
                <>
                  <input
                    className="form-control form-control-sm mt-2"
                    placeholder="Find company..."
                    value={companyListSearch}
                    onChange={(e) => setCompanyListSearch(e.target.value)}
                  />
                  <div className="checkbox-list mt-2">
                    {filteredCompanyOptions.map((name) => (
                      <div key={name} className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`company-${name}`}
                          checked={selectedCompanies.includes(name)}
                          onChange={() => setSelectedCompanies((prev) => toggleInList(prev, name))}
                        />
                        <label className="form-check-label small" htmlFor={`company-${name}`}>
                          {name}
                        </label>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card border-0 shadow-sm">
            <div className="card-body">
              {sectionHeader('Has Jobs', 'hasJobs')}
              {expanded.hasJobs && (
                <div className="checkbox-list mt-2">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="with-jobs"
                      checked={selectedHasJobs.includes('with_jobs')}
                      onChange={() => setSelectedHasJobs((prev) => toggleInList(prev, 'with_jobs'))}
                    />
                    <label className="form-check-label small" htmlFor="with-jobs">
                      With jobs
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="without-jobs"
                      checked={selectedHasJobs.includes('without_jobs')}
                      onChange={() => setSelectedHasJobs((prev) => toggleInList(prev, 'without_jobs'))}
                    />
                    <label className="form-check-label small" htmlFor="without-jobs">
                      Without jobs
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {error && <div className="alert alert-danger">{error}</div>}
        {loading && <div className="alert alert-info">Loading companies...</div>}

        <div className="d-flex justify-content-between align-items-center mb-2">
          <h2 className="h5 mb-0">Job Listings</h2>
          <div className="d-flex flex-wrap gap-2 justify-content-end">
            <span className="badge text-bg-secondary">Companies Loaded: {stats?.companies_count ?? '-'}</span>
            <span className="badge text-bg-success">Companies With Jobs: {stats?.companies_with_jobs_count ?? '-'}</span>
            <span className="badge text-bg-primary">{jobCards.length} results</span>
          </div>
        </div>

        <div className="row g-3">
          {showListColumn && (
            <div className="col-12 col-lg-7 jobs-column">
              <div className="job-list-container">
                <div className="job-list">
                  {paginatedJobCards.map((job) => (
                    <button
                      type="button"
                      key={job.key}
                      className={`card border-0 shadow-sm mb-2 job-card ${selectedJobKey === job.key ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedJobKey(job.key)
                        if (isMobile) {
                          setShowMobileDetail(true)
                        }
                      }}
                    >
                      <div className="card-body text-start job-card-content">
                        <div className="job-main">
                          <div className="job-title-main mb-2" title={job.title}>
                            {truncateText(job.title, CARD_TITLE_MAX_CHARS)}
                          </div>
                          <div className="company-row company-inline">
                            <span className="icon-dot" title={job.company_name}>
                              <img className="inline-icon" src={companyLogoUrl(job.company_website)} alt={job.company_name} />
                            </span>
                            <span className="company-name-text">{job.company_name}</span>
                          </div>
                        </div>
                        <div className="job-meta-right">
                          {countryFlagUrl(job.country_of_origin) ? (
                            <span className="icon-dot" title={job.country_of_origin}>
                              <img className="inline-icon" src={countryFlagUrl(job.country_of_origin)} alt={job.country_of_origin} />
                            </span>
                          ) : null}
                          {sourceLogoUrl(job.source) ? (
                            <span className="icon-dot" title={job.source}>
                              <img className="inline-icon" src={sourceLogoUrl(job.source)} alt={job.source} />
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            {renderPaginator('mt-3')}
            </div>
          )}

          {showDetailColumn && (
            <div className="col-12 col-lg-5 detail-column">
            <div className="card border-0 shadow-sm job-detail-card">
              <div className="card-body">
                {selectedJob ? (
                  <>
                    {isMobile && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm mb-3"
                        onClick={() => setShowMobileDetail(false)}
                      >
                        Back to job list
                      </button>
                    )}
                    <h3 className="h4 mb-2">{selectedJob.title}</h3>
                    <div className="mb-2">
                      <span className="badge company-badge">
                        <img className="inline-icon" src={companyLogoUrl(selectedJob.company_website)} alt="" />
                        {selectedJob.company_name}
                      </span>
                    </div>
                    <div className="d-flex gap-2 flex-wrap mb-3">
                      <span className="badge text-bg-light border icon-badge">
                        {countryFlagUrl(selectedJob.country_of_origin) ? (
                          <img className="inline-icon" src={countryFlagUrl(selectedJob.country_of_origin)} alt="" />
                        ) : null}
                        {selectedJob.country_of_origin}
                      </span>
                      <span className="badge text-bg-light border icon-badge">
                        {sourceLogoUrl(selectedJob.source) ? (
                          <img className="inline-icon" src={sourceLogoUrl(selectedJob.source)} alt="" />
                        ) : null}
                        {selectedJob.source}
                      </span>
                    </div>

                    <div className="detail-grid mb-3">
                      <div className="detail-label">Job URL</div>
                      <a className="detail-value" href={selectedJob.url} target="_blank" rel="noreferrer">
                        {selectedJob.url}
                      </a>

                      <div className="detail-label">Career Page</div>
                      <a className="detail-value" href={selectedJob.career_page_url} target="_blank" rel="noreferrer">
                        {selectedJob.career_page_url}
                      </a>

                      <div className="detail-label">Company Website</div>
                      <a className="detail-value" href={selectedJob.company_website} target="_blank" rel="noreferrer">
                        {selectedJob.company_website}
                      </a>
                    </div>

                  </>
                ) : (
                  <div className="text-muted">Select a job card to view details.</div>
                )}
              </div>
            </div>
              <div className="detail-actions-row mt-2">
                {selectedJob ? (
                <a
                  className="btn btn-success btn-sm detail-action-btn"
                  href={selectedJob.url || selectedJob.career_page_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Apply Now
                </a>
                ) : (
                  <button type="button" className="btn btn-success btn-sm detail-action-btn" disabled>
                    Apply Now
                  </button>
                )}
                {selectedJob ? (
                <a
                  className="btn btn-outline-primary btn-sm detail-action-btn"
                  href={selectedJob.career_page_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Career Page
                </a>
                ) : (
                  <button type="button" className="btn btn-outline-primary btn-sm detail-action-btn" disabled>
                    Career Page
                  </button>
                )}
                {selectedJob ? (
                <a
                  className="btn btn-outline-secondary btn-sm detail-action-btn"
                  href={selectedJob.company_website}
                  target="_blank"
                  rel="noreferrer"
                >
                  Company
                </a>
                ) : (
                  <button type="button" className="btn btn-outline-secondary btn-sm detail-action-btn" disabled>
                    Company
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
