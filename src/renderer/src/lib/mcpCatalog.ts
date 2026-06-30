// Curated remote (hosted) MCP servers. Source: https://mcpservers.org/remote-mcp-servers
// Each becomes a one-click mixin kit: allow the host + register via `claude mcp add`.
export interface McpServer {
  id: string
  name: string
  url: string
  transport: 'http' | 'sse'
  category: string
  description: string
}

export const MCP_CATALOG: McpServer[] = [
  // Code
  { id: 'github', name: 'GitHub', url: 'https://api.githubcopilot.com/mcp/', transport: 'http', category: 'Code', description: 'Repos, issues, pull requests' },
  { id: 'gitlab', name: 'GitLab', url: 'https://gitlab.com/api/v4/mcp', transport: 'http', category: 'Code', description: 'Repos, issues, merge requests, CI' },
  // Cloud
  { id: 'cloudflare', name: 'Cloudflare', url: 'https://mcp.cloudflare.com/mcp', transport: 'http', category: 'Cloud', description: 'Workers, D1, R2, DNS, account APIs' },
  { id: 'netlify', name: 'Netlify', url: 'https://netlify-mcp.netlify.app/mcp', transport: 'http', category: 'Cloud', description: 'Create, deploy and manage sites' },
  { id: 'railway', name: 'Railway', url: 'https://mcp.railway.com', transport: 'http', category: 'Cloud', description: 'Projects, services, deployments' },
  // Data
  { id: 'neon', name: 'Neon', url: 'https://mcp.neon.tech/mcp', transport: 'http', category: 'Data', description: 'Postgres projects, branches, SQL' },
  { id: 'supabase', name: 'Supabase', url: 'https://mcp.supabase.com/mcp', transport: 'http', category: 'Data', description: 'Projects, database, docs' },
  { id: 'planetscale', name: 'PlanetScale', url: 'https://mcp.pscale.dev/mcp/planetscale', transport: 'http', category: 'Data', description: 'Postgres & MySQL schema access' },
  { id: 'airtable', name: 'Airtable', url: 'https://mcp.airtable.com/mcp', transport: 'http', category: 'Data', description: 'Bases, tables and records' },
  { id: 'bigquery', name: 'BigQuery', url: 'https://bigquery.googleapis.com/mcp', transport: 'http', category: 'Data', description: 'Analytical queries over BigQuery' },
  // Analytics
  { id: 'amplitude', name: 'Amplitude', url: 'https://mcp.amplitude.com/mcp', transport: 'http', category: 'Analytics', description: 'Product analytics & events' },
  { id: 'mixpanel', name: 'Mixpanel', url: 'https://mcp.mixpanel.com/mcp', transport: 'http', category: 'Analytics', description: 'Event analytics & funnels' },
  { id: 'contentsquare', name: 'ContentSquare', url: 'https://api.contentsquare.com/mcp', transport: 'http', category: 'Analytics', description: 'Digital experience analytics' },
  { id: 'similarweb', name: 'Similarweb', url: 'https://mcp.similarweb.com', transport: 'http', category: 'Analytics', description: 'Traffic & market intelligence' },
  // Observability
  { id: 'sentry', name: 'Sentry', url: 'https://mcp.sentry.dev/mcp', transport: 'http', category: 'Observability', description: 'Search, query and debug errors' },
  { id: 'honeycomb', name: 'Honeycomb', url: 'https://mcp.honeycomb.io/mcp', transport: 'http', category: 'Observability', description: 'Query telemetry, explore SLOs' },
  // Design
  { id: 'figma', name: 'Figma', url: 'https://mcp.figma.com/mcp', transport: 'http', category: 'Design', description: 'Files, designs, Dev Mode context' },
  { id: 'canva', name: 'Canva', url: 'https://mcp.canva.com/mcp', transport: 'http', category: 'Design', description: 'Designs, assets and templates' },
  { id: 'miro', name: 'Miro', url: 'https://mcp.miro.com/', transport: 'http', category: 'Design', description: 'Read & create on Miro boards' },
  { id: 'lucid', name: 'Lucid', url: 'https://mcp.lucid.app/mcp', transport: 'http', category: 'Design', description: 'Diagrams on Lucidchart' },
  { id: 'mermaid', name: 'Mermaid Chart', url: 'https://mcp.mermaid.ai/mcp', transport: 'http', category: 'Design', description: 'Validate syntax, render diagrams' },
  // Project management
  { id: 'atlassian', name: 'Atlassian', url: 'https://mcp.atlassian.com/v1/mcp/authv2', transport: 'http', category: 'Project', description: 'Jira, Confluence, Compass' },
  { id: 'linear', name: 'Linear', url: 'https://mcp.linear.app/mcp', transport: 'http', category: 'Project', description: 'Issues, projects, cycles' },
  { id: 'asana', name: 'Asana', url: 'https://mcp.asana.com/v2/mcp', transport: 'http', category: 'Project', description: 'Tasks, projects, portfolios' },
  { id: 'monday', name: 'Monday', url: 'https://mcp.monday.com/mcp', transport: 'http', category: 'Project', description: 'Boards, items and workflows' },
  { id: 'clickup', name: 'ClickUp', url: 'https://mcp.clickup.com/mcp', transport: 'http', category: 'Project', description: 'Tasks, docs and goals' },
  // Docs & notes
  { id: 'notion', name: 'Notion', url: 'https://mcp.notion.com/mcp', transport: 'http', category: 'Docs', description: 'Pages, databases and docs' },
  { id: 'context7', name: 'Context7', url: 'https://mcp.context7.com/mcp', transport: 'http', category: 'Docs', description: 'Up-to-date library docs for LLMs' },
  { id: 'craft', name: 'Craft', url: 'https://mcp.craft.do/my/mcp', transport: 'http', category: 'Docs', description: 'Documents and notes' },
  { id: 'goodnotes', name: 'Goodnotes', url: 'https://claude-mcp-api.ml.goodnotes.com/mcp', transport: 'http', category: 'Docs', description: 'Notes and handwriting' },
  // AI & Search
  { id: 'huggingface', name: 'Hugging Face', url: 'https://huggingface.co/mcp', transport: 'http', category: 'AI', description: 'HF Hub + Gradio apps' },
  { id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/api/mcp', transport: 'http', category: 'AI', description: 'Models, pricing, test prompts' },
  { id: 'exa', name: 'Exa', url: 'https://mcp.exa.ai/mcp', transport: 'http', category: 'Search', description: 'Web search + code-docs search' },
  { id: 'tavily', name: 'Tavily', url: 'https://mcp.tavily.com/mcp', transport: 'http', category: 'Search', description: 'Real-time web access for agents' },
  // Marketing & SEO
  { id: 'ahrefs', name: 'Ahrefs', url: 'https://api.ahrefs.com/mcp/mcp', transport: 'http', category: 'Marketing', description: 'SEO & backlink analytics' },
  { id: 'semrush', name: 'Semrush', url: 'https://mcp.semrush.com/claude/v1/mcp', transport: 'http', category: 'Marketing', description: 'Keyword & competitive research' },
  { id: 'mailerlite', name: 'MailerLite', url: 'https://mcp.mailerlite.com/mcp', transport: 'http', category: 'Marketing', description: 'Email campaigns & subscribers' },
  // Sales & Support
  { id: 'hubspot', name: 'HubSpot', url: 'https://mcp.hubspot.com', transport: 'http', category: 'CRM', description: 'CRM contacts, deals, companies' },
  { id: 'intercom', name: 'Intercom', url: 'https://mcp.intercom.com/mcp', transport: 'http', category: 'CRM', description: 'Conversations & customer data' },
  // Payments & commerce
  { id: 'stripe', name: 'Stripe', url: 'https://mcp.stripe.com', transport: 'http', category: 'Payments', description: 'Payments, billing, customers' },
  { id: 'square', name: 'Square', url: 'https://mcp.squareup.com/sse', transport: 'sse', category: 'Payments', description: 'Payments, catalog, orders' },
  { id: 'carta', name: 'Carta', url: 'https://mcp.app.carta.com/mcp', transport: 'http', category: 'Payments', description: 'Cap tables & equity' },
  { id: 'shopify', name: 'Shopify', url: 'https://setup.shopify.com/mcp', transport: 'http', category: 'Commerce', description: 'Build & manage a Shopify store' },
  // Forms & research
  { id: 'jotform', name: 'Jotform', url: 'https://mcp.jotform.com/mcp-app', transport: 'http', category: 'Forms', description: 'Forms and submissions' },
  { id: 'surveymonkey', name: 'SurveyMonkey', url: 'https://mcp.surveymonkey.com/mcp', transport: 'http', category: 'Forms', description: 'Surveys and responses' },
  { id: 'dovetail', name: 'Dovetail', url: 'https://dovetail.com/api/mcp', transport: 'http', category: 'Forms', description: 'User research & insights' },
  // Automation
  { id: 'ifttt', name: 'IFTTT', url: 'https://ifttt.com/mcp', transport: 'http', category: 'Automation', description: 'Applets across 900+ services' },
  { id: 'make', name: 'Make', url: 'https://mcp.make.com', transport: 'http', category: 'Automation', description: 'Scenarios & automations' },
  // Content & productivity
  { id: 'wordpress', name: 'WordPress.com', url: 'https://public-api.wordpress.com/wpcom/v2/mcp/v1', transport: 'http', category: 'Content', description: 'Manage WordPress.com sites' },
  { id: 'postman', name: 'Postman', url: 'https://mcp.postman.com/minimal', transport: 'http', category: 'APIs', description: 'API context for coding agents' },
  { id: 'slack', name: 'Slack', url: 'https://mcp.slack.com/mcp', transport: 'http', category: 'Productivity', description: 'Messages, channels, canvases' }
]

// Hostname an sbx network policy must allow for this MCP to be reachable.
export function mcpHost(url: string): string {
  try { return new URL(url).host } catch { return url }
}
