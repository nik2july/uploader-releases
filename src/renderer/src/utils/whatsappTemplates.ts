export type WhatsAppTemplateId =
  | 'client_draft'
  | 'client_followup'
  | 'client_doubt'
  | 'client_final'
  | 'client_payment_reminder'
  | 'client_album_selection'
  | 'client_frame_selection'
  | 'editor_assign'
  | 'editor_extra_data'
  | 'editor_revisions';

export interface WhatsAppTemplateVariable {
  key: string;
  label: string;
  description: string;
}

export interface WhatsAppTemplateDefinition {
  id: WhatsAppTemplateId;
  name: string;
  category: 'client' | 'editor';
  description: string;
  defaultTemplate: string;
  variables: WhatsAppTemplateVariable[];
}

export const WHATSAPP_TEMPLATES_STORAGE_KEY = 'freelance_whatsapp_templates';

export const WHATSAPP_TEMPLATE_DEFINITIONS: WhatsAppTemplateDefinition[] = [
  {
    id: 'client_draft',
    name: 'Draft Review to Client',
    category: 'client',
    description: 'Sent when the draft video is ready for first review.',
    defaultTemplate: `*Studio OS - Draft Video for Review*
Hello {clientName},
Your edit for *{projectName}* ({jobCode}) is ready for first review!

{?link}*Preview Link:* {link}

{/link}Please check and share your thoughts or revision notes.
— {studioName}`,
    variables: [
      { key: 'clientName', label: 'Client Name', description: 'Name of the client / studio' },
      { key: 'projectName', label: 'Project Name', description: 'Job title' },
      { key: 'jobCode', label: 'Job Code', description: 'e.g. FL-2026-001' },
      { key: 'serviceType', label: 'Service Type', description: 'e.g. Long Form, Reel' },
      { key: 'link', label: 'Preview Link', description: 'Review / cut URL' },
      { key: 'studioName', label: 'Studio Name', description: 'Your studio brand name' },
    ],
  },
  {
    id: 'client_followup',
    name: 'Follow-Up Nudge to Client',
    category: 'client',
    description: 'Polite reminder asking clients to review drafts and finalize the project faster.',
    defaultTemplate: `*Studio OS - Follow-Up on Video Review*
Hello {clientName},
Just checking in on the review for *{projectName}* ({jobCode}).

{?link}*Preview Link:* {link}

{/link}Could you please share your feedback or approval at your earliest convenience so we can finalize and lock the master export? Thank you! ✨
— {studioName}`,
    variables: [
      { key: 'clientName', label: 'Client Name', description: 'Name of the client / studio' },
      { key: 'projectName', label: 'Project Name', description: 'Job title' },
      { key: 'jobCode', label: 'Job Code', description: 'e.g. FL-2026-001' },
      { key: 'link', label: 'Preview Link', description: 'Review / cut URL' },
      { key: 'sentDate', label: 'Sent Date', description: 'Date the draft was shared' },
      { key: 'studioName', label: 'Studio Name', description: 'Your studio brand name' },
    ],
  },
  {
    id: 'client_doubt',
    name: 'Editor Query / Doubt to Client',
    category: 'client',
    description: 'Sent when the editor has a doubt or question before rendering (song, footage, notes).',
    defaultTemplate: `*Query from Editor regarding:* *{projectName}* ({jobCode})

Hello {clientName},
Our editor ({editorName}) has a clarification query regarding your project before finalizing the render:

❓ *Query:* "{query}"
🏷️ *Category:* {category}

Please share your input on this so we can proceed with the final export! ✨
— {studioName}`,
    variables: [
      { key: 'clientName', label: 'Client Name', description: 'Name of the client / studio' },
      { key: 'projectName', label: 'Project Name', description: 'Job title' },
      { key: 'jobCode', label: 'Job Code', description: 'e.g. FL-2026-001' },
      { key: 'editorName', label: 'Editor Name', description: 'Name of the assigned editor' },
      { key: 'query', label: 'Query Text', description: 'The question or doubt asked' },
      { key: 'category', label: 'Category', description: 'Category (Song, Footage, etc.)' },
      { key: 'studioName', label: 'Studio Name', description: 'Your studio brand name' },
    ],
  },
  {
    id: 'client_final',
    name: 'Final Master Delivery',
    category: 'client',
    description: 'Sent to deliver the finalized 4K master export link and balance due.',
    defaultTemplate: `*Studio OS - Final Master Delivery*
Hello {clientName},
The master 4K delivery for *{projectName}* ({jobCode}) is ready!

{?link}*Master Download Link:* {link}

{/link}{?balance}*Pending Balance:* ₹{balance}

{/balance}Thank you for trusting us with your project! ✨
— {studioName}`,
    variables: [
      { key: 'clientName', label: 'Client Name', description: 'Name of the client / studio' },
      { key: 'projectName', label: 'Project Name', description: 'Job title' },
      { key: 'jobCode', label: 'Job Code', description: 'e.g. FL-2026-001' },
      { key: 'link', label: 'Master Link', description: 'Download URL for master render' },
      { key: 'balance', label: 'Pending Balance', description: 'Outstanding balance amount' },
      { key: 'studioName', label: 'Studio Name', description: 'Your studio brand name' },
    ],
  },
  {
    id: 'client_payment_reminder',
    name: 'Client Payment Reminder',
    category: 'client',
    description: 'Sent to request settlement of remaining balance for a project.',
    defaultTemplate: `*Studio OS - Payment Reminder*
Hello {clientName},
This is a gentle reminder regarding the outstanding balance for *{projectName}* ({jobCode}).

*Total Project Fee:* ₹{totalFee}
*Amount Received:* ₹{paidAmount}
*Balance Due:* ₹{balance}

Kindly arrange the transfer at your convenience. Thank you!
— {studioName}`,
    variables: [
      { key: 'clientName', label: 'Client Name', description: 'Name of the client / studio' },
      { key: 'projectName', label: 'Project Name', description: 'Job title' },
      { key: 'jobCode', label: 'Job Code', description: 'e.g. FL-2026-001' },
      { key: 'totalFee', label: 'Total Fee', description: 'Agreed client charge' },
      { key: 'paidAmount', label: 'Amount Paid', description: 'Amount collected so far' },
      { key: 'balance', label: 'Balance Due', description: 'Remaining amount due' },
      { key: 'studioName', label: 'Studio Name', description: 'Your studio brand name' },
    ],
  },
  {
    id: 'client_album_selection',
    name: 'Album Photo Selection Request',
    category: 'client',
    description: 'Sent to request photo selection for wedding album design with sheet formula (Sheets × 5 = Photos).',
    defaultTemplate: `*BAAWARAY FILMS · Wedding Album Photo Selection*

Hello {clientName},
We are excited to begin designing your wedding album for *{projectName}*! 📖✨

To create your album layout, we need your selected photos:
• *Album Specifications:* {sheetsCount} Sheets
• *Photos Required:* *{photosRequired} Photos* (Calculated as ~5 photos per sheet)

📱 *How to Select in Photo Sharing App:*
1. Open your online gallery / photo sharing app.
2. Tap the ⭐ *Star* icon on your favorite photos to select them for your album.
3. Aim for *{photosRequired} photos* so all your key moments, family rituals, and portraits are covered.

{?link}🔗 *Gallery Link:* {link}
{/link}Please complete your selection as soon as possible so our design team can craft the album layout without delay! 🙏

Warm regards,
— {studioName}`,
    variables: [
      { key: 'clientName', label: 'Client Name', description: 'Name of the client / couple' },
      { key: 'projectName', label: 'Project Name', description: 'Project title' },
      { key: 'sheetsCount', label: 'Sheets Count', description: 'Number of album sheets (e.g. 40)' },
      { key: 'photosRequired', label: 'Photos Required', description: 'Total photos needed (Sheets × 5, e.g. 200)' },
      { key: 'link', label: 'Gallery Link', description: 'Photo sharing app or gallery URL' },
      { key: 'studioName', label: 'Studio Name', description: 'Your studio brand name' },
    ],
  },
  {
    id: 'client_frame_selection',
    name: 'Wall Frame Photo Selection Request',
    category: 'client',
    description: 'Sent to request photo selection for wall frames with screenshot sharing instructions.',
    defaultTemplate: `*BAAWARAY FILMS · Wall Frame Photo Selection*

Hello {clientName},
We are getting ready to print and assemble your premium wall frames for *{projectName}*! 🖼️✨

We need your final photo selection for *{frameCount} Wall Frames*:
{?frameSize}• *Frame Size:* {frameSize}
{/frameSize}• *Quantity:* {frameCount} Frames

📱 *How to Share Your Selection:*
1. Open your photo sharing app / gallery.
2. Pick your top *{frameCount} favorite photos* that you would love to display on your wall.
3. Take a *screenshot* of each selected photo and share them directly here on this WhatsApp chat.

{?link}🔗 *Gallery Link:* {link}
{/link}Please share the {frameCount} screenshots as soon as possible so our printing team can begin fabrication! 🙏

Warm regards,
— {studioName}`,
    variables: [
      { key: 'clientName', label: 'Client Name', description: 'Name of the client / couple' },
      { key: 'projectName', label: 'Project Name', description: 'Project title' },
      { key: 'frameCount', label: 'Frame Count', description: 'Number of frames to produce (e.g. 4)' },
      { key: 'frameSize', label: 'Frame Size', description: 'Size of the frame (e.g. 20 × 30 Inches)' },
      { key: 'link', label: 'Gallery Link', description: 'Photo sharing app or gallery URL' },
      { key: 'studioName', label: 'Studio Name', description: 'Your studio brand name' },
    ],
  },
  {
    id: 'editor_assign',
    name: 'Editor Assignment & Brief',
    category: 'editor',
    description: 'Sent to the freelance editor when assigned to a job with raw footage.',
    defaultTemplate: `*Studio OS - New Freelance Editing Project*

Hello *{editorName}*,
You have been assigned to: *{projectName}* ({jobCode})
*Deliverable:* {serviceType}
{?dueDate}*Target Due Date:* {dueDate}
{/dueDate}{?link}*Raw Footage / Project Link:* {link}
{/link}{?referenceLink}*Reference Moodboard:* {referenceLink}
{/link}{?instructions}*Editing Notes:*
{instructions}
{/instructions}
Please download data and confirm start.
— {studioName}`,
    variables: [
      { key: 'editorName', label: 'Editor Name', description: 'Name of the assigned editor' },
      { key: 'projectName', label: 'Project Name', description: 'Job title' },
      { key: 'jobCode', label: 'Job Code', description: 'e.g. FL-2026-001' },
      { key: 'serviceType', label: 'Service Type', description: 'e.g. Long Form, Reel' },
      { key: 'dueDate', label: 'Target Due Date', description: 'Target delivery deadline' },
      { key: 'link', label: 'Raw Footage Link', description: 'Raw footage / project download URL' },
      { key: 'referenceLink', label: 'Reference Link', description: 'Moodboard or reference URL' },
      { key: 'instructions', label: 'Editing Notes', description: 'Instructions for the editor' },
      { key: 'studioName', label: 'Studio Name', description: 'Your studio brand name' },
    ],
  },
  {
    id: 'editor_extra_data',
    name: 'Additional Footage Alert (Editor)',
    category: 'editor',
    description: 'Sent to notify editor that supplementary footage or assets have been uploaded.',
    defaultTemplate: `*Studio OS - Additional Data / Footage Added*
Project: *{projectName}* ({jobCode})

*New Data:* {title}
{?link}*Download Link:* {link}
{/link}{?notes}*Notes:* {notes}
{/notes}
Please download and incorporate into the edit.
— {studioName}`,
    variables: [
      { key: 'editorName', label: 'Editor Name', description: 'Name of the assigned editor' },
      { key: 'projectName', label: 'Project Name', description: 'Job title' },
      { key: 'jobCode', label: 'Job Code', description: 'e.g. FL-2026-001' },
      { key: 'title', label: 'Data Title', description: 'Description of the added footage' },
      { key: 'link', label: 'Download Link', description: 'URL to download the extra footage' },
      { key: 'notes', label: 'Notes', description: 'Notes regarding the extra data' },
      { key: 'studioName', label: 'Studio Name', description: 'Your studio brand name' },
    ],
  },
  {
    id: 'editor_revisions',
    name: 'Revision Notes to Editor',
    category: 'editor',
    description: 'Sent to editor with client/internal changes and revised turnaround date.',
    defaultTemplate: `*Studio OS - Revision Round #{roundNumber}*
Project: *{projectName}* ({jobCode})
Client: {clientName}

*Client Changes & Notes:*
{notes}
{?timecodes}
*Specific Timecodes:*
{timecodes}
{/timecodes}
*Revised Due Date (2 Days Turnaround):* {dueDate}
{?link}*Current Cut:* {link}
{/link}
Please review and deliver the updated version ASAP.
— {studioName}`,
    variables: [
      { key: 'editorName', label: 'Editor Name', description: 'Name of the assigned editor' },
      { key: 'clientName', label: 'Client Name', description: 'Name of the client' },
      { key: 'projectName', label: 'Project Name', description: 'Job title' },
      { key: 'jobCode', label: 'Job Code', description: 'e.g. FL-2026-001' },
      { key: 'roundNumber', label: 'Round Number', description: 'Revision round number' },
      { key: 'notes', label: 'Feedback Notes', description: 'Client / studio revision notes' },
      { key: 'timecodes', label: 'Timecodes', description: 'Specific timecodes mentioned' },
      { key: 'dueDate', label: 'Revised Due Date', description: 'Turnaround deadline' },
      { key: 'link', label: 'Current Cut Link', description: 'URL of current cut' },
      { key: 'studioName', label: 'Studio Name', description: 'Your studio brand name' },
    ],
  },
];

