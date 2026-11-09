import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ClientRevisionItem } from '../shared/contracts';

export class RevisionsManager {
  private items: ClientRevisionItem[] = [];
  private storePath: string;

  constructor(storageDir: string) {
    this.storePath = path.join(storageDir, 'revisions.json');
    this.load();
  }

  private async load(): Promise<void> {
    if (existsSync(this.storePath)) {
      try {
        const raw = await fs.readFile(this.storePath, 'utf8');
        this.items = JSON.parse(raw);
      } catch (err) {
        console.warn('[RevisionsManager] Could not read revisions store:', err);
      }
    }
    // Seed initial demo data if empty
    if (this.items.length === 0) {
      this.items = [
        {
          id: 'rev_1',
          deliverableId: 'deliv_teaser',
          deliverableTitle: 'Wedding Teaser Cut 1',
          clientId: 'client_1',
          clientName: 'Dikshant & Moreen',
          cutVersion: 'Cut 1',
          timestamp: new Date(Date.now() - 3600_000 * 4).toISOString(),
          timecodes: '00:28, 01:12',
          points: '1. At 00:28 please replace the ring exchange angle with CAM B closeup.\n2. At 01:12 reduce volume of background song during vows.',
          rawNotes: 'Client called on post-production line (+91 88945 62004) regarding vows audio and ring close-up.',
          source: 'call',
          status: 'in_progress',
          postProductionContact: '+91 88945 62004',
          updatedAt: new Date().toISOString()
        },
        {
          id: 'rev_2',
          deliverableId: 'deliv_reel',
          deliverableTitle: 'Engagement Instagram Reel',
          clientId: 'client_2',
          clientName: 'Nandini & Anubhav',
          cutVersion: 'Cut 1',
          timestamp: new Date(Date.now() - 3600_000 * 20).toISOString(),
          timecodes: '00:15',
          points: '1. Color looks great, just fix the jitter at 00:15 during entrance.\n2. Ready to export for 9:16 vertical delivery.',
          rawNotes: 'Received via WhatsApp message.',
          source: 'whatsapp',
          status: 'pending',
          postProductionContact: '+91 88945 62004',
          updatedAt: new Date().toISOString()
        }
      ];
      void this.save();
    }
  }

  private async save(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.storePath), { recursive: true });
      await fs.writeFile(this.storePath, JSON.stringify(this.items, null, 2), 'utf8');
    } catch (err) {
      console.warn('[RevisionsManager] Error saving revisions store:', err);
    }
  }

  getAll(): ClientRevisionItem[] {
    return [...this.items];
  }

  getByDeliverable(deliverableId: string): ClientRevisionItem[] {
    return this.items.filter(i => i.deliverableId === deliverableId);
  }

  async addRevision(item: Omit<ClientRevisionItem, 'id' | 'timestamp' | 'updatedAt'>): Promise<ClientRevisionItem> {
    const newItem: ClientRevisionItem = {
      ...item,
      id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      postProductionContact: item.postProductionContact || '+91 88945 62004'
    };
    this.items.unshift(newItem);
    await this.save();
    return newItem;
  }

  async updateStatus(id: string, status: ClientRevisionItem['status']): Promise<ClientRevisionItem | null> {
    const item = this.items.find(i => i.id === id);
    if (!item) return null;
    item.status = status;
    item.updatedAt = new Date().toISOString();
    await this.save();
    return item;
  }

  async parseNotesWithAI(rawText: string): Promise<{ points: string; timecodes: string; summary: string }> {
    // Regular expression timecode extraction fallback (e.g. 01:23 or 1:45 or 00:30)
    const tcMatches = rawText.match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/g) || [];
    const timecodes = Array.from(new Set(tcMatches)).join(', ');

    // Extract sentences or line points
    const lines = rawText
      .split(/\n|(?<=[.?!])\s+/)
      .map(l => l.trim())
      .filter(l => l.length > 5);

    const points = lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
    const summary = lines.slice(0, 2).join(' ');

    return {
      points: points || '1. ' + rawText,
      timecodes: timecodes || 'Overall video',
      summary: summary || 'Client requested edits'
    };
  }
}
