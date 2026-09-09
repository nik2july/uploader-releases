import { Client, CrewRoleConfig, Lead, ProductionCatalogItem, ProjectEvent, Quotation, StudioPriceList, StudioRoleGroup, StudioTermsConfig, TeamMember, TierCategoryConfig, UserAccount } from '../types';

/**
 * The role groups shown in the quotation builder's Events and Deliverables tabs.
 *
 * Groups are just names — every price lives on the services (crew roles) beneath
 * them. Event groups and deliverable groups are separate lists on purpose: adding
 * a Photographer never affects what the Deliverables tab offers.
 */
export const DEFAULT_ROLE_GROUPS: StudioRoleGroup[] = [
  // Events — crew staffed on the day of the shoot.
  { id: 'grp-photographer', name: 'Photographer', kind: 'event', description: 'Candid, traditional and stage photography.', isSystem: true },
  { id: 'grp-cinematographer', name: 'Cinematographer', kind: 'event', description: 'Cinema cameras, gimbal and narrative capture.', isSystem: true },
  { id: 'grp-drone', name: 'Drone', kind: 'event', description: 'DGCA-licensed aerial coverage.', isSystem: true },
  { id: 'grp-support', name: 'Lighting & Support', kind: 'event', description: 'Lighting, audio and on-set assistance.' },

  // Deliverables — work produced after the shoot.
  { id: 'grp-photo-editor', name: 'Photo Editor', kind: 'deliverable', description: 'Retouching, colour balance and archive grading.', isSystem: true },
  { id: 'grp-video-editor', name: 'Video Editor', kind: 'deliverable', description: 'Cinematic cuts, raw coverage and sound design.', isSystem: true },
  { id: 'grp-album', name: 'Album', kind: 'deliverable', description: 'Album design, printing and finishing.', isSystem: true },
];

export const DEFAULT_TIER_CATEGORIES: TierCategoryConfig[] = [
  {
    id: 'production',
    name: 'Production',
    subtitle: 'On-Site Shoot & Crew Execution',
    description: 'On-site shoot execution, candid portraiture, 4K cinematography & aerial drone',
    colorTheme: 'emerald',
    badgeBg: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    badgeText: 'text-emerald-800',
    isSystem: true,
  },
  {
    id: 'post-production',
    name: 'Post-Production',
    subtitle: 'Editing, Color Grading & Albums',
    description: 'Deliverables tracking, video editing, color grading & luxury album master',
    colorTheme: 'sky',
    badgeBg: 'bg-sky-50 text-sky-900 border-sky-200',
    badgeText: 'text-sky-800',
    isSystem: true,
  },
];

export const INITIAL_USER: UserAccount = {
  id: 'owner-1',
  name: 'Aarav Baawaray',
  role: 'Studio owner',
  email: 'aarav@baawaray.com',
  phone: '+919888928886',
  accountType: 'owner',
  password: 'admin',
  active: true,
};

export const INITIAL_CLIENTS: Client[] = [
  {
    id: 1,
    name: 'Naina & Aditya',
    phone: '+919876521001',
    email: 'naina@example.com',
    status: 'booked',
    source: 'Referral',
    password: 'CL-NAINA8',
    mustChangePassword: false,
    notes: 'Royal destination wedding celebration in Agra. 3-day cinematic storytelling & heirloom portraits.',
    createdAt: '2026-06-15',
    deliverables: [
      { id: 'del-1-1', title: 'All Photos (High-Resolution Digital Archive)', category: 'Photo', status: 'in-progress', assignedMemberId: 1, dueDate: '2026-08-30', costPrice: 12000, sellingPrice: 35000 },
      { id: 'del-1-2', title: 'Curated Edited Photos (Master Retouched)', category: 'Photo', status: 'pending', assignedMemberId: 4, dueDate: '2026-09-10', costPrice: 18000, sellingPrice: 50000 },
      { id: 'del-1-3', title: '30 to 60 Minute Signature Cinematic Film', category: 'Video', status: 'in-progress', assignedMemberId: 5, dueDate: '2026-09-25', costPrice: 35000, sellingPrice: 90000, notes: 'Master narrative cut in 4K ProRes. Focus on vows and couple intimacy.' },
      { id: 'del-1-4', title: 'Speech or Performance Cut', category: 'Video', status: 'pending', assignedMemberId: 5, dueDate: '2026-09-25', costPrice: 10000, sellingPrice: 25000 },
      { id: 'del-1-5', title: 'Cinematic Trailer (3 to 5 Minutes 4K)', category: 'Video', status: 'review', assignedMemberId: 5, dueDate: '2026-09-05', costPrice: 15000, sellingPrice: 40000, notes: 'Same-week luxury teaser cut for social premiere.' },
    ],
    paymentLogs: [
      { id: 'pay-1', amount: 160000, date: '2026-06-20', mode: 'Bank Transfer', reference: 'HDFC-TXN-8812', notes: 'Booking Advance (50%)', createdAt: '2026-06-20T10:00:00Z' },
    ],
    customTotalAmount: 520000,
  },
  {
    id: 2,
    name: 'Ishita & Kabir',
    phone: '+919876521002',
    email: 'ishita@example.com',
    status: 'booked',
    source: 'Instagram',
    password: 'CL-ISHITA2',
    mustChangePassword: false,
    notes: 'Destination wedding in Jaipur. Editorial cinematic film with vintage 16mm grading aesthetic.',
    createdAt: '2026-07-02',
    deliverables: [
      { id: 'del-2-1', title: 'All Photos (High-Resolution Unedited Archive)', category: 'Photo', status: 'delivered', assignedMemberId: 1, dueDate: '2026-08-15', costPrice: 8000, sellingPrice: 25000, paidToEditor: true, paidAt: '2026-08-15' },
      { id: 'del-2-2', title: 'Curated Edited Photos (500+ Master Color-Graded)', category: 'Photo', status: 'review', assignedMemberId: 4, dueDate: '2026-08-20', costPrice: 20000, sellingPrice: 60000 },
      { id: 'del-2-3', title: '30 to 60 Minute Signature Cinematic Film', category: 'Video', status: 'in-progress', assignedMemberId: 5, dueDate: '2026-08-28', costPrice: 35000, sellingPrice: 85000, notes: 'Include vintage film grain overlays & bespoke sound design.' },
      { id: 'del-2-4', title: 'Speech or Performance Cut', category: 'Video', status: 'changes', assignedMemberId: 5, dueDate: '2026-08-25', costPrice: 10000, sellingPrice: 25000, notes: 'Client requested sangeet dance audio balance tweak on bridge.' },
      { id: 'del-2-5', title: 'Cinematic Trailer (3 to 5 Minutes 4K Teaser)', category: 'Video', status: 'delivered', assignedMemberId: 5, dueDate: '2026-08-18', costPrice: 15000, sellingPrice: 35000, paidToEditor: true, paidAt: '2026-08-18' },
      { id: 'del-2-6', title: 'Fine-Art Flush Mount Luxury Album (60 Pages)', category: 'Album', status: 'in-progress', assignedMemberId: 4, dueDate: '2026-09-15', costPrice: 18000, sellingPrice: 45000 },
    ],
    paymentLogs: [
      { id: 'pay-2-1', amount: 100000, date: '2026-07-05', mode: 'UPI', reference: 'UPI-98210-BOI', notes: 'Advance Date Lock Retainer', createdAt: '2026-07-05T11:00:00Z' },
      { id: 'pay-2-2', amount: 90000, date: '2026-08-10', mode: 'Bank Transfer', reference: 'ICICI-NFT-9918', notes: 'On-shoot milestone payment', createdAt: '2026-08-10T14:30:00Z' },
    ],
    customTotalAmount: 190000,
  },
  {
    id: 3,
    name: 'Riya & Karan',
    phone: '+919876521003',
    email: 'riya@example.com',
    status: 'new lead',
    source: 'Website',
    password: 'CL-RIYAK5',
    mustChangePassword: false,
    notes: 'Inquiry for grand Delhi winter wedding. Needs custom drone package and fast-turnaround teaser.',
    createdAt: '2026-08-01',
  },
  {
    id: 4,
    name: 'Simran & Rajveer',
    phone: '+919876521004',
    email: 'simran@example.com',
    status: 'booked',
    source: 'Instagram',
    password: 'CL-SIMRAN9',
    mustChangePassword: false,
    notes: 'Pre-wedding editorial and destination reception coverage.',
    createdAt: '2026-08-05',
    deliverables: [
      { id: 'del-4-1', title: 'All Photos (High-Resolution RAW)', category: 'Photo', status: 'pending', assignedMemberId: 1, dueDate: '2026-09-02', costPrice: 5000, sellingPrice: 15000 },
      { id: 'del-4-2', title: 'Curated Edited Photos (Pre-Wedding Lookbook)', category: 'Photo', status: 'pending', assignedMemberId: 4, dueDate: '2026-09-10', costPrice: 12000, sellingPrice: 35000 },
      { id: 'del-4-3', title: 'Cinematic Pre-Wedding Teaser (2-3 Minutes)', category: 'Video', status: 'in-progress', assignedMemberId: 5, dueDate: '2026-09-12', costPrice: 12000, sellingPrice: 30000, notes: 'Vertical 9:16 reels cut + 16:9 4K landscape master.' },
    ],
    paymentLogs: [
      { id: 'pay-4-1', amount: 40000, date: '2026-08-06', mode: 'UPI', reference: 'UPI-77123-GPAY', notes: 'Booking Advance', createdAt: '2026-08-06T09:00:00Z' },
    ],
    customTotalAmount: 95000,
  },
];

