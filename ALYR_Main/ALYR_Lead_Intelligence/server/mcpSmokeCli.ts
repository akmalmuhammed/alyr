import './env.js';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function environment(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function parseTextResult<T>(response: { content: Array<{ type: string; text?: string }> }): T {
  const text = response.content.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error('The MCP tool returned no text payload.');
  return JSON.parse(text) as T;
}

const expectedTools = [
  'alyr_command_dashboard',
  'alyr_market_summary',
  'alyr_list_prospects',
  'alyr_get_prospect',
  'alyr_verify_website',
  'alyr_upsert_prospect_contact',
  'alyr_create_outreach_draft',
  'alyr_list_outreach_queue',
  'alyr_execute_approved_action',
  'alyr_record_operational_event',
  'alyr_upsert_client_account',
  'alyr_upsert_delivery_project',
  'alyr_suppress_prospect',
] as const;

const client = new Client({ name: 'alyr-hermes-smoke-test', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve('./server-dist/mcp.js')],
  cwd: process.cwd(),
  env: environment(),
  stderr: 'pipe',
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const exposedTools = tools.tools.map((tool) => tool.name);
  const missingTools = expectedTools.filter((tool) => !exposedTools.includes(tool));
  if (missingTools.length > 0) {
    throw new Error(`The ALYR MCP server is missing required tools: ${missingTools.join(', ')}`);
  }
  const commandResponse = await client.callTool({ name: 'alyr_command_dashboard', arguments: {} });
  const command = parseTextResult<{ kpis: Record<string, number>; categories: unknown[]; sources: unknown[] }>(commandResponse as never);
  const summaryResponse = await client.callTool({ name: 'alyr_market_summary', arguments: {} });
  const summary = parseTextResult<{ total: number; websiteVerified: number; outreachReady: number }>(summaryResponse as never);
  const prospectsResponse = await client.callTool({
    name: 'alyr_list_prospects',
    arguments: { minScore: 80, limit: 5, offset: 0 },
  });
  const prospects = parseTextResult<{ items: Array<{ id: string; name: string; permissionStatus: string }> }>(prospectsResponse as never);
  const candidate = prospects.items[0];
  if (!candidate) throw new Error('No candidate was available for the MCP smoke test.');
  let draft: { id: string; status: string; channel: string; prospectName: string } | null = null;
  if (process.env.SMOKE_CREATE_DRAFT === 'true') {
    const draftResponse = await client.callTool({
      name: 'alyr_create_outreach_draft',
      arguments: { prospectId: candidate.id, channel: 'task' },
    });
    draft = parseTextResult(draftResponse as never);
  }
  console.log(JSON.stringify({
    tools: exposedTools,
    requiredToolCount: expectedTools.length,
    allRequiredToolsPresent: true,
    command: { kpis: command.kpis, categories: command.categories.length, sources: command.sources.length },
    summary,
    candidate: { id: candidate.id, name: candidate.name, permissionStatus: candidate.permissionStatus },
    draft,
    readOnlySmoke: process.env.SMOKE_CREATE_DRAFT !== 'true',
    externalMessageSent: false,
  }, null, 2));
} finally {
  await client.close();
}
