import { UserId } from "../types/branded-ids"
import { DomainError } from "../types/incident-types"
import { Result } from "@app/result"

export type EvidenceType = 'PHOTO' | 'SIGNATURE' | 'DOCUMENT'

export const VALID_MIME_TYPES: Record<EvidenceType, string[]> = {
    PHOTO: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    SIGNATURE: ['image/png', 'image/svg+xml'],
    DOCUMENT: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
}

export class InvalidUrlError extends DomainError {
    constructor(url: string) {
        super(`Invalid URL provided: ${url}`)
        this.name = 'InvalidUrlError'
    }
}

export class InvalidMimeTypeError extends DomainError {
    constructor(mimeType: string, type: EvidenceType) {
        super(`Invalid MIME type "${mimeType}" for evidence type "${type}"`)
        this.name = 'InvalidMimeTypeError'
    }
}

export class InvalidEvidenceSizeError extends DomainError {
    constructor(size: number) {
        super(`Evidence size must be positive, got: ${size}`)
        this.name = 'InvalidEvidenceSizeError'
    }
}

export interface EvidenceMetadata {
    capturedAt: Date
    capturedBy: UserId
    type: EvidenceType
    mimeType: string
    size: number
}

export class Evidence {
    private constructor(
        public readonly id: string,
        public readonly url: string,
        public readonly metadata: EvidenceMetadata
    ) { }

    private static isValidUrl(url: string): boolean {
        if (!url || typeof url !== 'string' || url.trim() === '') {
            return false
        }
        try {
            new URL(url)
            return true
        } catch {
            return false
        }
    }

    private static isValidMimeType(mimeType: string, type: EvidenceType): boolean {
        if (!mimeType || typeof mimeType !== 'string' || mimeType.trim() === '') {
            return false
        }
        return VALID_MIME_TYPES[type].includes(mimeType)
    }

    static create(
        url: string,
        capturedBy: UserId,
        type: EvidenceType,
        mimeType: string,
        size: number
    ): Result<Evidence, DomainError> {
        if (!this.isValidUrl(url)) {
            return Result.err(new InvalidUrlError(url))
        }

        if (!this.isValidMimeType(mimeType, type)) {
            return Result.err(new InvalidMimeTypeError(mimeType, type))
        }

        if (size <= 0) {
            return Result.err(new InvalidEvidenceSizeError(size))
        }

        return Result.ok(new Evidence(
            crypto.randomUUID(),
            url,
            {
                capturedAt: new Date(),
                capturedBy,
                type,
                mimeType,
                size
            }
        ))
    }

    static reconstitute(
        id: string,
        url: string,
        metadata: EvidenceMetadata
    ): Evidence {
        return new Evidence(id, url, metadata)
    }
}