export const INITIAL_TEAM: TeamMember[] = [
  {
    id: 1,
    name: 'Kabir Mehta',
    role: 'Lead Candid Photographer',
    assignedRoleIds: ['role-candid-photographer', 'role-traditional-photographer'],
    category: 'production',
    phone: '+919876510001',
    password: 'kabir123',
    active: true,
    mustChangePassword: false,
    rolePayoutRates: {
      'role-candid-photographer': 15000,
      'role-traditional-photographer': 12000,
    },
    rateCard: {
      rateUnder6Hours: 8000,
      rateOver6Hours: 15000,
    },
    ratePerDay: 15000,
    itemPayoutRates: {
      'cat-candid-photo': 15000,
      'cat-trad-photo': 12000,
      'cat-prewed-photo': 18000,
    },
    bio: 'Lead candid wedding photographer with 8+ years experience in editorial portraiture.',
  },
  {
    id: 2,
    name: 'Rohan Singh',
    role: 'Cinematographer / Camera Operator',
    assignedRoleIds: ['role-cinematographer'],
    category: 'production',
    phone: '+919876510002',
    password: 'rohan123',
    active: true,
    mustChangePassword: false,
    rolePayoutRates: {
      'role-cinematographer': 16000,
    },
    rateCard: {
      rateUnder6Hours: 9000,
      rateOver6Hours: 16000,
    },
    ratePerDay: 16000,
    itemPayoutRates: {
      'cat-cine-film': 16000,
      'cat-trad-video': 14000,
      'cat-sde-reel': 12000,
    },
    bio: 'Master of natural light, gimbal tracking, and emotional cinematic pacing.',
  },
  {
    id: 3,
    name: 'Dev Malhotra',
    role: 'Drone Pilot / Aerial Operator',
    assignedRoleIds: ['role-drone-pilot'],
    category: 'production',
    phone: '+919876510003',
    password: 'dev1234',
    active: true,
    mustChangePassword: false,
    rolePayoutRates: {
      'role-drone-pilot': 10000,
    },
    rateCard: {
      flatEventRate: 10000,
    },
    ratePerDay: 10000,
    itemPayoutRates: {
      'cat-drone-aerial': 10000,
      'cat-drone-fpv': 14000,
    },
    bio: 'DGCA-certified drone pilot specialized in architectural fly-throughs & grand baraat overheads.',
  },
  {
    id: 4,
    name: 'Pooja Sharma',
    role: 'Photo Editor & Retoucher',
    assignedRoleIds: ['role-photo-editor', 'role-album-designer'],
    category: 'post-production',
    phone: '+919876510004',
    password: 'pooja123',
    active: true,
    mustChangePassword: false,
    rolePayoutRates: {
      'role-photo-editor': 35,
      'role-album-designer': 12000,
    },
    rateCard: {
      perPhotoRate: 35,
    },
    ratePerDay: 8000,
    itemPayoutRates: {
      'cat-photo-retouch': 35,
      'cat-album-design': 12000,
    },
    bio: 'High-end portrait retoucher and colorist specializing in skin-tone fidelity and heirloom albums.',
  },
  {
    id: 5,
    name: 'Neha Thakur',
    role: 'Cinematic Film Editor',
    assignedRoleIds: ['role-video-editor'],
    category: 'post-production',
    phone: '+919876510005',
    password: 'neha123',
    active: true,
    mustChangePassword: false,
    rolePayoutRates: {
      'role-video-editor': 15000,
    },
    rateCard: {
      flatVideoRate: 15000,
    },
    ratePerDay: 15000,
    itemPayoutRates: {
      'cat-cine-edit': 15000,
      'cat-teaser-edit': 8000,
    },
    bio: 'Lead cinematic film editor and colorist specializing in DaVinci Resolve film emulation & audio mixing.',
  },
  {
    id: 6,
    name: 'Simran Varma',
    role: 'Client Intake & Sales Manager',
    assignedRoleIds: ['role-preprod-intake'],
    category: 'pre-production',
    phone: '+919876510006',
    password: 'simran123',
    active: true,
    mustChangePassword: false,
    rolePayoutRates: {
      'role-preprod-intake': 7000,
    },
    rateCard: {
      rateUnder6Hours: 5000,
      rateOver6Hours: 9000,
    },
    ratePerDay: 9000,
    itemPayoutRates: {
      'cat-client-consult': 5000,
    },
    bio: 'Oversees client consultations, quotation negotiations, itinerary scheduling, and initial intake calls.',
  },
];

