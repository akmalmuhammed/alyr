import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LeadRecord } from './types.js';

const dataFile = path.resolve(process.env.ALYR_DATA_FILE || './data/leads.json');
let writeQueue: Promise<unknown> = Promise.resolve();

function normalizeWebsite(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, '').toLowerCase();
  }
}

export function sameLeadIdentity(
  left: Pick<LeadRecord, 'placeId' | 'website' | 'sourceUrl'>,
  right: Pick<LeadRecord, 'placeId' | 'website' | 'sourceUrl'>,
): boolean {
  if (left.placeId && right.placeId && left.placeId === right.placeId) return true;
  const leftWebsite = normalizeWebsite(left.website || left.sourceUrl);
  const rightWebsite = normalizeWebsite(right.website || right.sourceUrl);
  return Boolean(leftWebsite && rightWebsite && leftWebsite === rightWebsite);
}

async function readAll(): Promise<LeadRecord[]> {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as LeadRecord[] : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAll(leads: LeadRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  const temporary = `${dataFile}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(leads, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, dataFile);
}

async function serializedMutation<T>(mutation: (leads: LeadRecord[]) => Promise<T> | T): Promise<T> {
  let result!: T;
  const task = writeQueue.then(async () => {
    const leads = await readAll();
    result = await mutation(leads);
    await writeAll(leads);
  });
  writeQueue = task.catch(() => undefined);
  await task;
  return result;
}

export async function listLeads(): Promise<LeadRecord[]> {
  await writeQueue;
  return (await readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createLead(input: Omit<LeadRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<LeadRecord> {
  return serializedMutation((leads) => {
    const now = new Date().toISOString();
    const duplicateIndex = leads.findIndex((lead) => sameLeadIdentity(lead, input));
    if (duplicateIndex >= 0) {
      const existing = leads[duplicateIndex];
      const refreshed: LeadRecord = {
        ...existing,
        ...input,
        id: existing.id,
        status: existing.status,
        owner: existing.owner,
        notes: existing.notes,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      leads[duplicateIndex] = refreshed;
      return refreshed;
    }
    const record: LeadRecord = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    leads.unshift(record);
    return record;
  });
}

export async function updateLead(id: string, patch: Partial<Omit<LeadRecord, 'id' | 'createdAt'>>): Promise<LeadRecord | undefined> {
  return serializedMutation((leads) => {
    const index = leads.findIndex((lead) => lead.id === id);
    if (index < 0) return undefined;
    leads[index] = { ...leads[index], ...patch, id, updatedAt: new Date().toISOString() };
    return leads[index];
  });
}

export async function deleteLead(id: string): Promise<boolean> {
  return serializedMutation((leads) => {
    const index = leads.findIndex((lead) => lead.id === id);
    if (index < 0) return false;
    leads.splice(index, 1);
    return true;
  });
}
