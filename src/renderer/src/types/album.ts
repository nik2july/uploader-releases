export type AlbumJobStatus = 
  | 'quote'
  | 'booked'
  | 'selection_pending'
  | 'designing'
  | 'proofing'
  | 'printing'
  | 'qc_binding'
  | 'ready'
  | 'delivered';

export type DesignerJobStatus = 
  | 'unassigned'
  | 'assigned'
  | 'in_progress'
  | 'submitted'
  | 'approved';

export type VendorJobStatus = 
  | 'draft'
  | 'po_sent'
  | 'in_print'
  | 'binding'
  | 'dispatched'
  | 'received';

export type ClientProofStatus = 
  | 'not_sent'
  | 'sent_for_review'
  | 'revisions_requested'
  | 'client_approved';

export type PaymentMilestoneStatus = 'unpaid' | 'partial' | 'paid';

export interface AlbumSheetRate {
  sheetType: string;
  pricePerSheet: number;
}

export type AlbumSheetType = string;

export type DesignerRateModel = 'per_sheet' | 'fixed_album' | 'salary';
export type DesignerType = 'in_house' | 'freelance';

export interface AlbumVendorPaperRate {
  id: string;
  paperType: string; // e.g. "Lustre Archival Paper", "Silk Matte", "Velvet Ultra Touch", "Metallic Gloss", "Non-Tearable HD Synthetic"
  gsm?: string | number;
  size: string; // e.g. "12x36", "12x30", "10x30", "12x18", "12x24", "10x24"
  vendorCostPerSheet: number; // Lab printing cost per sheet (₹)
  defaultSellingRatePerSheet: number; // Client selling rate per sheet (₹)
  description?: string;
}

export interface AlbumCoverBagBundle {
  id: string;
  name: string; // e.g. "Royal Italian Leatherette Cover + Magnetic Hard Box", "Acrylic 3D Glass Face + Velvet Trunk Case", "Rustic Pine Wooden Box + Engraved Leatherette Spine", "Handcrafted Linen Book + Matching Slipcase Tote"
  vendorCostPrice: number; // Collective cost price for Cover + Bag (₹)
  defaultSellingPrice: number; // Collective selling price for Cover + Bag (₹)
  supportedSizes?: string[]; // e.g. ["12x36", "12x30", "10x30"]
  material?: string;
  coverMaterial?: string;
  bagType?: string;
  imageUrl?: string;
  description?: string;
}

export interface AlbumVendor {
  id: string;
  name: string; // e.g. "Canvera Pro Labs", "Albums Craft World", "ColorFly Luxury Labs"
  contactPerson?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  turnaroundDays?: number;
  notes?: string;
  rating?: number;
  coverAndBagPrice?: number;
  sheetRates?: AlbumSheetRate[];
  paperRates: AlbumVendorPaperRate[];
  coverBagBundles: AlbumCoverBagBundle[];
}

export interface AlbumDesigner {
  id: string | number;
  name: string;
  designerType: DesignerType; // 'in_house' (salaried from Team panel) | 'freelance'
  teamMemberId?: number; // Linked team member ID if in_house
  phone?: string;
  email?: string;
  rateModel: DesignerRateModel; // 'per_sheet' | 'fixed_album' | 'salary'
  ratePerSheet: number; // Designer charge per sheet (₹) e.g. ₹80 / sheet (₹0 if in_house salary)
  fixedAlbumRate?: number; // Fixed charge per album (₹)
  monthlySalary?: number; // Monthly base salary if in-house
  turnaroundDays?: number;
  activeJobsCount?: number;
  portfolioUrl?: string;
  specialization?: string; // e.g. "Candid & Cinematic Layouts", "Traditional Multi-Page Spread"
  upiId?: string;
  bankDetails?: string;
  notes?: string;
}

export interface AlbumPreset {
  id: string;
  title: string; // e.g. "Signature Royal Italian Leatherette 12x36 (35 Sheets)"
  size: string; // e.g. "12x36"
  defaultSheetCount: number; // e.g. 35 (minimum 10)
  defaultPhotoCount: number; // e.g. 150
  vendorId: string;
  vendorName: string;
  paperTypeId: string;
  paperTypeName: string;
  coverBagBundleId: string;
  coverBagBundleName: string;
  designerRatePerSheet: number;
  sellingPrice: number; // Client price
  estimatedCost: number; // Total cost
  description: string;
  badge?: string; // e.g. "Most Popular", "Luxury Choice", "Budget Friendly"
}

export interface AlbumActivityLog {
  id: string;
  date?: string;
  timestamp?: string;
  action: string;
  user?: string;
  actor?: string;
  notes?: string;
}

