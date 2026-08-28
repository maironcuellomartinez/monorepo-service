import { Result } from "@app/result";

export class DeviceType {
    private constructor(private readonly _value: string) { }

    get value(): string { return this._value; }
    toJSON() { return this._value; }

    // Debe coincidir con el vocabulario real de Device.deviceType (dispositivos
    // sincronizados vía Minerva usan LAPTOP/CELULAR/etc, no el español anterior).
    static create(value: string): Result<DeviceType> {
        const validValues = ['LAPTOP', 'CELULAR', 'TABLET', 'DESKTOP', 'IMPRESORA', 'PANTALLA', 'SIM', 'EQUIPO_SOBREMESA', 'OTRO'];
        if (!validValues.includes(value)) {
            return Result.err(new Error(`Invalid device type: ${value}`));
        }
        return Result.ok(new DeviceType(value));
    }

    equals(other: DeviceType): boolean {
        return this._value === other._value;
    }
}