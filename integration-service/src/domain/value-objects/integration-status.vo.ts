export class IntegrationStatus {
    public static readonly PENDING = new IntegrationStatus('PENDING');
    public static readonly PROCESSING = new IntegrationStatus('PROCESSING');
    public static readonly PARTIALLY_COMPENSATED = new IntegrationStatus('PARTIALLY_COMPENSATED');
    public static readonly COMPENSATION_FAILED = new IntegrationStatus('COMPENSATION_FAILED');
    public static readonly COMPLETED = new IntegrationStatus('COMPLETED');
    public static readonly FAILED = new IntegrationStatus('FAILED');
    public static readonly COMPENSATED = new IntegrationStatus('COMPENSATED');
    public static readonly PARTIALLY_COMPLETED = new IntegrationStatus('PARTIALLY_COMPLETED');
    public static readonly CANCELLED = new IntegrationStatus('CANCELLED');

    private constructor(public readonly value: string) { }

    equals(other: IntegrationStatus): boolean {
        return this.value === other.value;
    }

    toString(): string {
        return this.value;
    }

    static fromString(value: string): IntegrationStatus {
        const status = Object.values(IntegrationStatus)
            .find(s => s instanceof IntegrationStatus && s.value === value);

        if (!status) {
            throw new Error(`Invalid integration status: ${value}`);
        }

        return status;
    }
}