export const ALBUM_STATUS_META: Record<AlbumJobStatus, { label: string; bg: string; text: string; border: string; desc: string }> = {
  quote: { label: 'Quote / Inactive', bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-200', desc: 'Quoting client' },
  booked: { label: 'Booked / Confirmed', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', desc: 'Order confirmed & advance pending' },
  selection_pending: { label: 'Selection Pending', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', desc: 'Awaiting client photos' },
  designing: { label: 'Designing', bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200', desc: 'Layout & retouching' },
  proofing: { label: 'Client Proofing', bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200', desc: 'Client review & revisions' },
  printing: { label: 'Printing at Lab', bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200', desc: 'Sent to print lab' },
  qc_binding: { label: 'Binding & QC', bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200', desc: 'Binding, inspection & boxing' },
  ready: { label: 'Ready for Pickup', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', desc: 'At studio, ready to deliver' },
  delivered: { label: 'Delivered', bg: 'bg-stone-200', text: 'text-stone-800', border: 'border-stone-300', desc: 'Delivered to couple' },
};

// Sub-album definition when a single job includes multiple books (e.g. Couple Album + Parents Albums)
export interface AlbumItemSpec {
  id: string;
  type?: 'main' | 'parent' | 'pocket' | 'mini' | string;
  title: string; // e.g. "Main Couple Album", "Parents Album (Groom)", "Parents Album (Bride)"
  size: string; // "12x36", "12x30", "10x30", "12x24", "10x24", "12x18"
  sheetCount: number; // Minimum 10 sheets (20 pages)
  photoCount?: number;
  copies: number; // default 1
  notes?: string;
  paperTypeId?: string;
  paperTypeName?: string;
  vendorPaperRatePerSheet?: number;
  coverBagBundleId?: string;
  coverBagBundleName?: string;
  coverBagCostPrice?: number;
}

export type DeliveryType = 'none' | 'shiprocket' | 'local_custom';
export type DeliveryOption = DeliveryType;

export interface AlbumJob {
  id: string;
  albumNumber: string; // e.g. "ALB-2026-001"
  title: string; // e.g. "Aarav & Meera Wedding Album"
  clientId?: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  clientAddress?: string;
  deliveryPincode?: string;
  deliveryCity?: string;
  eventId?: number;
  eventName?: string;
  status: AlbumJobStatus;
  
  // Specs & Multi-Album Support
  size: string; // Primary album size
  sheetCount: number; // Total sheets across all albums (minimum 10 per album)
  photoCount: number; // Total photos selected
  albumItems?: AlbumItemSpec[]; // Detailed list of albums in this job
  rawPhotosDriveLink?: string;
  presetId?: string;
  presetName?: string;
  
  // Vendor Printing Details (Cover & Bag are sold collectively)
  vendorId: string;
  vendorName: string;
  paperTypeId: string;
  paperTypeName: string;
  vendorPaperRatePerSheet: number; // Cost from vendor per sheet
  coverBagBundleId: string;
  coverBagBundleName: string;
  coverBagCostPrice: number; // Collective cost price for cover + bag
  coverBagSellingPrice: number; // Collective selling price for cover + bag
  
  // Designer Details (In-house or Freelance)
  designerId?: string | number;
  designerName?: string;
  designerType?: DesignerType;
  designerTeamMemberId?: number;
  designerRatePerSheet: number; // Payout per sheet to designer (₹0 if in_house salary)
  designerDriveFolder?: string;
  designerProofLink?: string;
  designerStatus: DesignerJobStatus;
  designerPayout: number; // Calculated designer payout
  designerPaid: boolean;
  designerPaidDate?: string;
  designerNotes?: string;
  
  // Vendor Production Details
  vendorPoNumber?: string;
  vendorStatus: VendorJobStatus;
  vendorPrintCost: number; // Base print cost (sheets * paper rate + cover & bag)
  vendorShippingCost?: number;
  vendorPaid: boolean;
  vendorPaidDate?: string;
  vendorTrackingNumber?: string;
  vendorCourierName?: string;
  vendorNotes?: string;
  
  // Delivery & Packaging (Optional, with Shiprocket or Custom Local; 2x cost to client)
  deliveryOption: DeliveryType;
  deliveryCourierName?: string;
  deliveryCourierCost?: number; // Actual courier/shipping cost
  deliveryPackagingCharge?: number; // 2x courier cost charged to client
  deliveryTrackingNumber?: string;
  deliveryAddress?: string;
  
  // Commercials & Pricing Engine (100% markup default + profit/discount controls)
  totalProductionCost: number; // Total lab + designer + accessories + delivery cost
  profitMarkupPercent: number; // Default 100% (doubles the cost)
  customProfitAmount?: number; // Extra profit addition
  clientPaperRatePerSheet: number;
  clientSellingPrice: number; // Base selling price before discount
  clientDiscount: number; // Direct discount amount
  clientFinalPrice: number; // Final payable amount by client
  clientPaidAmount: number;
  clientPaymentStatus: 'unpaid' | 'partial' | 'paid';
  
  // Payment Milestones (50% before designing & 50% before printing)
  advanceRequiredAmount: number; // 50% of clientFinalPrice
  advancePaid: boolean;
  advancePaidDate?: string;
  balanceRequiredAmount: number; // Remaining 50% before printing
  balancePaid: boolean;
  balancePaidDate?: string;
  
  // Proofing & Revisions
  clientProofStatus: ClientProofStatus;
  clientProofLink?: string;
  clientRevisionNotes?: string;
  revisionsCount: number;
  
  // Dates
  createdAt: string;
  updatedAt: string;
  targetDeliveryDate?: string;
  clientDeliveryDate?: string;
  
  notes?: string;
  logs: AlbumActivityLog[];
}
