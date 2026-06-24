// core/services/batch-draft/batch-draft.types.ts

export interface BatchDraftItemData {
    id: string;
    draftId: string;
    localId: string;
    cornerId: string;
    cornerName: string;
    customerId: string;
    customerName: string;
    customerEmail: string;
    deviceSerial: string;
    issueTypeId: string;
    issueTypeName: string;
    slotIds: string[];
    startTime: Date;
    endTime: Date;
    description: string;
    notes: string;
    status: 'pending' | 'error';
    lastError: string | null;
    createdAt: Date;
}

export interface BatchDraftData {
    id: string;
    userId: string;
    items: BatchDraftItemData[];
    createdAt: Date;
    updatedAt: Date;
}

export interface AddBatchItemCommand {
    localId: string;
    cornerId: string;
    cornerName: string;
    customerId: string;
    customerName: string;
    customerEmail: string;
    deviceSerial: string;
    issueTypeId: string;
    issueTypeName: string;
    slotIds: string[];
    startTime: string;
    endTime: string;
    description: string;
    notes?: string;
}

export interface EditBatchItemCommand {
    cornerId?: string;
    cornerName?: string;
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    deviceSerial?: string;
    issueTypeId?: string;
    issueTypeName?: string;
    slotIds?: string[];
    startTime?: string;
    endTime?: string;
    description?: string;
    notes?: string;
}

export interface BatchSubmitResultItem {
    localId: string;
    status: 'success' | 'error';
    incidentId?: string;
    error?: string;
}