export const INITIAL_LEADS: Lead[] = [
  {
    id: 1,
    couple: 'Riya & Karan',
    phone: '+919876543210',
    date: '2026-11-14',
    venue: 'The Leela Palace, New Delhi',
    source: 'Instagram',
    package: 'The Signature Edit',
    value: 185000,
    stage: 'proposal',
    followUp: '2026-08-16',
    notes: 'Requested custom quotation including drone reels and same-day edit preview.',
    email: 'riya.karan@gmail.com',
  },
  {
    id: 2,
    couple: 'Meera & Arjun',
    phone: '+919811122009',
    date: '2026-12-05',
    venue: 'Taj Lake Palace, Udaipur',
    source: 'Referral',
    package: 'The Heirloom',
    value: 260000,
    stage: 'contacted',
    followUp: '2026-08-15',
    notes: 'Couple loves our warm cinematic tones. Scheduling Google Meet with bride and family.',
    email: 'meera.arjun@outlook.com',
  },
  {
    id: 3,
    couple: 'Ananya & Dev',
    phone: '+919822233445',
    date: '2026-10-22',
    venue: 'ITC Grand Bharat, Gurugram',
    source: 'Website',
    package: 'The Cinematic Story',
    value: 210000,
    stage: 'inquiry',
    followUp: '2026-08-18',
    notes: 'Inquired through web contact form for a 2-day golf resort wedding.',
    email: 'ananya.dev@yahoo.com',
  },
  {
    id: 4,
    couple: 'Priyanka & Sameer',
    phone: '+919833344556',
    date: '2026-09-28',
    venue: 'Fairmont, Jaipur',
    source: 'Instagram',
    package: 'The Royal Canvas',
    value: 320000,
    stage: 'won',
    followUp: '2026-08-20',
    notes: 'Signed contract and initial retainer received. Moving to active project scheduling.',
    email: 'priyanka.sameer@wedding.com',
  },
];

export const INITIAL_PROJECTS: ProjectEvent[] = [
  {
    id: 101,
    clientId: 1,
    couple: 'Naina & Aditya',
    eventName: 'Sangeet & Cocktail Night',
    date: '2026-08-14',
    time: '06:00 PM',
    endTime: '11:30 PM',
    venue: 'The Oberoi Amarvilas, Agra',
    address: 'Taj East Gate Road, Tajganj, Agra, Uttar Pradesh 282001',
    mapLink: 'https://maps.google.com/?q=The+Oberoi+Amarvilas+Agra',
    guests: 220,
    teamRequired: {
      photographer: 2,
      cinematographer: 2,
      drone: 1,
    },
    assignments: [1, 2, 3],
    clientLocation: '',
    package: 'The Signature Edit',
    status: 'shooting',
    progress: 50,
    total: 240000,
    paid: 160000,
    due: '2026-08-20',
    dataCopied: true,
    dataReceived: false,
    dataLogs: [
      { teamMemberId: 1, dataGb: '128.5', fileCount: '1420', copied: true, receivedAt: null },
      { teamMemberId: 2, dataGb: '210.0', fileCount: '340', copied: true, receivedAt: null },
      { teamMemberId: 3, dataGb: '64.0', fileCount: '180', copied: true, receivedAt: null },
    ],
    teamPayments: [
      { teamMemberId: 1, amount: 18000, dueDate: '2026-08-25', status: 'pending' },
      { teamMemberId: 2, amount: 22000, dueDate: '2026-08-25', status: 'pending' },
      { teamMemberId: 3, amount: 15000, dueDate: '2026-08-25', status: 'pending' },
    ],
  },
  {
    id: 102,
    clientId: 1,
    couple: 'Naina & Aditya',
    eventName: 'Royal Wedding & Phere',
    date: '2026-08-15',
    time: '04:00 PM',
    endTime: '11:00 PM',
    venue: 'The Oberoi Amarvilas, Agra',
    mapLink: 'https://maps.google.com/?q=The+Oberoi+Amarvilas+Agra',
    guests: 350,
    teamRequired: {
      photographer: 2,
      cinematographer: 2,
      drone: 1,
    },
    assignments: [1, 2, 3, 4],
    clientLocation: 'Villa Poolside entrance for Baraat arrival',
    package: 'The Signature Edit',
    status: 'planning',
    progress: 25,
    total: 280000,
    paid: 150000,
    due: '2026-08-22',
  },
  {
    id: 103,
    clientId: 2,
    couple: 'Ishita & Kabir',
    eventName: 'Haldi & Pool Party',
    date: '2026-08-10',
    time: '11:00 AM',
    endTime: '04:00 PM',
    venue: 'Rambagh Palace, Jaipur',
    mapLink: 'https://maps.google.com/?q=Rambagh+Palace+Jaipur',
    guests: 140,
    teamRequired: {
      photographer: 1,
      cinematographer: 1,
      drone: 0,
    },
    assignments: [1, 2],
    package: 'The Heirloom',
    status: 'post-production',
    progress: 75,
    total: 190000,
    paid: 190000,
    due: null,
    dataReceived: true,
    dataReceivedAt: '2026-08-11T12:30:00Z',
    dataGb: 165.2,
    fileCount: 890,
    paymentAmount: 36000,
    paymentDueDate: '2026-08-18',
    paymentReceived: true,
    dataLogs: [
      { teamMemberId: 1, dataGb: '75.2', fileCount: '520', copied: true, receivedAt: '2026-08-11T12:30:00Z' },
      { teamMemberId: 2, dataGb: '90.0', fileCount: '370', copied: true, receivedAt: '2026-08-11T12:30:00Z' },
    ],
    teamPayments: [
      { teamMemberId: 1, amount: 18000, dueDate: '2026-08-18', status: 'paid', paidAt: '2026-08-12T10:00:00Z' },
      { teamMemberId: 2, amount: 18000, dueDate: '2026-08-18', status: 'paid', paidAt: '2026-08-12T10:00:00Z' },
    ],
  },
  {
    id: 104,
    clientId: 4,
    couple: 'Simran & Rajveer',
    eventName: 'Pre-Wedding Editorial Shoot',
    date: '2026-08-28',
    time: '06:00 AM',
    endTime: '02:00 PM',
    venue: 'Qutub Minar Complex & Lodhi Art District, Delhi',
    mapLink: 'https://maps.google.com/?q=Qutub+Minar',
    guests: 10,
    teamRequired: {
      photographer: 1,
      cinematographer: 1,
      drone: 1,
    },
    assignments: [1, 2, 3],
    package: 'Editorial Pre-Wedding',
    status: 'planning',
    progress: 10,
    total: 95000,
    paid: 40000,
    due: '2026-08-27',
  },
];

