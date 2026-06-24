
import { RequestPriority } from "../enum";

// Procesar colas por prioridad (de mayor a menor)
export const priorities = [
    RequestPriority.CRITICAL,
    RequestPriority.HIGH,
    RequestPriority.MEDIUM,
    RequestPriority.LOW,
];
