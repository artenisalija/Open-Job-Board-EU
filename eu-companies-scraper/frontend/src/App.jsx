import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, Menu } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

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

function toId(prefix, value) {
  return `${prefix}-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function App() {
  const MOBILE_BREAKPOINT = 1024
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
      <Button
        type='button'
        variant='ghost'
        className='h-8 w-full justify-start px-0 text-primary hover:bg-transparent hover:text-primary/80'
        onClick={() => toggleSection(section)}
      >
        <span className='inline-block w-4 text-center'>{isOpen ? '-' : '+'}</span>
        <span>{label}</span>
      </Button>
    )
  }

  function renderPaginator(extraClass = '') {
    return (
      <div className={cn('mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/70 p-3', extraClass)}>
        <span className='text-xs text-muted-foreground'>
          Page {currentPage} of {totalPages}
        </span>
        <div className='flex flex-wrap items-center gap-1'>
          <Button type='button' variant='outline' size='sm' disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          {pageNumbers[0] > 1 && (
            <>
              <Button type='button' variant='ghost' size='sm' onClick={() => setCurrentPage(1)}>
                1
              </Button>
              {pageNumbers[0] > 2 && <span className='px-1 text-muted-foreground'>...</span>}
            </>
          )}
          {pageNumbers.map((page) => (
            <Button
              type='button'
              key={page}
              variant={page === currentPage ? 'default' : 'ghost'}
              size='sm'
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </Button>
          ))}
          {pageNumbers[pageNumbers.length - 1] < totalPages && (
            <>
              {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && <span className='px-1 text-muted-foreground'>...</span>}
              <Button type='button' variant='ghost' size='sm' onClick={() => setCurrentPage(totalPages)}>
                {totalPages}
              </Button>
            </>
          )}
          <Button type='button' variant='outline' size='sm' disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-[radial-gradient(circle_at_top,_hsl(212_45%_14%),_hsl(222_47%_8%))] text-foreground'>
      <header className='sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-sm'>
        <div className='mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6'>
          <h1 className='text-lg font-semibold tracking-tight text-primary sm:text-xl'>Open Job Board EU</h1>
          <Badge variant='secondary' className='gap-2 border border-border/80'>
            <img className='h-3.5 w-3.5 rounded-sm object-contain' src='https://flagcdn.com/w40/eu.png' alt='EU' />
            EU Jobs
          </Badge>
        </div>
      </header>

      <main className='mx-auto max-w-7xl px-4 py-4 sm:px-6'>
        <div className='mb-4 flex items-center gap-2'>
          <Button type='button' variant='default' size='icon' className='h-10 w-10' onClick={() => setShowFilters(true)}>
            <Menu className='h-4 w-4' />
            <span className='sr-only'>Open filters</span>
          </Button>
          <Input
            className='h-10 bg-background/80'
            placeholder='Search jobs, company, country or source...'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Sheet open={showFilters} onOpenChange={setShowFilters}>
          <SheetContent side='left' className='w-full overflow-y-auto border-border/70 bg-card sm:max-w-md'>
            <SheetHeader>
              <SheetTitle>Filter Lists</SheetTitle>
              <SheetDescription>Narrow results by company, source, country, or job availability.</SheetDescription>
            </SheetHeader>

            <div className='mt-5 space-y-4'>
              <Card className='border-border/70 bg-background/70'>
                <CardContent className='space-y-3 p-4'>
                  <div className='space-y-1'>
                    <div className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Sort by</div>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger>
                        <SelectValue placeholder='Sort by' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='company'>Company</SelectItem>
                        <SelectItem value='country'>Country</SelectItem>
                        <SelectItem value='source'>Source</SelectItem>
                        <SelectItem value='jobs_count'>Jobs Count</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className='space-y-1'>
                    <div className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Order</div>
                    <Select value={sortOrder} onValueChange={setSortOrder}>
                      <SelectTrigger>
                        <SelectValue placeholder='Order' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='asc'>Ascending</SelectItem>
                        <SelectItem value='desc'>Descending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button type='button' variant='outline' size='sm' onClick={resetAllFilters}>
                    Reset all
                  </Button>
                </CardContent>
              </Card>

              <Card className='border-border/70 bg-background/70'>
                <CardContent className='p-4'>
                  {sectionHeader('Country', 'country')}
                  {expanded.country && (
                    <div className='mt-2 max-h-64 space-y-2 overflow-y-auto rounded-md border border-border/70 bg-background/70 p-3'>
                      {countryOptions.map((country) => {
                        const id = toId('country', country)
                        return (
                          <label key={country} htmlFor={id} className='flex items-center gap-2 text-sm'>
                            <Checkbox
                              id={id}
                              checked={selectedCountries.includes(country)}
                              onCheckedChange={() => setSelectedCountries((prev) => toggleInList(prev, country))}
                            />
                            <span className='text-muted-foreground'>{country}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className='border-border/70 bg-background/70'>
                <CardContent className='p-4'>
                  {sectionHeader('Source', 'source')}
                  {expanded.source && (
                    <div className='mt-2 max-h-64 space-y-2 overflow-y-auto rounded-md border border-border/70 bg-background/70 p-3'>
                      {sourceOptions.map((source) => {
                        const id = toId('source', source)
                        return (
                          <label key={source} htmlFor={id} className='flex items-center gap-2 text-sm'>
                            <Checkbox
                              id={id}
                              checked={selectedSources.includes(source)}
                              onCheckedChange={() => setSelectedSources((prev) => toggleInList(prev, source))}
                            />
                            <span className='text-muted-foreground'>{source}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className='border-border/70 bg-background/70'>
                <CardContent className='p-4'>
                  {sectionHeader('Company', 'company')}
                  {expanded.company && (
                    <>
                      <Input
                        className='mt-2 h-9'
                        placeholder='Find company...'
                        value={companyListSearch}
                        onChange={(e) => setCompanyListSearch(e.target.value)}
                      />
                      <div className='mt-2 max-h-64 space-y-2 overflow-y-auto rounded-md border border-border/70 bg-background/70 p-3'>
                        {filteredCompanyOptions.map((name) => {
                          const id = toId('company', name)
                          return (
                            <label key={name} htmlFor={id} className='flex items-center gap-2 text-sm'>
                              <Checkbox
                                id={id}
                                checked={selectedCompanies.includes(name)}
                                onCheckedChange={() => setSelectedCompanies((prev) => toggleInList(prev, name))}
                              />
                              <span className='text-muted-foreground'>{name}</span>
                            </label>
                          )
                        })}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className='border-border/70 bg-background/70'>
                <CardContent className='p-4'>
                  {sectionHeader('Has Jobs', 'hasJobs')}
                  {expanded.hasJobs && (
                    <div className='mt-2 space-y-2 rounded-md border border-border/70 bg-background/70 p-3'>
                      <label htmlFor='with-jobs' className='flex items-center gap-2 text-sm'>
                        <Checkbox
                          id='with-jobs'
                          checked={selectedHasJobs.includes('with_jobs')}
                          onCheckedChange={() => setSelectedHasJobs((prev) => toggleInList(prev, 'with_jobs'))}
                        />
                        <span className='text-muted-foreground'>With jobs</span>
                      </label>
                      <label htmlFor='without-jobs' className='flex items-center gap-2 text-sm'>
                        <Checkbox
                          id='without-jobs'
                          checked={selectedHasJobs.includes('without_jobs')}
                          onCheckedChange={() => setSelectedHasJobs((prev) => toggleInList(prev, 'without_jobs'))}
                        />
                        <span className='text-muted-foreground'>Without jobs</span>
                      </label>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </SheetContent>
        </Sheet>

        {error && (
          <Card className='mb-3 border-destructive/50 bg-destructive/10'>
            <CardContent className='p-3 text-sm text-destructive'>{error}</CardContent>
          </Card>
        )}
        {loading && (
          <Card className='mb-3 border-primary/40 bg-primary/10'>
            <CardContent className='p-3 text-sm text-primary'>Loading companies...</CardContent>
          </Card>
        )}

        <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
          <h2 className='text-lg font-semibold tracking-tight'>Job Listings</h2>
          <div className='flex flex-wrap gap-2'>
            <Badge variant='outline' className='border-border/70'>Companies Loaded: {stats?.companies_count ?? '-'}</Badge>
            <Badge variant='secondary'>Companies With Jobs: {stats?.companies_with_jobs_count ?? '-'}</Badge>
            <Badge>{jobCards.length} results</Badge>
          </div>
        </div>

        <div className='grid gap-4 lg:grid-cols-12'>
          {showListColumn && (
            <section className='lg:col-span-7'>
              <Card className='border-border/70 bg-card/80'>
                <CardContent className='max-h-[calc(100vh-270px)] space-y-2 overflow-y-auto p-3 lg:min-h-[520px]'>
                  {paginatedJobCards.map((job) => (
                    <button
                      type='button'
                      key={job.key}
                      className={cn(
                        'w-full rounded-lg border border-border/70 bg-background/60 p-3 text-left transition hover:border-primary/40 hover:bg-accent/40',
                        selectedJobKey === job.key && 'border-primary/70 bg-primary/10'
                      )}
                      onClick={() => {
                        setSelectedJobKey(job.key)
                        if (isMobile) {
                          setShowMobileDetail(true)
                        }
                      }}
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                          <div className='mb-2 line-clamp-2 text-base font-semibold text-foreground' title={job.title}>
                            {truncateText(job.title, CARD_TITLE_MAX_CHARS)}
                          </div>
                          <div className='flex items-center gap-2'>
                            <img className='h-4 w-4 rounded-sm object-contain' src={companyLogoUrl(job.company_website)} alt={job.company_name} />
                            <span className='truncate text-sm font-medium text-muted-foreground'>{job.company_name}</span>
                          </div>
                        </div>
                        <div className='flex shrink-0 items-center gap-1.5'>
                          {countryFlagUrl(job.country_of_origin) ? (
                            <img className='h-4 w-4 rounded-sm object-contain' src={countryFlagUrl(job.country_of_origin)} alt={job.country_of_origin} />
                          ) : null}
                          {sourceLogoUrl(job.source) ? (
                            <img className='h-4 w-4 rounded-sm object-contain' src={sourceLogoUrl(job.source)} alt={job.source} />
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}
                  {!paginatedJobCards.length && !loading && (
                    <div className='rounded-md border border-dashed border-border/80 p-5 text-center text-sm text-muted-foreground'>
                      No jobs found for the current filters.
                    </div>
                  )}
                </CardContent>
              </Card>
              {renderPaginator()}
            </section>
          )}

          {showDetailColumn && (
            <section className='space-y-2 lg:col-span-5'>
              <Card className='border-border/70 bg-card/80'>
                <CardContent className='max-h-[calc(100vh-360px)] overflow-y-auto p-5 lg:min-h-[380px]'>
                  {selectedJob ? (
                    <>
                      {isMobile && (
                        <Button type='button' variant='outline' size='sm' className='mb-3' onClick={() => setShowMobileDetail(false)}>
                          <ArrowLeft className='h-4 w-4' />
                          Back to job list
                        </Button>
                      )}
                      <h3 className='mb-2 text-xl font-semibold'>{selectedJob.title}</h3>
                      <Badge variant='secondary' className='mb-3 inline-flex items-center gap-2'>
                        <img className='h-3.5 w-3.5 rounded-sm object-contain' src={companyLogoUrl(selectedJob.company_website)} alt='' />
                        {selectedJob.company_name}
                      </Badge>

                      <div className='mb-4 flex flex-wrap gap-2'>
                        <Badge variant='outline' className='inline-flex items-center gap-1.5 border-border/70'>
                          {countryFlagUrl(selectedJob.country_of_origin) ? (
                            <img className='h-3.5 w-3.5 rounded-sm object-contain' src={countryFlagUrl(selectedJob.country_of_origin)} alt='' />
                          ) : null}
                          {selectedJob.country_of_origin}
                        </Badge>
                        <Badge variant='outline' className='inline-flex items-center gap-1.5 border-border/70'>
                          {sourceLogoUrl(selectedJob.source) ? (
                            <img className='h-3.5 w-3.5 rounded-sm object-contain' src={sourceLogoUrl(selectedJob.source)} alt='' />
                          ) : null}
                          {selectedJob.source}
                        </Badge>
                      </div>

                      <div className='space-y-3 text-sm'>
                        <div>
                          <div className='mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'>Job URL</div>
                          <a className='break-all text-primary hover:underline' href={selectedJob.url} target='_blank' rel='noreferrer'>
                            {selectedJob.url}
                          </a>
                        </div>
                        <div>
                          <div className='mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'>Career Page</div>
                          <a className='break-all text-primary hover:underline' href={selectedJob.career_page_url} target='_blank' rel='noreferrer'>
                            {selectedJob.career_page_url}
                          </a>
                        </div>
                        <div>
                          <div className='mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'>Company Website</div>
                          <a className='break-all text-primary hover:underline' href={selectedJob.company_website} target='_blank' rel='noreferrer'>
                            {selectedJob.company_website}
                          </a>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className='rounded-md border border-dashed border-border/80 p-5 text-center text-sm text-muted-foreground'>
                      Select a job card to view details.
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className='grid grid-cols-3 gap-2'>
                {selectedJob ? (
                  <Button asChild size='sm'>
                    <a href={selectedJob.url || selectedJob.career_page_url} target='_blank' rel='noreferrer'>
                      Apply Now
                    </a>
                  </Button>
                ) : (
                  <Button size='sm' disabled>
                    Apply Now
                  </Button>
                )}
                {selectedJob ? (
                  <Button asChild variant='outline' size='sm'>
                    <a href={selectedJob.career_page_url} target='_blank' rel='noreferrer'>
                      Career Page
                    </a>
                  </Button>
                ) : (
                  <Button variant='outline' size='sm' disabled>
                    Career Page
                  </Button>
                )}
                {selectedJob ? (
                  <Button asChild variant='secondary' size='sm'>
                    <a href={selectedJob.company_website} target='_blank' rel='noreferrer'>
                      Company
                    </a>
                  </Button>
                ) : (
                  <Button variant='secondary' size='sm' disabled>
                    Company
                  </Button>
                )}
              </div>

              {selectedJob && (
                <Button asChild variant='ghost' size='sm' className='justify-start text-muted-foreground'>
                  <a href={selectedJob.url || selectedJob.career_page_url} target='_blank' rel='noreferrer'>
                    <ExternalLink className='h-4 w-4' />
                    Open posting in new tab
                  </a>
                </Button>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