export const DEFAULT_STUDIO_TERMS: StudioTermsConfig = {
  teamTerms: [
    'Crew must arrive 45 min prior in all black at the location for equipment calibration, lighting check, and ritual briefing.',
    'Dual-slot redundant backup recording is strictly mandatory on all primary camera bodies at all times.',
    'Audio redundancy: Primary cinematographers must mic the groom/pandit with dedicated wireless transmitters and keep ambient recorders active.',
    'Maintain respectful decorum, discreet movement during solemn ceremony rituals, and prompt coordination with the client family.',
    'Data handoff: All original camera memory cards must be cloned to master NVMe drives with file-hash verification within 24 hours of shoot wrap.',
    'Strict non-disclosure: No unreleased raw footage, unedited photos, or backstage client media may be posted on personal social media without prior studio authorization.'
  ],
  editorTerms: [
    'Teaser Turnaround: 60-second vertical social media reels/teasers must be delivered within 5 days of footage ingest.',
    'Color Grading Master Standards: All video deliverables must strictly adhere to studio LUT / Rec.709 color pipeline with balanced skin tones and loudness-calibrated audio master (-14 LUFS).',
    'Signature Photo Turnaround: Curated color-graded high-resolution photo gallery (400-600 photos) delivered within 21 days.',
    'Highlight Film & Documentaries: Cinematic 4K wedding highlight film (4-8 mins) and traditional ceremony documentary delivered within 45 days.',
    'Client Revision Policy: Two complimentary rounds of creative narrative revisions are included. All timeline files (.prproj / .drp) must be archived on the studio server.'
  ],
  clientQuotationTerms: [
    'Booking Retainer: A 50% advance retainer is required to reserve the dates. The booking is confirmed upon receipt of the advance.',
    'Payment Milestones: 40% due on the first day of the shoot; remaining 10% due upon delivery of final master previews.',
    'Travel & Lodging: For destination shoots outside base city, round-trip flights/transits, hotel accommodation, and meals are arranged by the client.',
    'Raw Footage Policy: Complete unedited 4K raw video clips and high-resolution RAW photos will be provided on a client-provided USB 3.2 hard drive upon full payment.',
    'Artistic Copyright: Baawaray Films retains artistic copyright for showcase/portfolio use; clients receive full non-commercial personal usage rights.'
  ],
  invoiceReceiptTerms: [
    'Taxes & Invoicing: Invoices are subject to applicable GST (18% Goods and Services Tax for professional cinematography & photography services).',
    'Official Payment Modes: Direct NEFT/RTGS bank transfer, studio UPI handle, or crossed account-payee cheque.',
    'Deliverable Release: High-resolution download galleries and physical luxury heirloom wedding albums will be dispatched only after 100% financial settlement.',
    'Cancellation Policy: Retainer payments are non-refundable. Postponements are accommodated subject to studio crew date availability.'
  ]
};

export const DEFAULT_CREW_ROLES: CrewRoleConfig[] = [
  // Events — services staffed on the day of the shoot.
  {
    id: 'role-candid-photographer',
    groupId: 'grp-photographer',
    name: 'Lead Candid Photographer',
    category: 'production',
    defaultRate: 15000,
    rateUnder6Hours: 8000,
    rateOver6Hours: 15000,
    clientBillingRate: 25000,
    isSystem: true,
    permanent: true,
    description: 'Signature artistic portraiture, photojournalistic moments, and heirloom couple captures.',
  },
  {
    id: 'role-traditional-photographer',
    groupId: 'grp-photographer',
    name: 'Traditional / Stage Photographer',
    category: 'production',
    defaultRate: 12000,
    rateUnder6Hours: 6500,
    rateOver6Hours: 12000,
    clientBillingRate: 18000,
    isSystem: true,
    permanent: true,
    description: 'Comprehensive family group portraits, formal stage greetings, and ritual archiving.',
  },
  {
    id: 'role-cinematographer',
    groupId: 'grp-cinematographer',
    name: 'Cinematographer / Camera Operator',
    category: 'production',
    defaultRate: 16000,
    rateUnder6Hours: 9000,
    rateOver6Hours: 16000,
    clientBillingRate: 28000,
    isSystem: true,
    permanent: true,
    description: '4K cinema primes, fluid gimbal movement, and narrative cinematic visual captures.',
  },
  {
    id: 'role-drone-pilot',
    groupId: 'grp-drone',
    name: 'Drone Pilot / Aerial Operator',
    category: 'production',
    defaultRate: 10000,
    flatEventRate: 10000,
    rateUnder6Hours: 7000,
    rateOver6Hours: 10000,
    clientBillingRate: 20000,
    isSystem: true,
    permanent: true,
    description: 'DGCA-licensed aerial 4K footage for grand baraat arrivals, venue establishing shots & fireworks.',
  },
  {
    id: 'role-assistant',
    groupId: 'grp-support',
    name: 'Lighting & Production Assistant',
    category: 'production',
    defaultRate: 5000,
    rateUnder6Hours: 3000,
    rateOver6Hours: 5000,
    clientBillingRate: 9000,
    description: 'Off-camera flash placement, continuous key lighting, audio recorder placement, and backup drive sync.',
  },

  // Deliverables — services produced after the shoot.
  {
    id: 'role-full-coverage',
    groupId: 'grp-video-editor',
    name: 'Full Coverage',
    category: 'post-production',
    defaultRate: 4800,
    hourlyRawDataSellingRate: 2500,
    clientBillingRate: 10000,
    unit: 'per_hour',
    isSystem: true,
    permanent: true,
    description: 'Full raw footage unedited coverage under Video Editing. Client selling price is calculated per hour, while custom editor hourly payout rates are set in each Video Editor profile.',
  },
  {
    id: 'role-album',
    groupId: 'grp-album',
    name: 'Album',
    category: 'post-production',
    defaultRate: 12000,
    flatEventRate: 12000,
    clientBillingRate: 25000,
    unit: 'per_sheet',
    isSystem: true,
    permanent: true,
    description: 'Handcrafted luxury heirloom photo album. Total Price = (Design Price per sheet × sheets) + Bag & Cover Price + (Sheet Printing Price × sheets).',
  },
  {
    id: 'role-video-editor',
    groupId: 'grp-video-editor',
    name: 'Cinematic Film Editor',
    category: 'post-production',
    defaultRate: 15000,
    flatVideoRate: 15000,
    clientBillingRate: 35000,
    isSystem: true,
    permanent: true,
    description: 'Storyline montage, music scoring, sound design, and master cinematic cut in DaVinci/Premiere.',
  },
  {
    id: 'role-photo-editor',
    groupId: 'grp-photo-editor',
    name: 'Photo Editor & Retoucher',
    category: 'post-production',
    defaultRate: 8000,
    perPhotoRate: 35,
    clientBillingRate: 75,
    isSystem: true,
    permanent: true,
    description: 'High-end frequency separation skin retouching, color balance, and bulk archive grading.',
  },
  {
    id: 'role-album-designer',
    groupId: 'grp-album',
    name: 'Luxury Album Designer',
    category: 'post-production',
    defaultRate: 12000,
    flatEventRate: 12000,
    clientBillingRate: 25000,
    isSystem: true,
    permanent: true,
    description: 'Custom fine-art layout design, typography curation, and print-ready album proofing.',
  },
];