/** Retrieve all templates from localStorage, falling back to defaults if not customized. */
export function getWhatsAppTemplates(): Record<WhatsAppTemplateId, string> {
  const result: Record<WhatsAppTemplateId, string> = {} as any;
  for (const def of WHATSAPP_TEMPLATE_DEFINITIONS) {
    result[def.id] = def.defaultTemplate;
  }

  if (typeof window === 'undefined' || !window.localStorage) {
    return result;
  }

  try {
    const stored = window.localStorage.getItem(WHATSAPP_TEMPLATES_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed !== null) {
        for (const def of WHATSAPP_TEMPLATE_DEFINITIONS) {
          if (typeof parsed[def.id] === 'string' && parsed[def.id].trim()) {
            result[def.id] = parsed[def.id];
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to load whatsapp templates from localStorage:', err);
  }

  return result;
}

/** Save customized templates map to localStorage. */
export function saveWhatsAppTemplates(templates: Partial<Record<WhatsAppTemplateId, string>>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const current = getWhatsAppTemplates();
    const merged = { ...current, ...templates };
    window.localStorage.setItem(WHATSAPP_TEMPLATES_STORAGE_KEY, JSON.stringify(merged));
  } catch (err) {
    console.error('Failed to save whatsapp templates to localStorage:', err);
  }
}

/** Reset a single template back to factory default. */
export function resetWhatsAppTemplate(templateId: WhatsAppTemplateId): string {
  const def = WHATSAPP_TEMPLATE_DEFINITIONS.find(d => d.id === templateId);
  const defaultText = def?.defaultTemplate || '';
  saveWhatsAppTemplates({ [templateId]: defaultText });
  return defaultText;
}

/** Reset all templates back to factory defaults. */
export function resetAllWhatsAppTemplates(): Record<WhatsAppTemplateId, string> {
  const defaults: Record<WhatsAppTemplateId, string> = {} as any;
  for (const def of WHATSAPP_TEMPLATE_DEFINITIONS) {
    defaults[def.id] = def.defaultTemplate;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(WHATSAPP_TEMPLATES_STORAGE_KEY);
  }
  return defaults;
}

/**
 * Format a template with variable values.
 * Supports conditional sections `{?variable}...{/variable}` which are removed
 * if the variable is empty or falsy.
 * Supports `{variable}` and `{{variable}}`.
 */
export function interpolateWhatsAppTemplate(
  templateText: string,
  values: Record<string, any>
): string {
  let output = templateText || '';

  // Process conditional blocks first: {?var}...{/var}
  output = output.replace(/\{\?(\w+)\}([\s\S]*?)\{\/\1\}/g, (_, key, block) => {
    const val = values[key];
    const hasValue = val !== undefined && val !== null && String(val).trim() !== '' && val !== 0 && val !== '0';
    return hasValue ? block : '';
  });

  // Replace {var} and {{var}} placeholders
  output = output.replace(/\{\{?\s*(\w+)\s*\}?\}/g, (match, key) => {
    if (key in values && values[key] !== undefined && values[key] !== null) {
      return String(values[key]);
    }
    return match;
  });

  // Clean up excess consecutive blank lines resulting from omitted blocks
  output = output.replace(/\n{3,}/g, '\n\n');

  return output.trim();
}

/**
 * Helper to fetch a ready-to-use WhatsApp message string directly by template ID.
 */
export function renderWhatsAppMessage(
  templateId: WhatsAppTemplateId,
  values: Record<string, any>,
  fallbackStudioName: string = 'Baawaray Films'
): string {
  const templates = getWhatsAppTemplates();
  const templateStr = templates[templateId] || WHATSAPP_TEMPLATE_DEFINITIONS.find(d => d.id === templateId)?.defaultTemplate || '';
  const mergedValues = { studioName: fallbackStudioName, ...values };
  return interpolateWhatsAppTemplate(templateStr, mergedValues);
}
