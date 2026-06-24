import { Result } from "@app/result";

export class DeviceType {
    private constructor(private readonly _value: string) { }

    get value(): string { return this._value; }
    toJSON() { return this._value; }

    static create(value: string): Result<DeviceType> {
        const validValues = [
            'Portátil', 'Tableta', 'Sobremesa', 'Impresora', 'Monitor', 'Teléfono', 'Otro',
            'Equipo sobremesa', 'Portatil', 'Portatil virtual',
            'Telefono movil', 'Telefono movil virtual',
            'Puesto VDI', 'Pantalla', 'SIM',
        ];
        if (!validValues.includes(value)) {
            return Result.err(new Error(`Invalid device type: ${value}`));
        }
        return Result.ok(new DeviceType(value));
    }

    equals(other: DeviceType): boolean {
        return this._value === other._value;
    }
}