export const DEFAULT_PRODUCTION_CATALOG: ProductionCatalogItem[] = [
  {
    id: 'cat-candid-photo',
    name: 'Candid Photography',
    category: 'Photo',
    linkedRoleIds: ['role-candid-photographer'],
    sellingPrice: 25000,
    defaultCost: 15000,
    unit: 'per_event',
    description: 'High-end artistic portraiture, raw emotional candid moments, and bride & groom signature frames.',
    active: true,
  },
  {
    id: 'cat-trad-photo',
    name: 'Traditional / Stage Photography',
    category: 'Photo',
    linkedRoleIds: ['role-traditional-photographer'],
    sellingPrice: 18000,
    defaultCost: 12000,
    unit: 'per_event',
    description: 'Comprehensive family portraits, stage guests greetings, rituals archival coverage with flash setup.',
    active: true,
  },
  {
    id: 'cat-cine-film',
    name: 'Cinematic Video (4K)',
    category: 'Video',
    linkedRoleIds: ['role-cinematographer'],
    sellingPrice: 28000,
    defaultCost: 16000,
    unit: 'per_event',
    description: 'Full-frame 4K cinema primes, fluid motorized gimbal movements, and cinematic storytelling.',
    active: true,
  },
  {
    id: 'cat-trad-video',
    name: 'Traditional Stage Video (Full Rituals)',
    category: 'Video',
    linkedRoleIds: ['role-cinematographer'],
    sellingPrice: 18000,
    defaultCost: 12000,
    unit: 'per_event',
    description: 'Complete unedited ritual recording, full pooja/stage footage, and continuous tripod video capture.',
    active: true,
  },
  {
    id: 'cat-drone-aerial',
    name: 'Aerial Drone Coverage',
    category: 'Drone',
    linkedRoleIds: ['role-drone-pilot'],
    sellingPrice: 20000,
    defaultCost: 10000,
    unit: 'per_event',
    description: 'Licensed 4K drone cinematography for venue establishing sweeps, grand baraat, and varmala fireworks.',
    active: true,
  },
  {
    id: 'cat-sde-reel',
    name: 'Same-Day Edit (SDE) Reel & Teaser',
    category: 'Video',
    linkedRoleIds: ['role-cinematographer', 'role-video-editor'],
    sellingPrice: 22000,
    defaultCost: 12000,
    unit: 'per_event',
    description: 'Rapid turnaround 9:16 vertical reel edited on-site to premiere during the evening reception.',
    active: true,
  },
  {
    id: 'cat-prewed-photo',
    name: 'Pre-Wedding Editorial Concept Shoot',
    category: 'Photo',
    linkedRoleIds: ['role-candid-photographer'],
    sellingPrice: 35000,
    defaultCost: 18000,
    unit: 'per_day',
    description: '1-day fashion editorial couple shoot with curated styling, multiple outfit lookbooks, and locations.',
    active: true,
  },
  {
    id: 'cat-live-webcast',
    name: 'Multi-Camera HD Live Webcast Setup',
    category: 'Live',
    linkedRoleIds: ['role-assistant', 'role-cinematographer'],
    sellingPrice: 25000,
    defaultCost: 14000,
    unit: 'per_event',
    description: 'Dedicated multi-camera live broadcast with high-gain audio feed for global friends and relatives.',
    active: true,
  },
  {
    id: 'cat-assistant-lighting',
    name: 'Lighting & Stage Assistant',
    category: 'Service',
    linkedRoleIds: ['role-assistant'],
    sellingPrice: 9000,
    defaultCost: 5000,
    unit: 'per_event',
    description: 'Off-camera wireless flash positioning, softbox diffuser rigging, and immediate footage card ingestion.',
    active: true,
  },
];

