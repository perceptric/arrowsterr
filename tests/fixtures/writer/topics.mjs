// The 20 topics the writer is tested on (docs/draft-and-write-build.md, Phase 0): 4 for each of 5 kinds of site,
// with a mix of best-of lists, how-tos, comparisons and cost questions, so every kind of visual gets a real case.
// The brands are made up. Their sitemaps are the internal links the writer may use.

const site = (domain, paths) => paths.map((p) => `https://${domain}/${p}`);

const BRANDS = {
  saas: {
    name: "Planwise",
    domain: "planwise.example",
    reader: "Team leads at companies with 10 to 200 people who run several projects at once",
    sitemap: site("planwise.example", ["", "features/gantt", "features/kanban", "templates/project-brief", "pricing", "blog/project-management-basics", "blog/kanban-guide", "blog/agile-for-small-teams"]),
  },
  store: {
    name: "Stride Running",
    domain: "striderunning.example",
    reader: "New and casual runners buying gear online",
    sitemap: site("striderunning.example", ["", "shoes/road", "shoes/trail", "shoes/stability", "guides/running-shoes", "guides/shoe-fit", "guides/first-5k", "blog/running-shoe-lifespan"]),
  },
  agency: {
    name: "Northline Digital",
    domain: "northlinedigital.example",
    reader: "Marketing leads at B2B software companies",
    sitemap: site("northlinedigital.example", ["", "services/seo", "services/content", "services/ai-search", "case-studies", "blog/seo-basics", "blog/content-strategy", "blog/ai-search-guide"]),
  },
  local: {
    name: "Brightwater Plumbing",
    domain: "brightwaterplumbing.example",
    reader: "Homeowners in Austin, Texas with a plumbing problem",
    sitemap: site("brightwaterplumbing.example", ["", "services/water-heaters", "services/drain-cleaning", "services/emergency", "pricing", "blog/water-heater-guide", "blog/drain-care", "contact"]),
  },
  publisher: {
    name: "Clear Money",
    domain: "clearmoney.example",
    reader: "Adults in their 20s and 30s getting their money in order",
    sitemap: site("clearmoney.example", ["", "budgeting", "saving", "credit", "retirement", "tools/budget-calculator", "blog/money-basics", "blog/credit-score-guide"]),
  },
};

// [slug, keyword, kind, stage, volume]
const ROWS = [
  ["pm-software-small-teams", "best project management software for small teams", "saas", "bofu", 2400],
  ["project-brief", "how to write a project brief", "saas", "tofu", 1900],
  ["kanban-vs-scrum", "kanban vs scrum", "saas", "mofu", 14800],
  ["resource-planning", "how to do resource planning", "saas", "tofu", 1300],
  ["running-shoes-beginners", "best running shoes for beginners", "store", "bofu", 18100],
  ["replace-running-shoes", "how often to replace running shoes", "store", "tofu", 5400],
  ["neutral-vs-stability", "neutral vs stability running shoes", "store", "mofu", 1900],
  ["trail-running-shoes", "best trail running shoes", "store", "bofu", 22200],
  ["keyword-research", "how to do keyword research", "agency", "tofu", 9900],
  ["b2b-content-strategy", "b2b content marketing strategy", "agency", "mofu", 2900],
  ["generative-engine-optimization", "what is generative engine optimization", "agency", "tofu", 8100],
  ["seo-tools-agencies", "best seo tools for agencies", "agency", "bofu", 1600],
  ["water-heater-cost", "how much does a water heater replacement cost", "local", "bofu", 6600],
  ["water-heater-signs", "signs you need a new water heater", "local", "tofu", 2900],
  ["tankless-vs-tank", "tankless vs tank water heater", "local", "mofu", 12100],
  ["unclog-drain", "how to unclog a drain without a plumber", "local", "tofu", 4400],
  ["emergency-fund", "how to build an emergency fund", "publisher", "tofu", 6600],
  ["budgeting-apps", "best budgeting apps", "publisher", "bofu", 33100],
  ["roth-vs-traditional", "roth ira vs traditional ira", "publisher", "mofu", 27100],
  ["credit-score", "how to improve your credit score", "publisher", "tofu", 18100],
];

export const TOPICS = ROWS.map(([slug, keyword, kind, stage, volume]) => ({ slug, keyword, kind, stage, volume, brand: BRANDS[kind] }));
