import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { EditorDeliverable, EditorTask } from '../shared/contracts';

export class EditorManager {
  private deliverables: EditorDeliverable[] = [];
  private tasks: EditorTask[] = [];
  private storePath: string;

  constructor(storageDir: string) {
    this.storePath = path.join(storageDir, 'editor_data.json');
    this.load();
  }

  private async load(): Promise<void> {
    if (existsSync(this.storePath)) {
      try {
        const raw = await fs.readFile(this.storePath, 'utf8');
        const data = JSON.parse(raw);
        this.deliverables = data.deliverables || [];
        this.tasks = data.tasks || [];
      } catch (err) {
        console.warn('[EditorManager] Could not read editor data:', err);
      }
    }

    if (this.deliverables.length === 0) {
      this.deliverables = [
        {
          id: 'deliv_1',
          title: 'Cinematic Teaser (1-Min Reel)',
          clientId: 'client_1',
          clientName: 'Dikshant & Moreen',
          coupleName: 'Dikshant & Moreen',
          category: 'Teaser',
          status: 'changes_requested',
          assignedMemberId: 101,
          assignedMemberName: 'Sahil (Senior Video Editor)',
          dueDate: '2026-11-10',
          rawFootagePath: '/Volumes/40/Dikshant & Moreen/01_RAW_FOOTAGE',
          renderPath: '/Volumes/40/Dikshant & Moreen/04_RENDER_DELIVERABLES/01_Teaser/Teaser_Cut1.mp4',
          dropboxReviewUrl: 'https://www.dropbox.com/scl/fo/dikshant-moreen/teaser-review',
          revisionPoints: '1. Replace ring exchange angle.\n2. Balance vow audio at 01:12.',
          revisionTimecodes: '00:28, 01:12',
          notes: 'Song: Baawaray Luxe warm acoustic edit.'
        },
        {
          id: 'deliv_2',
          title: 'Highlight Wedding Film (5-7 Mins)',
          clientId: 'client_1',
          clientName: 'Dikshant & Moreen',
          coupleName: 'Dikshant & Moreen',
          category: 'Film',
          status: 'in_progress',
          assignedMemberId: 101,
          assignedMemberName: 'Sahil (Senior Video Editor)',
          dueDate: '2026-11-20',
          rawFootagePath: '/Volumes/40/Dikshant & Moreen/01_RAW_FOOTAGE',
          renderPath: '',
          notes: 'Deliverable packaged into 05_CLIENT_CLIPS_DELIVERY.'
        },
        {
          id: 'deliv_3',
          title: 'Sangeet Party Reel (9:16 Vertical)',
          clientId: 'client_2',
          clientName: 'Nandini & Anubhav',
          coupleName: 'Nandini & Anubhav',
          category: 'Reel',
          status: 'todo',
          assignedMemberId: 102,
          assignedMemberName: 'Aarav (Reels & Social Editor)',
          dueDate: '2026-11-08',
          rawFootagePath: '/Volumes/40/23.04.22 Nandini & Anubhav',
          notes: 'High energy dance reel with fast cuts.'
        }
      ];
    }

    if (this.tasks.length === 0) {
      this.tasks = [
        {
          id: 'task_1',
          text: 'Apply Luxe Rec.709 LUT to Dikshant wedding Sony FX3 clips',
          done: true,
          priority: 'high',
          dueDate: '2026-11-03',
          assigneeId: 101,
          assigneeName: 'Sahil (Senior Video Editor)',
          clientName: 'Dikshant & Moreen',
          category: 'Color Grading',
          createdAt: new Date().toISOString()
        },
        {
          id: 'task_2',
          text: 'Execute revision points for Dikshant Teaser Cut 2 and re-render',
          done: false,
          priority: 'urgent',
          dueDate: '2026-11-04',
          assigneeId: 101,
          assigneeName: 'Sahil (Senior Video Editor)',
          clientName: 'Dikshant & Moreen',
          category: 'Revision Cut',
          notes: 'Hotline call received from client (+91 88945 62004).',
          createdAt: new Date().toISOString()
        },
        {
          id: 'task_3',
          text: 'Sync audio scratch track with DJ soundboard for Sangeet',
          done: false,
          priority: 'normal',
          dueDate: '2026-11-06',
          assigneeId: 102,
          assigneeName: 'Aarav (Reels & Social Editor)',
          clientName: 'Nandini & Anubhav',
          category: 'Sound Design',
          createdAt: new Date().toISOString()
        }
      ];
    }
    void this.save();
  }

  private async save(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.storePath), { recursive: true });
      await fs.writeFile(
        this.storePath,
        JSON.stringify({ deliverables: this.deliverables, tasks: this.tasks }, null, 2),
        'utf8'
      );
    } catch (err) {
      console.warn('[EditorManager] Error saving editor data:', err);
    }
  }

  getDeliverables(memberId?: number): EditorDeliverable[] {
    if (memberId) {
      return this.deliverables.filter(d => d.assignedMemberId === memberId);
    }
    return [...this.deliverables];
  }

  getTasks(assigneeId?: string | number): EditorTask[] {
    if (assigneeId) {
      return this.tasks.filter(t => String(t.assigneeId) === String(assigneeId));
    }
    return [...this.tasks];
  }

  async toggleTaskDone(taskId: string): Promise<EditorTask | null> {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return null;
    task.done = !task.done;
    await this.save();
    return task;
  }

  async updateDeliverableStatus(
    deliverableId: string,
    status: EditorDeliverable['status']
  ): Promise<EditorDeliverable | null> {
    const deliv = this.deliverables.find(d => d.id === deliverableId);
    if (!deliv) return null;
    deliv.status = status;
    await this.save();
    return deliv;
  }

  async updateDeliverableRender(
    deliverableId: string,
    renderPath: string,
    dropboxUrl?: string
  ): Promise<EditorDeliverable | null> {
    const deliv = this.deliverables.find(d => d.id === deliverableId);
    if (!deliv) return null;
    deliv.renderPath = renderPath;
    if (dropboxUrl) deliv.dropboxReviewUrl = dropboxUrl;
    deliv.status = 'review';
    await this.save();
    return deliv;
  }
}