export const DEFAULT_STUDIO_PRICE_LIST: StudioPriceList = {
  candidPhotographerRate: 20000,
  traditionalPhotographerRate: 15000,
  cinematographerRate: 25000,
  droneRate: 15000,
  assistantRate: 5000,
  crewRoles: DEFAULT_CREW_ROLES,
  productionCatalog: DEFAULT_PRODUCTION_CATALOG,
  standardDeliverables: [
    'All Photos (High-Resolution Unedited RAW + Digital Archive)',
    'Curated Edited Photos (Master Color-Graded & Retouched)',
    '30 to 60 Minute Signature Cinematic Film',
    'Speech or Performance Cut (Full Uncut Ritual / Stage Coverage upon request)',
    'Cinematic Trailer (3 to 5 Minutes 4K Teaser)',
  ],
  addOnCatalog: [
    {
      id: 'addon-album-1',
      title: 'Fine-Art Flush Mount Luxury Album (30 Sheets / 60 Pages)',
      category: 'Album',
      description: 'Handcrafted Italian linen or genuine leather cover with archival lay-flat printing.',
      defaultPrice: 25000,
    },
    {
      id: 'addon-prewed-1',
      title: 'Cinematic Pre-Wedding Concept Shoot (1 Day)',
      category: 'Video',
      description: '1-day editorial shoot with 2 crew members, concept styling, and 2-min cinematic teaser.',
      defaultPrice: 60000,
    },
    {
      id: 'addon-sde-1',
      title: 'Same-Day Edit (SDE) Social Media Reel (Within 24 Hours)',
      category: 'Video',
      description: 'Quick turnaround vertical 4K reel edited on-site to screen during the Reception / Sangeet.',
      defaultPrice: 18000,
    },
    {
      id: 'addon-raw-ssd-1',
      title: 'Uncompressed Master 4K RAW SSD Hard Drive (2TB High-Speed NVMe)',
      category: 'Storage',
      description: 'Complete uncompressed master footage, multicam project files, and RAW photos on a shockproof SSD.',
      defaultPrice: 12000,
    },
    {
      id: 'addon-live-1',
      title: 'Multi-Camera HD Live Webcast Broadcast',
      category: 'Service',
      description: 'Private high-definition streaming for global family & friends with dedicated audio feed.',
      defaultPrice: 22000,
    },
    {
      id: 'addon-mini-album-1',
      title: 'Parent Keepsake Miniature Albums (Set of 2)',
      category: 'Album',
      description: 'Compact 8x8 duplicate hardcover albums curated specifically for parents.',
      defaultPrice: 15000,
    },
  ],
};

export const INITIAL_QUOTATIONS: Quotation[] = [
  {
    id: 'qt-1',
    quoteNumber: 'BAA-QT-2026-001',
    clientName: 'Kavya & Shreyas',
    phone: '+919876529901',
    email: 'kavya.shreyas@gmail.com',
    city: 'Udaipur, Rajasthan',
    createdAt: '2026-08-14',
    validUntil: '2026-08-21',
    status: 'sent',
    events: [
      {
        id: 'qte-1',
        eventName: 'Mehendi & Sundowner',
        date: '2026-11-20',
        time: '03:00 PM',
        endTime: '08:00 PM',
        venue: 'The Leela Palace Courtyard',
        city: 'Udaipur',
        guestCount: 200,
        teamRequired: {
          candidPhotographer: 1,
          traditionalPhotographer: 1,
          cinematographer: 2,
          drone: 1,
          assistant: 1,
        },
      },
      {
        id: 'qte-2',
        eventName: 'Sangeet & Cocktail Night',
        date: '2026-11-21',
        time: '07:00 PM',
        endTime: '01:30 AM',
        venue: 'Jagmandir Island Palace Ballroom',
        city: 'Udaipur',
        guestCount: 350,
        teamRequired: {
          candidPhotographer: 2,
          traditionalPhotographer: 1,
          cinematographer: 2,
          drone: 1,
          assistant: 1,
        },
      },
      {
        id: 'qte-3',
        eventName: 'Haldi & Wedding Ceremony',
        date: '2026-11-22',
        time: '10:00 AM',
        endTime: '09:00 PM',
        venue: 'Zenana Mahal, City Palace',
        city: 'Udaipur',
        guestCount: 400,
        teamRequired: {
          candidPhotographer: 2,
          traditionalPhotographer: 2,
          cinematographer: 3,
          drone: 1,
          assistant: 2,
        },
      },
    ],
    deliverables: [
      {
        id: 'std-1',
        title: 'All Photos (High-Resolution Unedited Digital Archive)',
        category: 'Photo',
        isStandard: true,
        included: true,
        price: 0,
      },
      {
        id: 'std-2',
        title: 'Curated Edited Photos (Master Color-Graded & Retouched, 500+ photos)',
        category: 'Photo',
        isStandard: true,
        included: true,
        price: 0,
      },
      {
        id: 'std-3',
        title: '30 to 60 Minute Signature Cinematic Film',
        category: 'Video',
        isStandard: true,
        included: true,
        price: 0,
      },
      {
        id: 'std-4',
        title: 'Speech or Performance Cut (Full Uncut Stage & Ritual Coverage upon request)',
        category: 'Video',
        isStandard: true,
        included: true,
        price: 0,
      },
      {
        id: 'std-5',
        title: 'Cinematic Trailer (3 to 5 Minutes 4K Teaser)',
        category: 'Video',
        isStandard: true,
        included: true,
        price: 0,
      },
      {
        id: 'addon-album-1',
        title: 'Fine-Art Flush Mount Luxury Album (30 Sheets / 60 Pages)',
        category: 'Album',
        isStandard: false,
        included: true,
        price: 25000,
      },
      {
        id: 'addon-sde-1',
        title: 'Same-Day Edit (SDE) Social Media Reel (Within 24 Hours)',
        category: 'Video',
        isStandard: false,
        included: true,
        price: 18000,
      },
    ],
    subtotal: 543000,
    discountType: 'amount',
    discountValue: 18000,
    taxPercent: 0,
    totalAmount: 525000,
    paymentSchedule: [
      { milestone: 'Booking Advance (Date Lock)', percentage: 25, amount: 131250 },
      { milestone: 'On Shoot Commencement (Day 1)', percentage: 60, amount: 315000 },
      { milestone: 'Final Master Previews & Delivery', percentage: 15, amount: 78750 },
    ],
    specialNotes: 'Complimentary drone coverage included for Baraat entrance and Grand Varmala ceremony. Flights and hotel stay for 7 crew members to be provided by client.',
  },
];

import { StudioSettingsConfig, PipelineStageConfig } from '../types';

/** The five stages the Sales pipeline ships with. `inquiry`, `quoted`, and `booked`
 * are load-bearing — the follow-up queue and the advance-payment gate key off those
 * exact ids — so they're marked `core` and can be relabelled but never deleted. */
export const DEFAULT_PAYMENT_MODES: string[] = ['Bank Transfer', 'UPI', 'Cheque', 'Cash', 'Card'];

export const DEFAULT_PAYMENT_ACCOUNTS: import('../types').PaymentAccountConfig[] = [
  { id: 'acct-primary', label: 'Studio Current Account', details: 'HDFC Bank •••• 4821', active: true },
];

export const DEFAULT_PIPELINE_STAGES: PipelineStageConfig[] = [
  { id: 'new_enquiry', label: 'New Enquiry', color: 'text-slate-800', bg: 'bg-slate-100 border-slate-200', core: true },
  { id: 'quote_sent', label: 'Quote Sent', color: 'text-indigo-800', bg: 'bg-indigo-50 border-indigo-200', core: true },
  { id: 'follow_up', label: 'Follow-Up Due', color: 'text-orange-800', bg: 'bg-orange-50 border-orange-200', core: true },
  { id: 'on_hold', label: 'Date On Hold', color: 'text-amber-800', bg: 'bg-amber-50 border-amber-200', core: true },
  { id: 'advance_pending', label: 'Advance Pending', color: 'text-blue-800', bg: 'bg-blue-50 border-blue-200', core: true },
  { id: 'booked', label: 'Booked', color: 'text-emerald-900', bg: 'bg-emerald-50 border-emerald-200', core: true },
  { id: 'lost', label: 'Lost', color: 'text-rose-800', bg: 'bg-rose-50 border-rose-200', core: true },
  { id: 'needs_time', label: 'Needs Time', color: 'text-gray-600', bg: 'bg-gray-100 border-gray-200', core: true },
];

export const DEFAULT_STANDARD_DELIVERABLES: import('../types').StandardDeliverableTemplate[] = [
  {
    id: 'std-deliv-raw-photos',
    title: 'All Photos (High-Resolution Unedited RAW + Digital Archive)',
    category: 'Photo',
    tierCategory: 'production',
    linkedRoleId: 'role-candid-photographer',
    defaultPrice: 0,
    isStandard: true,
    includedByDefault: true,
    description: 'Master unedited RAW captures stored on cloud archive & client disk',
  },
  {
    id: 'std-deliv-edited-photos',
    title: 'Curated Edited Photos (Master Color-Graded & Retouched, 500+ photos)',
    category: 'Photo',
    tierCategory: 'post-production',
    linkedRoleId: 'role-photo-editor',
    defaultPrice: 0,
    isStandard: true,
    includedByDefault: true,
    description: 'High-res magazine-grade color graded and skin retouched photos',
  },
  {
    id: 'std-deliv-cinematic-film',
    title: '30 to 60 Minute Signature Cinematic Film',
    category: 'Video',
    tierCategory: 'post-production',
    linkedRoleId: 'role-video-editor',
    defaultPrice: 0,
    isStandard: true,
    includedByDefault: true,
    description: 'Comprehensive 4K cinematic film with master audio mix and color grade',
  },
  {
    id: 'std-deliv-uncut-rituals',
    title: 'Speech or Performance Cut (Full Uncut Ritual & Stage Coverage)',
    category: 'Video',
    tierCategory: 'post-production',
    linkedRoleId: 'role-video-editor',
    defaultPrice: 0,
    isStandard: true,
    includedByDefault: true,
    description: 'Complete archival recording of stage performances and sacred rituals',
  },
  {
    id: 'std-deliv-trailer',
    title: 'Cinematic Trailer (3 to 5 Minutes 4K Teaser)',
    category: 'Video',
    tierCategory: 'post-production',
    linkedRoleId: 'role-video-editor',
    defaultPrice: 0,
    isStandard: true,
    includedByDefault: true,
    description: 'High-energy cinematic teaser cut with emotional highlights',
  },
  {
    id: 'addon-album-1',
    title: 'Fine-Art Flush Mount Luxury Album (30 Sheets / 60 Pages)',
    category: 'Album',
    tierCategory: 'post-production',
    linkedRoleId: 'role-album-designer',
    defaultPrice: 25000,
    isStandard: false,
    includedByDefault: false,
    description: 'Handcrafted Italian linen or genuine leather cover with lay-flat archival printing',
  },
  {
    id: 'addon-sde-1',
    title: 'Same-Day Edit (SDE) Social Media Reel (Within 24 Hours)',
    category: 'Video',
    tierCategory: 'production',
    linkedRoleId: 'role-video-editor',
    defaultPrice: 18000,
    isStandard: false,
    includedByDefault: false,
    description: 'On-site edited vertical 9:16 reel to premiere at the Reception',
  },
  {
    id: 'addon-prewed-1',
    title: 'Cinematic Pre-Wedding Concept Shoot (1 Day)',
    category: 'Video',
    tierCategory: 'production',
    linkedRoleId: 'role-cinematographer',
    defaultPrice: 60000,
    isStandard: false,
    includedByDefault: false,
    description: '1-day concept shoot with 2 crew members, concept styling, and teaser',
  },
  {
    id: 'addon-raw-ssd-1',
    title: 'Uncompressed Master 4K RAW SSD Hard Drive (2TB High-Speed NVMe)',
    category: 'Storage',
    tierCategory: 'production',
    linkedRoleId: 'role-assistant',
    defaultPrice: 12000,
    isStandard: false,
    includedByDefault: false,
    description: 'Complete uncompressed master footage & RAW photos on a shockproof SSD',
  },
  {
    id: 'addon-live-1',
    title: 'Multi-Camera HD Live Webcast Broadcast',
    category: 'Service',
    tierCategory: 'production',
    linkedRoleId: 'role-assistant',
    defaultPrice: 22000,
    isStandard: false,
    includedByDefault: false,
    description: 'Dedicated high-definition live stream with audio feed for remote guests',
  },
];

export const DEFAULT_ALBUM_PRICING: import('../types').AlbumPricingConfig = {
  defaultSheetCount: 40,
  sheetTypes: [
    {
      id: 'sheet-lustre',
      name: 'Lustre Fine-Art Archival Paper',
      printingSellingRatePerSheet: 150,
      printingCostRatePerSheet: 90,
      description: 'Classic semi-gloss texture with anti-glare finish and vivid color reproduction.',
    },
    {
      id: 'sheet-metallic-silk',
      name: 'Metallic Silk Velvet Paper',
      printingSellingRatePerSheet: 220,
      printingCostRatePerSheet: 130,
      description: 'Luminous pearlescent metallic sheen with rich contrast and deep blacks.',
    },
    {
      id: 'sheet-matte-feather',
      name: 'Ultra Matte Non-Tearable Feather Touch',
      printingSellingRatePerSheet: 280,
      printingCostRatePerSheet: 160,
      description: 'Zero-reflection soft velvet touch matte surface with archival museum grade pigment.',
    },
    {
      id: 'sheet-hd-gloss',
      name: 'High-Definition Gloss Crystal Sheet',
      printingSellingRatePerSheet: 190,
      printingCostRatePerSheet: 110,
      description: 'Ultra-clear crystal gloss coating with extreme sharpness for high-contrast frames.',
    },
  ],
  coverBagTypes: [
    {
      id: 'cover-leatherette-box',
      name: 'Italian Leatherette Cover + Magnetic Hard Case',
      sellingPrice: 3500,
      costPrice: 1800,
      description: 'Supple vegan leatherette foil-embossed cover with custom magnetic keepsake storage box.',
    },
    {
      id: 'cover-acrylic-velvet',
      name: 'Acrylic Glass Face Cover + Velvet Briefcase Box',
      sellingPrice: 5500,
      costPrice: 2800,
      description: '4mm diamond-polished shatterproof acrylic photo front with royal velvet hard briefcase.',
    },
    {
      id: 'cover-wood-engraved',
      name: 'Handcrafted Wooden Carved Box + Genuine Leather Spine',
      sellingPrice: 7000,
      costPrice: 3500,
      description: 'Bespoke laser-engraved teak wood presentation box with premium distressed leather album.',
    },
    {
      id: 'cover-linen-minimalist',
      name: 'Natural European Linen Cover + Slipcase Sleeve',
      sellingPrice: 2800,
      costPrice: 1400,
      description: 'Eco-friendly organic woven linen with blind debossing and protective matching slipcase.',
    },
  ],
  designRates: [
    {
      id: 'design-standard',
      name: 'Standard Studio Story Layout',
      designSellingRatePerSheet: 100,
      designCostRatePerSheet: 50,
      description: 'Clean sequential wedding highlights with balanced image borders and white margins.',
    },
    {
      id: 'design-magazine',
      name: 'Editorial Magazine & Cinematic Spread',
      designSellingRatePerSheet: 180,
      designCostRatePerSheet: 90,
      description: 'Vogue-style typography, double-page panoramic hero frames, and storytelling flow.',
    },
    {
      id: 'design-bespoke',
      name: 'Bespoke Fine-Art Minimalist Masterpiece',
      designSellingRatePerSheet: 250,
      designCostRatePerSheet: 130,
      description: 'Custom curated negative space, bespoke script typography, and bespoke color curation.',
    },
  ],
};

export const DEFAULT_RAW_COVERAGE_RATES: import('../types').FullCoverageRawRateConfig = {
  hourlySellingRate: 2500,
  hourlyCostRate: 1200,
  defaultDurationHours: 4,
  description: 'Full unedited footage raw data hourly pricing and editor ingestion/export payout.',
};

/**
 * The WhatsApp note that goes out with a quotation PDF. Editable per studio under
 * Quotation Settings → WhatsApp; the placeholders below are substituted at send
 * time and any that the studio deletes simply don't appear.
 */
export const DEFAULT_WHATSAPP_QUOTATION_MESSAGE = `Hi {{client_name}},

Thank you for considering {{studio_name}} for your celebration.
Please find your quotation ({{quote_number}}) attached.

Total: {{total}}

This quote is valid for {{validity_days}} days, after which the dates release back to our open calendar.

Do let us know if you have any questions — happy to walk you through it.`;

/**
 * "About us" — the studio's standing introduction, printed on every proposal.
 *
 * A first draft in the studio's voice, meant to be edited under Quotation Settings
 * rather than treated as final. Kept to a length that sets well on a 40-character
 * measure without running to a second page.
 */
export const DEFAULT_ABOUT_US = `We are a small wedding photography and cinematography studio, and we work the way a small studio can — the people you meet are the people who shoot your wedding.

We film across India and travel for destination celebrations. Most of our work comes from couples who saw us at a friend's wedding, which is the only kind of recommendation we have ever really needed.`;

/**
 * "Our approach" — how the studio works, printed on every proposal.
 *
 * Sits after the note to the couple, before their events. Same editing note as
 * DEFAULT_ABOUT_US: this is a starting point, not finished copy.
 */
export const DEFAULT_OUR_APPROACH = `We stay out of the way. No posed line-ups unless you ask for them, no interrupting a moment to light it better. What happens at your wedding is more interesting than anything we could stage.

We shoot for the edit, not for the day. That means quieter coverage while it is happening and a film that holds together afterwards — the grandmother watching from the side, the cousins who never sat down, the ten seconds before you noticed anyone was filming.

You will see everything we take. The full gallery, unhurried, in the order it happened.`;

export const DEFAULT_QUOTATION_BUILDER_SETTINGS: import('../types').QuotationBuilderSettingsConfig = {
  serviceCategories: ['production'],
  deliverableCategories: ['post-production', 'production'],
  deliverableTierCategories: ['post-production', 'production'],
  whatsappMessageTemplate: DEFAULT_WHATSAPP_QUOTATION_MESSAGE,
  aboutUs: DEFAULT_ABOUT_US,
  ourApproach: DEFAULT_OUR_APPROACH,
};

export const DEFAULT_STUDIO_SETTINGS: StudioSettingsConfig = {
  studioName: 'Baawaray Films & Studio',
  studioTagline: 'Capturing Timeless Royal Weddings & Cinematic Stories',
  logoUrl: '',
  taxGstPercent: 0,
  maxDiscountPercent: 10,
  quotationValidityDays: 15,
  currency: '₹',
  watermarkText: 'Baawaray Films - Confidential',
  clientStatuses: [
    'Booked',
    'Shoot Done',
    'Completed',
    'Inquiry',
    'New Lead',
  ],
  tierCategories: DEFAULT_TIER_CATEGORIES,
  roleGroups: DEFAULT_ROLE_GROUPS,
  crewRoles: DEFAULT_CREW_ROLES,
  productionCatalog: DEFAULT_PRODUCTION_CATALOG,
  quotationBuilderSettings: DEFAULT_QUOTATION_BUILDER_SETTINGS,
  rawCoverageRates: DEFAULT_RAW_COVERAGE_RATES,
  albumPricing: DEFAULT_ALBUM_PRICING,
  leadSources: [
    'Instagram (@baawarayfilms)',
    'Website Inquiry',
    'Word of Mouth / Referral',
    'WeddingWire / WedMeGood',
    'Google Ads',
    'Direct Walk-in',
    'Other'
  ],
  deliverableCategories: [
    'Photo',
    'Video',
    'Album',
    'Storage',
    'Service'
  ],
  paymentMilestones: [
    { name: 'Booking Advance', percentage: 25, description: 'Payable upon date locking & contract signing' },
    { name: 'Pre-Shoot / Event Eve', percentage: 25, description: 'Payable before event commencement' },
    { name: 'On Event Day', percentage: 40, description: 'Payable during event execution' },
    { name: 'Final Delivery', percentage: 10, description: 'Payable upon final link & album dispatch' }
  ]
};


